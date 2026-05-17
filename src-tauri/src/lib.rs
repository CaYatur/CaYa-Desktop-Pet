// CaYa Desktop Pet - Tauri backend entry.
//
// Sorumlulukları:
//   * Şeffaf, kenarlıksız, always-on-top bir pencere açar.
//   * Pencere konumunu/boyutunu disk üzerinde JSON olarak saklar.
//   * Frontend ile köprü kuran komutları (commands) tanımlar:
//       - load_settings / save_settings
//       - exit_app / hide_window
//       - apply_window_state / get_window_state / get_monitor_info
//       - expand_window / collapse_window (sağ tık menüsü için geçici büyütme)
//       - spawn_friend (yeni bir pet penceresi açar)
//       - close_friend (mevcut friend window'u kapatır)
//       - broadcast_pet_position (diğer pencerelere konum yayını)
//
// Çoklu pencere mimarisi:
//   * "main" pencere her zaman var.
//   * Her arkadaş için "friend-{petId}" label'lı pencere açılır.
//   * Pencereler "pet:position" event'i üzerinden konumlarını broadcast eder.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder,
};

#[cfg(windows)]
use windows::{
    core::BOOL,
    Win32::{
        Foundation::{HWND, LPARAM, RECT},
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindowRect, GetWindowTextLengthW, GetWindowTextW, IsIconic,
            IsWindowVisible, IsZoomed, SetWindowPos, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE,
            SWP_NOSIZE, SWP_NOZORDER,
        },
    },
};

const NORMAL_WINDOW_WIDTH: u32 = 176;
const NORMAL_WINDOW_HEIGHT: u32 = 176;
const PET_FRAME_SIZE: i32 = 144;
const PET_BOTTOM_PADDING: i32 = 6;

// ---- Veri tipleri ---------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            x: 1200,
            y: 600,
            width: NORMAL_WINDOW_WIDTH,
            height: NORMAL_WINDOW_HEIGHT,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopWindowInfo {
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopInfo {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub monitors: Vec<MonitorInfo>,
    pub visible_windows: Vec<DesktopWindowInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExpandedWindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub content_x: u32,
    pub content_y: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetSettings {
    #[serde(default = "default_pet")]
    pub selected_pet: String,
    #[serde(default = "default_sleep")]
    pub auto_sleep_seconds: u64,
    #[serde(default)]
    pub speech_bubble_enabled: bool,
    #[serde(default)]
    pub wander_enabled: bool,
    #[serde(default)]
    pub wander_by_window: HashMap<String, bool>,
    #[serde(default)]
    pub interactive_by_window: HashMap<String, bool>,
    #[serde(default = "default_volume")]
    pub volume: f32,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub window: WindowState,
    /// Friend pencereleri uygulama tekrar açıldığında otomatik geri açılsın diye saklanır.
    /// Map: friend label -> pet id.
    #[serde(default)]
    pub friends: HashMap<String, String>,
    /// Her pencere için aktif kozmetikler. Map: window label -> (category -> cosmetic id).
    #[serde(default)]
    pub cosmetics_by_window: HashMap<String, HashMap<String, String>>,
    /// Pet bazlı renk temaları. Map: pet id -> color theme id.
    #[serde(default)]
    pub color_theme_by_pet: HashMap<String, String>,
}

fn default_pet() -> String {
    "caya".into()
}
fn default_sleep() -> u64 {
    60
}
fn default_volume() -> f32 {
    0.6
}
fn default_theme() -> String {
    "dark".into()
}

fn compact_window_state(state: WindowState) -> WindowState {
    if state.width == NORMAL_WINDOW_WIDTH && state.height == NORMAL_WINDOW_HEIGHT {
        return state;
    }

    let visual_center_x = state.x + state.width as i32 / 2;
    let visual_center_y = if state.height > NORMAL_WINDOW_HEIGHT {
        state.y + state.height as i32 - PET_BOTTOM_PADDING - PET_FRAME_SIZE / 2
    } else {
        state.y + state.height as i32 / 2
    };

    WindowState {
        x: visual_center_x - NORMAL_WINDOW_WIDTH as i32 / 2,
        y: visual_center_y - NORMAL_WINDOW_HEIGHT as i32 / 2,
        width: NORMAL_WINDOW_WIDTH,
        height: NORMAL_WINDOW_HEIGHT,
    }
}

impl Default for PetSettings {
    fn default() -> Self {
        Self {
            selected_pet: "caya".to_string(),
            auto_sleep_seconds: 60,
            speech_bubble_enabled: false,
            wander_enabled: false,
            wander_by_window: HashMap::new(),
            interactive_by_window: HashMap::new(),
            volume: 0.6,
            theme: "dark".to_string(),
            window: WindowState::default(),
            friends: HashMap::new(),
            cosmetics_by_window: HashMap::new(),
            color_theme_by_pet: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct PetPositionEvent {
    label: String,
    pet_id: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

// ---- Disk IO --------------------------------------------------------------

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Config dir alınamadı: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Config dir oluşturulamadı: {e}"))?;
    }
    Ok(dir.join("settings.json"))
}

fn read_settings_from_disk(app: &tauri::AppHandle) -> PetSettings {
    let Ok(path) = settings_path(app) else {
        return PetSettings::default();
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return PetSettings::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn write_settings_to_disk(app: &tauri::AppHandle, settings: &PetSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Ayar serileştirilemedi: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Ayar yazılamadı: {e}"))?;
    Ok(())
}

#[cfg(windows)]
fn visible_desktop_windows() -> Vec<DesktopWindowInfo> {
    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let windows = unsafe { &mut *(lparam.0 as *mut Vec<DesktopWindowInfo>) };

        if !unsafe { IsWindowVisible(hwnd) }.as_bool() || unsafe { IsIconic(hwnd) }.as_bool() {
            return BOOL(1);
        }

        let text_len = unsafe { GetWindowTextLengthW(hwnd) };
        if text_len <= 0 {
            return BOOL(1);
        }

        let mut buffer = vec![0u16; text_len as usize + 1];
        let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };
        if copied <= 0 {
            return BOOL(1);
        }

        let title = String::from_utf16_lossy(&buffer[..copied as usize])
            .trim()
            .to_string();
        if title.is_empty() || title.contains("CaYa Desktop Pet") || title.contains("CaYa Friend") {
            return BOOL(1);
        }

        let mut rect = RECT::default();
        if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
            return BOOL(1);
        }

        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width < 120 || height < 80 {
            return BOOL(1);
        }

        windows.push(DesktopWindowInfo {
            title,
            x: rect.left,
            y: rect.top,
            width: width as u32,
            height: height as u32,
        });

        BOOL(1)
    }

    let mut windows = Vec::new();
    let ptr = &mut windows as *mut Vec<DesktopWindowInfo>;
    let _ = unsafe { EnumWindows(Some(enum_proc), LPARAM(ptr as isize)) };
    windows
}

#[cfg(not(windows))]
fn visible_desktop_windows() -> Vec<DesktopWindowInfo> {
    Vec::new()
}

#[cfg(windows)]
fn nudge_visible_desktop_window_near(
    point_x: i32,
    point_y: i32,
    radius: u32,
    delta_x: i32,
    delta_y: i32,
) -> Result<bool, String> {
    if delta_x == 0 && delta_y == 0 {
        return Ok(false);
    }

    struct NudgeSearch {
        point_x: i32,
        point_y: i32,
        radius_sq: i64,
        best: Option<(HWND, RECT, i64)>,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = unsafe { &mut *(lparam.0 as *mut NudgeSearch) };

        if !unsafe { IsWindowVisible(hwnd) }.as_bool()
            || unsafe { IsIconic(hwnd) }.as_bool()
            || unsafe { IsZoomed(hwnd) }.as_bool()
        {
            return BOOL(1);
        }

        let text_len = unsafe { GetWindowTextLengthW(hwnd) };
        if text_len <= 0 {
            return BOOL(1);
        }

        let mut buffer = vec![0u16; text_len as usize + 1];
        let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };
        if copied <= 0 {
            return BOOL(1);
        }

        let title = String::from_utf16_lossy(&buffer[..copied as usize])
            .trim()
            .to_string();
        if title.is_empty() || title.contains("CaYa Desktop Pet") || title.contains("CaYa Friend") {
            return BOOL(1);
        }

        let mut rect = RECT::default();
        if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
            return BOOL(1);
        }

        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width < 180 || height < 120 {
            return BOOL(1);
        }

        let dx = if search.point_x < rect.left {
            rect.left - search.point_x
        } else if search.point_x > rect.right {
            search.point_x - rect.right
        } else {
            0
        };
        let dy = if search.point_y < rect.top {
            rect.top - search.point_y
        } else if search.point_y > rect.bottom {
            search.point_y - rect.bottom
        } else {
            0
        };
        let dist_sq = (dx as i64 * dx as i64) + (dy as i64 * dy as i64);
        if dist_sq > search.radius_sq {
            return BOOL(1);
        }

        let replace = search
            .best
            .as_ref()
            .map(|(_, _, best_dist)| dist_sq < *best_dist)
            .unwrap_or(true);
        if replace {
            search.best = Some((hwnd, rect, dist_sq));
        }

        BOOL(1)
    }

    let radius = radius.max(24).min(160) as i64;
    let mut search = NudgeSearch {
        point_x,
        point_y,
        radius_sq: radius * radius,
        best: None,
    };
    let ptr = &mut search as *mut NudgeSearch;
    let _ = unsafe { EnumWindows(Some(enum_proc), LPARAM(ptr as isize)) };

    let Some((hwnd, rect, _)) = search.best else {
        return Ok(false);
    };

    let step_x = delta_x.clamp(-18, 18);
    let step_y = delta_y.clamp(-18, 18);
    unsafe {
        SetWindowPos(
            hwnd,
            None,
            rect.left + step_x,
            rect.top + step_y,
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS,
        )
    }
    .map_err(|e| format!("Pencere taşınamadı: {e}"))?;

    Ok(true)
}

#[cfg(not(windows))]
fn nudge_visible_desktop_window_near(
    _point_x: i32,
    _point_y: i32,
    _radius: u32,
    _delta_x: i32,
    _delta_y: i32,
) -> Result<bool, String> {
    Ok(false)
}

// ---- Genel pencere etkileşim yardımcıları ---------------------------------
//
// nudge_visible_desktop_window_near zaten kendi HWND-bulma kodunu içeriyor;
// bump/shake/hop için ayrı bir yardımcıyla en yakın pencereyi bulup arka
// planda thread::spawn ile frame frame animate ediyoruz.
//
// HWND içinde *mut c_void var, !Send. Thread'e usize (pointer'ın sayısal
// hâli) olarak geçiriyoruz; closure içinde HWND'ye geri cast ediyoruz.

#[cfg(windows)]
fn find_desktop_window_near(
    point_x: i32,
    point_y: i32,
    radius: u32,
) -> Option<(HWND, RECT)> {
    struct Search {
        point_x: i32,
        point_y: i32,
        radius_sq: i64,
        best: Option<(HWND, RECT, i64)>,
    }
    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = unsafe { &mut *(lparam.0 as *mut Search) };

        if !unsafe { IsWindowVisible(hwnd) }.as_bool()
            || unsafe { IsIconic(hwnd) }.as_bool()
            || unsafe { IsZoomed(hwnd) }.as_bool()
        {
            return BOOL(1);
        }

        let text_len = unsafe { GetWindowTextLengthW(hwnd) };
        if text_len <= 0 {
            return BOOL(1);
        }
        let mut buffer = vec![0u16; text_len as usize + 1];
        let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };
        if copied <= 0 {
            return BOOL(1);
        }
        let title = String::from_utf16_lossy(&buffer[..copied as usize])
            .trim()
            .to_string();
        if title.is_empty()
            || title.contains("CaYa Desktop Pet")
            || title.contains("CaYa Friend")
            || title.contains("CaYa Overlay")
            || title.contains("CaYa Prop")
        {
            return BOOL(1);
        }

        let mut rect = RECT::default();
        if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
            return BOOL(1);
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width < 180 || height < 120 {
            return BOOL(1);
        }

        let dx = if search.point_x < rect.left {
            rect.left - search.point_x
        } else if search.point_x > rect.right {
            search.point_x - rect.right
        } else {
            0
        };
        let dy = if search.point_y < rect.top {
            rect.top - search.point_y
        } else if search.point_y > rect.bottom {
            search.point_y - rect.bottom
        } else {
            0
        };
        let dist_sq = (dx as i64 * dx as i64) + (dy as i64 * dy as i64);
        if dist_sq > search.radius_sq {
            return BOOL(1);
        }
        let replace = search
            .best
            .as_ref()
            .map(|(_, _, best_dist)| dist_sq < *best_dist)
            .unwrap_or(true);
        if replace {
            search.best = Some((hwnd, rect, dist_sq));
        }
        BOOL(1)
    }

    let radius = (radius.max(24).min(220)) as i64;
    let mut search = Search {
        point_x,
        point_y,
        radius_sq: radius * radius,
        best: None,
    };
    let ptr = &mut search as *mut Search;
    let _ = unsafe { EnumWindows(Some(enum_proc), LPARAM(ptr as isize)) };
    search.best.map(|(h, r, _)| (h, r))
}

/// Arka plan thread'inde verilen step listesini sırayla uygulayarak pencereyi
/// frame frame animate eder. step = (base_x + ox, base_y + oy, sleep_after_ms).
#[cfg(windows)]
fn animate_window_steps(hwnd: HWND, base_x: i32, base_y: i32, steps: Vec<(i32, i32, u64)>) {
    // HWND içindeki *mut c_void Send değil — usize'a cast edip gönder, içeride
    // tekrar HWND'ye çevir.
    let hwnd_raw: usize = hwnd.0 as usize;
    std::thread::spawn(move || {
        let hwnd = HWND(hwnd_raw as *mut core::ffi::c_void);
        for (ox, oy, sleep_ms) in steps {
            unsafe {
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    base_x + ox,
                    base_y + oy,
                    0,
                    0,
                    SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS,
                );
            }
            if sleep_ms > 0 {
                std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
            }
        }
    });
}

#[cfg(windows)]
fn bump_window_near_impl(
    point_x: i32,
    point_y: i32,
    radius: u32,
    delta_x: i32,
    delta_y: i32,
) -> Result<bool, String> {
    let Some((hwnd, rect)) = find_desktop_window_near(point_x, point_y, radius) else {
        return Ok(false);
    };
    let dx = (delta_x.clamp(-80, 80)) as f64;
    let dy = (delta_y.clamp(-80, 80)) as f64;
    // Ease-out + küçük overshoot
    let frames: [(f64, u64); 6] = [
        (0.30, 18),
        (0.62, 18),
        (0.88, 18),
        (1.08, 18),
        (1.00, 24),
        (1.00, 0),
    ];
    let steps: Vec<(i32, i32, u64)> = frames
        .iter()
        .map(|(frac, dur)| ((dx * frac).round() as i32, (dy * frac).round() as i32, *dur))
        .collect();
    animate_window_steps(hwnd, rect.left, rect.top, steps);
    Ok(true)
}

#[cfg(windows)]
fn shake_window_near_impl(
    point_x: i32,
    point_y: i32,
    radius: u32,
    amplitude: i32,
    duration_ms: u64,
) -> Result<bool, String> {
    let Some((hwnd, rect)) = find_desktop_window_near(point_x, point_y, radius) else {
        return Ok(false);
    };
    let amp = amplitude.clamp(4, 40) as f64;
    let frame_ms: u64 = 28;
    let total_frames = ((duration_ms.max(220) / frame_ms) as usize).max(8);
    let mut steps: Vec<(i32, i32, u64)> = Vec::with_capacity(total_frames + 1);
    for i in 0..total_frames {
        let t = i as f64 / total_frames as f64;
        // damping (1 → 0) ile sinüs salınımı
        let damp = (1.0 - t).powf(1.3);
        let ang = t * std::f64::consts::PI * 6.0; // ~3 tam dalga
        let ox = (amp * damp * ang.sin()).round() as i32;
        // Hafif dikey jitter
        let oy = (amp * 0.18 * damp * (ang * 1.7).cos()).round() as i32;
        steps.push((ox, oy, frame_ms));
    }
    steps.push((0, 0, 0));
    animate_window_steps(hwnd, rect.left, rect.top, steps);
    Ok(true)
}

#[cfg(windows)]
fn hop_window_near_impl(
    point_x: i32,
    point_y: i32,
    radius: u32,
    height: i32,
) -> Result<bool, String> {
    let Some((hwnd, rect)) = find_desktop_window_near(point_x, point_y, radius) else {
        return Ok(false);
    };
    let h = height.clamp(8, 60) as f64;
    let frame_ms: u64 = 26;
    let frames: usize = 10;
    let mut steps: Vec<(i32, i32, u64)> = Vec::with_capacity(frames + 1);
    for i in 0..frames {
        let t = i as f64 / (frames - 1) as f64;
        // Parabolik yukarı-aşağı: y = -4h * t * (1 - t)
        let oy = -((4.0 * h * t * (1.0 - t)).round() as i32);
        steps.push((0, oy, frame_ms));
    }
    steps.push((0, 0, 0));
    animate_window_steps(hwnd, rect.left, rect.top, steps);
    Ok(true)
}

#[cfg(not(windows))]
fn bump_window_near_impl(
    _point_x: i32, _point_y: i32, _radius: u32, _delta_x: i32, _delta_y: i32,
) -> Result<bool, String> { Ok(false) }
#[cfg(not(windows))]
fn shake_window_near_impl(
    _point_x: i32, _point_y: i32, _radius: u32, _amplitude: i32, _duration_ms: u64,
) -> Result<bool, String> { Ok(false) }
#[cfg(not(windows))]
fn hop_window_near_impl(
    _point_x: i32, _point_y: i32, _radius: u32, _height: i32,
) -> Result<bool, String> { Ok(false) }

// ---- Paylaşılan durum -----------------------------------------------------

pub struct AppState {
    pub settings: Mutex<PetSettings>,
}

// ---- Tauri komutları ------------------------------------------------------

#[tauri::command]
fn load_settings(state: State<'_, AppState>) -> PetSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: PetSettings,
) -> Result<(), String> {
    let snapshot = {
        let mut guard = state.settings.lock().unwrap();
        let mut merged = settings.clone();
        merged.friends = guard.friends.clone();
        merged.wander_enabled = guard.wander_enabled;
        merged.wander_by_window = guard.wander_by_window.clone();
        merged.interactive_by_window = guard.interactive_by_window.clone();
        merged.cosmetics_by_window = guard.cosmetics_by_window.clone();
        merged.color_theme_by_pet = guard.color_theme_by_pet.clone();
        *guard = merged.clone();
        merged
    };
    write_settings_to_disk(&app, &snapshot)
}

#[tauri::command]
fn set_interactive_for_window(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    label: String,
    enabled: bool,
) -> Result<PetSettings, String> {
    let snapshot = {
        let mut guard = state.settings.lock().unwrap();
        guard.interactive_by_window.insert(label, enabled);
        guard.clone()
    };
    write_settings_to_disk(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
fn set_wander_for_window(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    label: String,
    enabled: bool,
) -> Result<PetSettings, String> {
    let snapshot = {
        let mut guard = state.settings.lock().unwrap();
        guard.wander_by_window.insert(label.clone(), enabled);
        if label == "main" {
            guard.wander_enabled = enabled;
        }
        guard.clone()
    };
    write_settings_to_disk(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
fn set_cosmetic_for_window(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    label: String,
    category: String,
    cosmetic_id: Option<String>,
) -> Result<PetSettings, String> {
    let trimmed_category = category.trim();
    if trimmed_category.is_empty() {
        return Err("Kozmetik kategorisi boş olamaz".to_string());
    }

    let snapshot = {
        let mut guard = state.settings.lock().unwrap();

        if let Some(id) = cosmetic_id {
            guard
                .cosmetics_by_window
                .entry(label.clone())
                .or_default()
                .insert(trimmed_category.to_string(), id);
        } else if let Some(window_cosmetics) = guard.cosmetics_by_window.get_mut(&label) {
            window_cosmetics.remove(trimmed_category);
            if window_cosmetics.is_empty() {
                guard.cosmetics_by_window.remove(&label);
            }
        }

        guard.clone()
    };

    write_settings_to_disk(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
fn set_color_theme_for_pet(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    pet_id: String,
    theme_id: Option<String>,
) -> Result<PetSettings, String> {
    let trimmed_pet_id = pet_id.trim();
    if trimmed_pet_id.is_empty() {
        return Err("Pet id boş olamaz".to_string());
    }

    let snapshot = {
        let mut guard = state.settings.lock().unwrap();
        match theme_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty() && *value != "default")
        {
            Some(theme) => {
                guard
                    .color_theme_by_pet
                    .insert(trimmed_pet_id.to_string(), theme.to_string());
            }
            None => {
                guard.color_theme_by_pet.remove(trimmed_pet_id);
            }
        }
        guard.clone()
    };

    write_settings_to_disk(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn apply_window_state(window: tauri::Window, x: i32, y: i32) -> Result<(), String> {
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| format!("Pencere konumu ayarlanamadı: {e}"))?;
    Ok(())
}

#[tauri::command]
fn get_window_state(window: tauri::Window) -> Result<WindowState, String> {
    let pos = window
        .outer_position()
        .map_err(|e| format!("Konum okunamadı: {e}"))?;
    let size = window
        .inner_size()
        .map_err(|e| format!("Boyut okunamadı: {e}"))?;
    Ok(WindowState {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
    })
}

#[tauri::command]
fn get_monitor_info(window: tauri::Window) -> Result<MonitorInfo, String> {
    // current_monitor() pencerenin bulunduğu ekranı döner.
    let monitor = window
        .current_monitor()
        .map_err(|e| format!("Monitor sorgulanamadı: {e}"))?
        .ok_or_else(|| "Aktif monitor bulunamadı".to_string())?;
    let pos = monitor.position();
    let size = monitor.size();
    Ok(MonitorInfo {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        scale_factor: monitor.scale_factor(),
    })
}

#[tauri::command]
fn get_desktop_info(window: tauri::Window) -> Result<DesktopInfo, String> {
    let monitors = window
        .available_monitors()
        .map_err(|e| format!("Monitor listesi okunamadı: {e}"))?;

    let mut mapped = Vec::new();
    for monitor in monitors {
        let pos = monitor.position();
        let size = monitor.size();
        mapped.push(MonitorInfo {
            x: pos.x,
            y: pos.y,
            width: size.width,
            height: size.height,
            scale_factor: monitor.scale_factor(),
        });
    }

    if mapped.is_empty() {
        mapped.push(get_monitor_info(window)?);
    }

    let min_x = mapped.iter().map(|m| m.x).min().unwrap_or(0);
    let min_y = mapped.iter().map(|m| m.y).min().unwrap_or(0);
    let max_x = mapped
        .iter()
        .map(|m| m.x + m.width as i32)
        .max()
        .unwrap_or(NORMAL_WINDOW_WIDTH as i32);
    let max_y = mapped
        .iter()
        .map(|m| m.y + m.height as i32)
        .max()
        .unwrap_or(NORMAL_WINDOW_HEIGHT as i32);

    Ok(DesktopInfo {
        x: min_x,
        y: min_y,
        width: (max_x - min_x).max(NORMAL_WINDOW_WIDTH as i32) as u32,
        height: (max_y - min_y).max(NORMAL_WINDOW_HEIGHT as i32) as u32,
        monitors: mapped,
        visible_windows: visible_desktop_windows(),
    })
}

#[tauri::command]
fn nudge_desktop_window_near(
    point_x: i32,
    point_y: i32,
    radius: u32,
    delta_x: i32,
    delta_y: i32,
) -> Result<bool, String> {
    nudge_visible_desktop_window_near(point_x, point_y, radius, delta_x, delta_y)
}

/// Pencereyi yumuşak, ease-out + küçük overshoot ile verilen yönde
/// daha büyük bir hamle yaptırır. Pet'in pencereyi "tokatlaması" gibi.
#[tauri::command]
fn bump_desktop_window_near(
    point_x: i32,
    point_y: i32,
    radius: u32,
    delta_x: i32,
    delta_y: i32,
) -> Result<bool, String> {
    bump_window_near_impl(point_x, point_y, radius, delta_x, delta_y)
}

/// Pencereyi sönümlenen bir sinüs ile yatayda sallar (hafif dikey jitter).
#[tauri::command]
fn shake_desktop_window_near(
    point_x: i32,
    point_y: i32,
    radius: u32,
    amplitude: i32,
    duration_ms: u64,
) -> Result<bool, String> {
    shake_window_near_impl(point_x, point_y, radius, amplitude, duration_ms)
}

/// Pencereyi parabolik bir yörüngede yukarı zıplatıp eski yerine indirir.
#[tauri::command]
fn hop_desktop_window_near(
    point_x: i32,
    point_y: i32,
    radius: u32,
    height: i32,
) -> Result<bool, String> {
    hop_window_near_impl(point_x, point_y, radius, height)
}

#[tauri::command]
fn toggle_click_through(window: tauri::Window, ignore: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| format!("Cursor ignore set edilemedi: {e}"))?;
    Ok(())
}

/// Menü açıldığında pencereyi yukarı doğru genişlet — menünün taşmasını engeller.
/// Pet'in mevcut konumunu sabit tutmak için pencereyi üst tarafa doğru büyütürüz:
/// y'yi yukarı kaydırıp height'i artırırız.
#[tauri::command]
fn expand_window(
    window: tauri::Window,
    extra_height: u32,
    extra_width: u32,
) -> Result<ExpandedWindowState, String> {
    let pos = window
        .outer_position()
        .map_err(|e| format!("Konum okunamadı: {e}"))?;
    let size = window
        .inner_size()
        .map_err(|e| format!("Boyut okunamadı: {e}"))?;
    let monitor = window
        .current_monitor()
        .map_err(|e| format!("Monitor sorgulanamadı: {e}"))?
        .ok_or_else(|| "Aktif monitor bulunamadı".to_string())?;
    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();

    let monitor_left = monitor_pos.x;
    let monitor_top = monitor_pos.y;
    let monitor_right = monitor_left + monitor_size.width as i32;
    let monitor_bottom = monitor_top + monitor_size.height as i32;

    let space_left = (pos.x - monitor_left).max(0) as u32;
    let space_right = (monitor_right - (pos.x + size.width as i32)).max(0) as u32;
    let space_top = (pos.y - monitor_top).max(0) as u32;
    let space_bottom = (monitor_bottom - (pos.y + size.height as i32)).max(0) as u32;

    // Menü normalde pet'in üstüne ve sağına açılır; alan yoksa ters yöne büyüt.
    let grow_top = extra_height.min(space_top);
    let grow_bottom = (extra_height - grow_top).min(space_bottom);
    let grow_right = extra_width.min(space_right);
    let grow_left = (extra_width - grow_right).min(space_left);

    let new_w = size.width + grow_left + grow_right;
    let new_h = size.height + grow_top + grow_bottom;
    let new_x = pos.x - grow_left as i32;
    let new_y = pos.y - grow_top as i32;

    window
        .set_size(PhysicalSize::new(new_w, new_h))
        .map_err(|e| format!("Boyut ayarlanamadı: {e}"))?;
    window
        .set_position(PhysicalPosition::new(new_x, new_y))
        .map_err(|e| format!("Konum ayarlanamadı: {e}"))?;

    Ok(ExpandedWindowState {
        x: new_x,
        y: new_y,
        width: new_w,
        height: new_h,
        content_x: grow_left,
        content_y: grow_top,
    })
}

/// expand_window'un tersi — pencereyi pet'in eski boyutuna döndürür.
#[tauri::command]
fn set_window_size(
    window: tauri::Window,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    window
        .set_size(PhysicalSize::new(width, height))
        .map_err(|e| format!("Boyut ayarlanamadı: {e}"))?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| format!("Konum ayarlanamadı: {e}"))?;
    Ok(())
}

/// Yeni bir arkadaş penceresi açar. Frontend, label/petId'yi window.label()
/// üzerinden veya URL query'sinden okur.
#[tauri::command]
async fn spawn_friend(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    pet_id: String,
) -> Result<String, String> {
    // Aynı pet ID için zaten açık bir pencere varsa onu öne getir.
    let label = format!("friend-{}", pet_id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return Ok(label);
    }

    // Yeni pencere — ana pencere yanında bir yere konumlandır.
    let main_state = if let Some(main) = app.get_webview_window("main") {
        let pos = main.outer_position().ok();
        let size = main.inner_size().ok();
        match (pos, size) {
            (Some(p), Some(s)) => Some((p.x, p.y, s.width, s.height)),
            _ => None,
        }
    } else {
        None
    };

    let (x, y, _w, _h) =
        main_state.unwrap_or((400, 400, NORMAL_WINDOW_WIDTH, NORMAL_WINDOW_HEIGHT));
    let w = NORMAL_WINDOW_WIDTH;
    let h = NORMAL_WINDOW_HEIGHT;
    // Ana pencerenin sağına 60px boşlukla aç.
    let spawn_x = x + w as i32 + 60;
    let spawn_y = y;

    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("CaYa Friend")
        .inner_size(w as f64, h as f64)
        .position(spawn_x as f64, spawn_y as f64)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .shadow(false)
        .visible(true);

    builder
        .build()
        .map_err(|e| format!("Friend pencere açılamadı: {e}"))?;

    // settings.friends'e ekle ve diske yaz.
    {
        let mut guard = state.settings.lock().unwrap();
        guard.friends.insert(label.clone(), pet_id.clone());
        let snapshot = guard.clone();
        drop(guard);
        let _ = write_settings_to_disk(&app, &snapshot);
    }

    Ok(label)
}

#[tauri::command]
fn close_friend(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    label: String,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.close();
    }
    let mut guard = state.settings.lock().unwrap();
    guard.friends.remove(&label);
    guard.wander_by_window.remove(&label);
    guard.interactive_by_window.remove(&label);
    let snapshot = guard.clone();
    drop(guard);
    let _ = write_settings_to_disk(&app, &snapshot);
    let _ = app.emit("pet:friend-closed", label);
    Ok(())
}

/// Her pet, kendi konumunu diğer pencerelere yayınlar.
/// Receiver'lar "pet:position" event'ini dinler ve kendi konumlarıyla karşılaştırır.
#[tauri::command]
fn broadcast_pet_position(
    app: tauri::AppHandle,
    label: String,
    pet_id: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let payload = PetPositionEvent {
        label,
        pet_id,
        x,
        y,
        width,
        height,
    };
    app.emit("pet:position", payload)
        .map_err(|e| format!("Emit hatası: {e}"))?;
    Ok(())
}

#[tauri::command]
fn list_friends(state: State<'_, AppState>) -> HashMap<String, String> {
    state.settings.lock().unwrap().friends.clone()
}

// ---- Pet Special Actions / Pet World Effects: Overlay window komutları ---
//
// spawn_overlay_window: Şeffaf, click-through, always-on-top, kenarlıksız
//   bir pencere açar; aktif monitörü tamamen kaplar. Pencere index.html'i
//   query string ile yükler (overlay=1&effect=...&duration=...). Frontend
//   tarafında main.tsx bu query'i görünce OverlayApp'i mount eder ve süre
//   bitince pencereyi kendi kendine kapatır. Güvence olarak Rust tarafında
//   da extra bir watchdog thread süre+buffer sonra pencereyi kapatmaya
//   çalışır.
//
// close_overlay_window: Frontend tarafından "vakit dolmadan" iptal için.

fn current_millis() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn sanitize_label_part(input: &str) -> String {
    // Tauri pencere label'ları yalnızca alfanümerik + '-' '/' ':' '_' kabul
    // eder. Bizim aksiyon ID'lerimiz "caya.matrixCodeRain" gibi nokta
    // içerdiği için noktayı da '_' ile değiştiriyoruz.
    input
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

/// Pet pencerelerini (main + friend-*) overlay ya da prop pencerelerinin
/// üzerine çıkartır. Windows tarafında SetWindowPos(HWND_TOPMOST) çağrısı
/// pencereyi diğer TOPMOST pencerelerin üstüne raise eder.
fn raise_pet_windows_now(app: &tauri::AppHandle) {
    for (label, window) in app.webview_windows() {
        if label == "main" || label.starts_with("friend-") {
            let _ = window.set_always_on_top(true);
        }
    }
}

/// Hemen + kısa süre sonra iki kere raise eder; yeni mount edilen yardımcı
/// pencerelerin pet'i geçici olarak örtmesini engeller.
fn raise_pet_windows_deferred(app: &tauri::AppHandle) {
    raise_pet_windows_now(app);
    let app_clone = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        raise_pet_windows_now(&app_clone);
        std::thread::sleep(std::time::Duration::from_millis(300));
        raise_pet_windows_now(&app_clone);
    });
}

#[tauri::command]
fn raise_pet_windows(app: tauri::AppHandle) -> Result<(), String> {
    raise_pet_windows_now(&app);
    Ok(())
}

#[tauri::command]
async fn spawn_overlay_window(
    app: tauri::AppHandle,
    effect: String,
    duration_ms: u64,
    pet_id: Option<String>,
) -> Result<String, String> {
    // Pencere LABEL'ı için sanitize (nokta vs. yasak). URL'de ise orijinal
    // ID'yi göndereceğiz ki frontend findSpecialAction ile bulabilsin.
    let safe_effect: String = sanitize_label_part(&effect);
    let label = format!("overlay-{}-{}", safe_effect, current_millis());

    // Aktif monitörü bul — varsa main pencerenin, yoksa herhangi bir mevcut pencerenin
    // current_monitor()'ını kullan.
    let reference_window = app
        .get_webview_window("main")
        .or_else(|| {
            // Açık herhangi bir pencereyi al.
            app.webview_windows().into_iter().next().map(|(_, w)| w)
        })
        .ok_or_else(|| "Referans pencere bulunamadı".to_string())?;

    let monitor = reference_window
        .current_monitor()
        .map_err(|e| format!("Monitor sorgulanamadı: {e}"))?
        .ok_or_else(|| "Aktif monitor bulunamadı".to_string())?;
    let mpos = monitor.position();
    let msize = monitor.size();
    let scale = monitor.scale_factor().max(1.0);

    // WebviewWindowBuilder inner_size logical piksel ister — fiziksel boyutu
    // scale_factor ile bölelim.
    let logical_w = (msize.width as f64) / scale;
    let logical_h = (msize.height as f64) / scale;

    let pet_param = pet_id
        .as_deref()
        .map(|p| format!("&pet={}", p))
        .unwrap_or_default();
    let url = format!(
        "index.html?overlay=1&effect={}&duration={}{}",
        effect, duration_ms, pet_param
    );

    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("CaYa Overlay")
        .inner_size(logical_w, logical_h)
        .position(mpos.x as f64, mpos.y as f64)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .shadow(false)
        .focused(false)
        .visible(true);

    let window = builder
        .build()
        .map_err(|e| format!("Overlay pencere açılamadı: {e}"))?;

    // Tıklamalar overlay'i geçsin, masaüstüne ulaşsın.
    let _ = window.set_ignore_cursor_events(true);
    // Boyutu fiziksel piksel cinsinden monitör boyutuyla sabitle (DPI scaling
    // farklarına karşı güvence).
    let _ = window.set_size(PhysicalSize::new(msize.width, msize.height));
    let _ = window.set_position(PhysicalPosition::new(mpos.x, mpos.y));

    // Watchdog: süre + 2sn buffer sonra hâlâ açıksa kapat. Frontend zaten
    // kapatmayı dener; bu sadece güvenlik ağı.
    let app_clone = app.clone();
    let label_clone = label.clone();
    let delay = std::time::Duration::from_millis(duration_ms + 2000);
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        if let Some(win) = app_clone.get_webview_window(&label_clone) {
            let _ = win.close();
        }
    });

    Ok(label)
}

#[tauri::command]
fn close_overlay_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.close();
    }
    Ok(())
}

/// Tüm monitörlere ayrı overlay pencereleri açar. Matrix Code Rain gibi
/// efektlerin gerçekten tüm ekranları kaplaması için kullanılır.
#[tauri::command]
async fn spawn_overlay_windows_all_monitors(
    app: tauri::AppHandle,
    effect: String,
    duration_ms: u64,
    pet_id: Option<String>,
) -> Result<Vec<String>, String> {
    let safe_effect = sanitize_label_part(&effect);

    let reference_window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_iter().next().map(|(_, w)| w))
        .ok_or_else(|| "Referans pencere bulunamadı".to_string())?;

    let monitors = reference_window
        .available_monitors()
        .map_err(|e| format!("Monitor listesi okunamadı: {e}"))?;

    let monitors = if monitors.is_empty() {
        vec![reference_window
            .current_monitor()
            .map_err(|e| format!("Monitor sorgulanamadı: {e}"))?
            .ok_or_else(|| "Aktif monitor bulunamadı".to_string())?]
    } else {
        monitors
    };

    let base_ts = current_millis();
    let mut labels: Vec<String> = Vec::new();
    let pet_param = pet_id
        .as_deref()
        .map(|p| format!("&pet={}", p))
        .unwrap_or_default();

    for (idx, monitor) in monitors.iter().enumerate() {
        let mpos = monitor.position();
        let msize = monitor.size();
        let scale = monitor.scale_factor().max(1.0);
        let logical_w = (msize.width as f64) / scale;
        let logical_h = (msize.height as f64) / scale;

        let label = format!("overlay-{}-{}-{}", safe_effect, base_ts, idx);
        let url = format!(
            "index.html?overlay=1&effect={}&duration={}{}",
            effect, duration_ms, pet_param
        );

        let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
            .title("CaYa Overlay")
            .inner_size(logical_w, logical_h)
            .position(mpos.x as f64, mpos.y as f64)
            .transparent(true)
            .decorations(false)
            .always_on_top(true)
            .resizable(false)
            .skip_taskbar(true)
            .shadow(false)
            .focused(false)
            .visible(true);

        let window = match builder.build() {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Overlay pencere ({}) açılamadı: {e}", label);
                continue;
            }
        };

        let _ = window.set_ignore_cursor_events(true);
        let _ = window.set_size(PhysicalSize::new(msize.width, msize.height));
        let _ = window.set_position(PhysicalPosition::new(mpos.x, mpos.y));

        labels.push(label.clone());

        // Watchdog: süre + 2sn sonra hâlâ açıksa kapat.
        let app_clone = app.clone();
        let label_clone = label.clone();
        let delay = std::time::Duration::from_millis(duration_ms + 2000);
        std::thread::spawn(move || {
            std::thread::sleep(delay);
            if let Some(win) = app_clone.get_webview_window(&label_clone) {
                let _ = win.close();
            }
        });
    }

    // Pet'leri overlay'in üstüne çıkar — efektlerin altında kalmasınlar.
    raise_pet_windows_deferred(&app);

    Ok(labels)
}

/// Pet'in yanında, ayrı bir küçük, şeffaf, click-through ve always-on-top
/// pencere açar. PropWindowApp (index.html?prop=1&id=...) yüklenir, kendi
/// görselini render eder, süresi bitince pencereyi kendi kendine kapatır.
#[tauri::command]
async fn spawn_prop_window(
    app: tauri::AppHandle,
    prop_id: String,
    duration_ms: u64,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    // Pencere label'ı için sanitize; URL'de ise orijinal ID kullanılır
    // (frontend findSpecialAction "caya.miniComputer" gibi noktayı bekler).
    let safe_id = sanitize_label_part(&prop_id);
    let label = format!("prop-{}-{}", safe_id, current_millis());

    // Pet penceresinin ölçek faktörünü referans alalım (HiDPI doğru olsun).
    let reference_window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_iter().next().map(|(_, w)| w));
    let scale = reference_window
        .as_ref()
        .and_then(|w| w.current_monitor().ok().flatten().map(|m| m.scale_factor()))
        .unwrap_or(1.0)
        .max(1.0);

    let logical_w = (width as f64) / scale;
    let logical_h = (height as f64) / scale;
    let logical_x = (x as f64) / scale;
    let logical_y = (y as f64) / scale;

    let url = format!(
        "index.html?prop=1&id={}&duration={}",
        prop_id, duration_ms
    );

    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("CaYa Prop")
        .inner_size(logical_w, logical_h)
        .position(logical_x, logical_y)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .shadow(false)
        .focused(false)
        .visible(true);

    let window = builder
        .build()
        .map_err(|e| format!("Prop pencere açılamadı: {e}"))?;

    // Tıklamalar prop'u geçsin → masaüstüne ulaşsın.
    let _ = window.set_ignore_cursor_events(true);
    // Fiziksel pikselle kesinleştir.
    let _ = window.set_size(PhysicalSize::new(width, height));
    let _ = window.set_position(PhysicalPosition::new(x, y));

    // Pet'leri üste çıkar (hemen + birkaç frame sonra tekrar).
    raise_pet_windows_deferred(&app);

    // Watchdog.
    let app_clone = app.clone();
    let label_clone = label.clone();
    let delay = std::time::Duration::from_millis(duration_ms + 2000);
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        if let Some(win) = app_clone.get_webview_window(&label_clone) {
            let _ = win.close();
        }
    });

    Ok(label)
}

#[tauri::command]
fn close_prop_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.close();
    }
    Ok(())
}

#[tauri::command]
fn update_prop_window_position(
    app: tauri::AppHandle,
    label: String,
    x: i32,
    y: i32,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
    Ok(())
}

// ---- Uygulama açılışı -----------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let mut settings = read_settings_from_disk(&app.handle());
            settings.window = compact_window_state(settings.window.clone());

            if let Some(window) = app.get_webview_window("main") {
                let _ = window
                    .set_position(PhysicalPosition::new(settings.window.x, settings.window.y));
                let _ = window.set_size(PhysicalSize::new(
                    settings.window.width,
                    settings.window.height,
                ));
                let _ = window.set_always_on_top(true);
                let _ = window.set_skip_taskbar(true);
            }

            app.manage(AppState {
                settings: Mutex::new(settings.clone()),
            });

            // Önceden açılmış arkadaşları geri yükle.
            let friends_snapshot = settings.friends.clone();
            let app_handle = app.handle().clone();
            for (idx, (label, _pet_id)) in friends_snapshot.into_iter().enumerate() {
                if app_handle.get_webview_window(&label).is_some() {
                    continue;
                }
                let spawn_x =
                    settings.window.x + ((NORMAL_WINDOW_WIDTH + 52) as i32 * (idx as i32 + 1));
                let spawn_y = settings.window.y;
                let url = WebviewUrl::App("index.html".into());
                let _ = WebviewWindowBuilder::new(&app_handle, &label, url)
                    .title("CaYa Friend")
                    .inner_size(NORMAL_WINDOW_WIDTH as f64, NORMAL_WINDOW_HEIGHT as f64)
                    .position(spawn_x as f64, spawn_y as f64)
                    .transparent(true)
                    .decorations(false)
                    .always_on_top(true)
                    .resizable(false)
                    .skip_taskbar(true)
                    .shadow(false)
                    .visible(true)
                    .build();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            set_wander_for_window,
            set_interactive_for_window,
            set_cosmetic_for_window,
            set_color_theme_for_pet,
            exit_app,
            apply_window_state,
            get_window_state,
            get_monitor_info,
            get_desktop_info,
            nudge_desktop_window_near,
            bump_desktop_window_near,
            shake_desktop_window_near,
            hop_desktop_window_near,
            toggle_click_through,
            expand_window,
            set_window_size,
            spawn_friend,
            close_friend,
            broadcast_pet_position,
            list_friends,
            spawn_overlay_window,
            close_overlay_window,
            spawn_overlay_windows_all_monitors,
            spawn_prop_window,
            close_prop_window,
            update_prop_window_position,
            raise_pet_windows
        ])
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması başlatılırken hata oluştu.");
}
