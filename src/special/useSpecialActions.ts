// special/useSpecialActions.ts
// -----------------------------------------------------------------------------
// Pet'in özel eylem (Pet Props + Fullscreen Effects) yaşam döngüsünü yöneten
// merkezi orkestratör.
//
// YENİ MİMARİ:
//   * Prop'lar ayrı Tauri pencerelerinde açılır (spawn_prop_window).
//   * Fullscreen efektler tüm monitörlerde açılır
//     (spawn_overlay_windows_all_monitors).
//   * Açılan tüm yardımcı pencereler için pet pencereleri yeniden always-on-
//     top yapılır (raise_pet_windows) → pet'ler hep üstte kalır.
//   * Aktif prop pencerelerinin konumu pet hareketine göre güncellenir
//     (update_prop_window_position).
//   * Tüm timer/interval ve açık pencereler unmount'ta temizlenir.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  findSpecialAction,
  getActionsForPet,
  SPECIAL_ACTIONS
} from "./registry";
import {
  isActionAutoEnabled,
  loadSpecialSettings,
  saveSpecialSettings,
  setActionEnabled,
  setGlobalEnabled,
  setPetEnabled
} from "./specialStorage";
import type {
  PetAutoSpecialConfig,
  SpecialActionId,
  SpecialActionsSettings,
  SpecialPetId
} from "./types";

const AUTO_TICK_MS = 8000;
const AUTO_TICK_JITTER_MS = 6000;
const AUTO_TRIGGER_CHANCE = 0.35;
const PROP_FOLLOW_INTERVAL_MS = 90;

interface Args {
  petId: SpecialPetId;
  busy: boolean;
}

interface ActivePropWindow {
  id: SpecialActionId;
  label: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  expiresAt: number;
}

export interface SpecialActionsApi {
  /** O an aktif olan prop eylem id'leri (UI işaretçileri için). */
  activeProps: SpecialActionId[];
  /** O an aktif fullscreen efekt id'si. */
  activeFullscreen: SpecialActionId | null;
  /** Manuel ya da otomatik tetik. */
  trigger: (id: SpecialActionId, opts?: { manual?: boolean }) => boolean;
  settings: SpecialActionsSettings;
  setGlobalAutoEnabled: (enabled: boolean) => void;
  setPetAutoEnabled: (enabled: boolean) => void;
  setActionAutoEnabled: (id: SpecialActionId, enabled: boolean) => void;
}

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MonitorInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
}

interface DesktopInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  monitors: MonitorInfo[];
}

function pickWeighted<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

export function useSpecialActions({ petId, busy }: Args): SpecialActionsApi {
  const [settings, setSettingsState] = useState<SpecialActionsSettings>(() =>
    loadSpecialSettings()
  );
  const [activeProps, setActiveProps] = useState<SpecialActionId[]>([]);
  const [activeFullscreen, setActiveFullscreen] = useState<SpecialActionId | null>(
    null
  );

  const cooldownsRef = useRef<Map<SpecialActionId, number>>(new Map());
  const busyRef = useRef(busy);
  const settingsRef = useRef(settings);
  const petIdRef = useRef(petId);
  // Açık prop pencereleri (frontend tarafından izlenir).
  const propWindowsRef = useRef<ActivePropWindow[]>([]);
  // Açık fullscreen overlay etiketleri.
  const overlayLabelsRef = useRef<string[]>([]);
  const fullscreenTimerRef = useRef<number | null>(null);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    petIdRef.current = petId;
  }, [petId]);

  // -- settings persist + setters ------------------------------------------
  const persist = useCallback((next: SpecialActionsSettings) => {
    settingsRef.current = next;
    setSettingsState(next);
    saveSpecialSettings(next);
  }, []);

  const setGlobalAutoEnabled = useCallback(
    (enabled: boolean) => persist(setGlobalEnabled(settingsRef.current, enabled)),
    [persist]
  );
  const setPetAutoEnabled = useCallback(
    (enabled: boolean) =>
      persist(setPetEnabled(settingsRef.current, petIdRef.current, enabled)),
    [persist]
  );
  const setActionAutoEnabled = useCallback(
    (id: SpecialActionId, enabled: boolean) =>
      persist(
        setActionEnabled(settingsRef.current, petIdRef.current, id, enabled)
      ),
    [persist]
  );

  // -- Pet pencere konumunu oku --------------------------------------------
  const fetchPetWindow = useCallback(async (): Promise<WindowState | null> => {
    try {
      const s = await invoke<WindowState>("get_window_state");
      return s;
    } catch {
      return null;
    }
  }, []);

  // Pet'in bulunduğu monitörü tahmin et — prop pencerelerini buna göre
  // clamp etmek için kullanılır (ekran kenarında kesilmesin).
  const fetchActiveMonitor = useCallback(
    async (cx: number, cy: number): Promise<MonitorInfo | null> => {
      try {
        const desk = await invoke<DesktopInfo>("get_desktop_info");
        const monitors = desk.monitors ?? [];
        if (monitors.length === 0) return null;
        const inside = monitors.find(
          (m) => cx >= m.x && cx < m.x + m.width && cy >= m.y && cy < m.y + m.height
        );
        return inside ?? monitors[0];
      } catch {
        return null;
      }
    },
    []
  );

  // -- Prop window spawn ---------------------------------------------------
  const spawnProp = useCallback(
    async (id: SpecialActionId): Promise<boolean> => {
      const meta = findSpecialAction(id);
      if (!meta) return false;
      const w = meta.propWindowWidth ?? 140;
      const h = meta.propWindowHeight ?? 140;
      const offX = meta.propAnchorOffsetX ?? 0;
      const offY = meta.propAnchorOffsetY ?? 0;

      const pet = await fetchPetWindow();
      if (!pet) return false;

      const cx = pet.x + pet.width / 2;
      const cy = pet.y + pet.height / 2;
      let propX = Math.round(cx + offX - w / 2);
      let propY = Math.round(cy + offY - h / 2);

      // Aktif monitör sınırlarına clamp et — pet ekran kenarındayken
      // prop dışarı sarkmasın/kesilmesin.
      const monitor = await fetchActiveMonitor(cx, cy);
      if (monitor) {
        const minX = monitor.x + 4;
        const minY = monitor.y + 4;
        const maxX = monitor.x + monitor.width - w - 4;
        const maxY = monitor.y + monitor.height - h - 4;
        propX = Math.max(minX, Math.min(maxX, propX));
        propY = Math.max(minY, Math.min(maxY, propY));
      }

      try {
        const label = await invoke<string>("spawn_prop_window", {
          propId: id,
          durationMs: meta.durationMs,
          x: propX,
          y: propY,
          width: w,
          height: h
        });
        propWindowsRef.current.push({
          id,
          label,
          width: w,
          height: h,
          offsetX: offX,
          offsetY: offY,
          expiresAt: Date.now() + meta.durationMs + 400
        });
        setActiveProps([...new Set(propWindowsRef.current.map((p) => p.id))]);

        // pet-mod (Portal Jump): pet'i biraz ışınla. Görsel portal kapanmadan
        // önce tetikle, pet portal görünürken yer değiştirsin.
        if (meta.scope === "pet-mod" && id === "cube.portalJump") {
          window.setTimeout(async () => {
            try {
              const cur = await invoke<WindowState>("get_window_state");
              const dx = (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 80);
              const dy = (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 60);
              await invoke("apply_window_state", {
                x: Math.max(0, cur.x + Math.round(dx)),
                y: Math.max(0, cur.y + Math.round(dy))
              });
            } catch {
              /* yut */
            }
          }, 700);
        }
        return true;
      } catch (e) {
        console.warn("spawn_prop_window failed:", e);
        return false;
      }
    },
    [fetchPetWindow, fetchActiveMonitor]
  );

  // -- Fullscreen window spawn (TÜM monitörler) ----------------------------
  const triggerFullscreen = useCallback(
    async (id: SpecialActionId, durationMs: number): Promise<boolean> => {
      if (activeFullscreen) return false;
      setActiveFullscreen(id);
      let labels: string[] = [];
      try {
        labels =
          (await invoke<string[]>("spawn_overlay_windows_all_monitors", {
            effect: id,
            durationMs,
            petId: petIdRef.current
          })) ?? [];
      } catch (e) {
        console.warn("spawn_overlay_windows_all_monitors failed:", e);
        setActiveFullscreen(null);
        return false;
      }
      if (labels.length === 0) {
        // Hiçbir monitörde pencere açılamadıysa state'i bırak ki tekrar
        // denenebilsin.
        console.warn("overlay spawn returned 0 windows");
        setActiveFullscreen(null);
        return false;
      }
      overlayLabelsRef.current = [...overlayLabelsRef.current, ...labels];

      // Güvence: süre+1.5s sonra state'i serbest bırak.
      if (fullscreenTimerRef.current != null) {
        window.clearTimeout(fullscreenTimerRef.current);
      }
      fullscreenTimerRef.current = window.setTimeout(() => {
        setActiveFullscreen(null);
        for (const label of overlayLabelsRef.current) {
          invoke("close_overlay_window", { label }).catch(() => {});
        }
        overlayLabelsRef.current = [];
        fullscreenTimerRef.current = null;
      }, durationMs + 1500);
      return true;
    },
    [activeFullscreen]
  );

  // -- trigger -------------------------------------------------------------
  const trigger = useCallback(
    (id: SpecialActionId, opts?: { manual?: boolean }): boolean => {
      const meta = findSpecialAction(id);
      if (!meta) return false;
      if (meta.pet !== petIdRef.current) return false;
      if (busyRef.current && !opts?.manual) return false;

      const now = Date.now();
      const cooldownUntil = cooldownsRef.current.get(id) ?? 0;
      // Manuel çağrıda cooldown'u atla — "şu an aktif mi?" kontrolü aşağıda.
      // Otomatik tetiklemede tam cooldown uygulanır.
      if (!opts?.manual && now < cooldownUntil) return false;

      // Pre-emptive olarak küçük bir cooldown koy ki double-click anında
      // iki spawn'ı tetiklemesin. Spawn başarısız olursa bunu sıfırlayacağız;
      // başarılıysa tam cooldown'a yükselteceğiz.
      cooldownsRef.current.set(id, now + 500);

      const finalize = (ok: boolean) => {
        if (ok) {
          // Manuel çağrıda efekt bitince hemen tekrar tetiklenebilsin;
          // sadece double-spawn'ı önlemek için kısa bir buffer yeterli.
          const cd = opts?.manual ? meta.durationMs + 300 : meta.cooldownMs;
          cooldownsRef.current.set(id, Date.now() + cd);
        } else {
          // Başarısızsa cooldown'u kaldır → kullanıcı hemen yeniden deneyebilsin.
          cooldownsRef.current.delete(id);
        }
      };

      if (meta.scope === "fullscreen") {
        if (activeFullscreen) {
          cooldownsRef.current.delete(id);
          return false;
        }
        void triggerFullscreen(id, meta.durationMs).then(finalize);
        return true;
      }

      // prop / pet-mod
      const alreadyActive = propWindowsRef.current.some((p) => p.id === id);
      if (alreadyActive) {
        cooldownsRef.current.delete(id);
        return false;
      }
      void spawnProp(id).then(finalize);
      return true;
    },
    [triggerFullscreen, spawnProp, activeFullscreen]
  );

  // -- Auto-trigger loop ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const schedule = () => {
      if (cancelled) return;
      const delay = AUTO_TICK_MS + Math.random() * AUTO_TICK_JITTER_MS;
      timer = window.setTimeout(tick, delay);
    };

    const tick = () => {
      timer = null;
      if (cancelled) return;
      const s = settingsRef.current;
      const pid = petIdRef.current;

      if (!s.globalEnabled || !s.pets[pid].enabled) {
        schedule();
        return;
      }
      if (busyRef.current) {
        schedule();
        return;
      }
      if (Math.random() > AUTO_TRIGGER_CHANCE) {
        schedule();
        return;
      }

      const candidates = getActionsForPet(pid).filter((meta) => {
        if (!isActionAutoEnabled(s, pid, meta.id, meta.defaultAuto)) return false;
        const cd = cooldownsRef.current.get(meta.id) ?? 0;
        if (Date.now() < cd) return false;
        if (meta.scope === "fullscreen" && activeFullscreen) return false;
        return true;
      });

      const choice = pickWeighted(candidates);
      if (choice) {
        trigger(choice.id, { manual: false });
      }
      schedule();
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [trigger, activeFullscreen]);

  // -- Aktif prop pencereler: pet'i takip et + bittiğinde state'ten düşür --
  useEffect(() => {
    const interval = window.setInterval(async () => {
      // Süresi geçen prop'ları state'ten kaldır (pencere zaten kendi kapanır).
      const now = Date.now();
      const stillActive = propWindowsRef.current.filter((p) => now < p.expiresAt);
      if (stillActive.length !== propWindowsRef.current.length) {
        propWindowsRef.current = stillActive;
        setActiveProps([...new Set(stillActive.map((p) => p.id))]);
      }
      if (stillActive.length === 0) return;

      // Pet konumunu al, prop'ları takip ettir.
      const pet = await fetchPetWindow();
      if (!pet) return;
      const cx = pet.x + pet.width / 2;
      const cy = pet.y + pet.height / 2;
      for (const pw of stillActive) {
        const x = Math.round(cx + pw.offsetX - pw.width / 2);
        const y = Math.round(cy + pw.offsetY - pw.height / 2);
        invoke("update_prop_window_position", { label: pw.label, x, y }).catch(
          () => {}
        );
      }
    }, PROP_FOLLOW_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchPetWindow]);

  // -- Cleanup on unmount --------------------------------------------------
  useEffect(
    () => () => {
      if (fullscreenTimerRef.current != null) {
        window.clearTimeout(fullscreenTimerRef.current);
      }
      for (const label of overlayLabelsRef.current) {
        invoke("close_overlay_window", { label }).catch(() => {});
      }
      for (const pw of propWindowsRef.current) {
        invoke("close_prop_window", { label: pw.label }).catch(() => {});
      }
      overlayLabelsRef.current = [];
      propWindowsRef.current = [];
    },
    []
  );

  return {
    activeProps,
    activeFullscreen,
    trigger,
    settings,
    setGlobalAutoEnabled,
    setPetAutoEnabled,
    setActionAutoEnabled
  };
}

/** Pet için, settings'e bakarak hangi aksiyonun otomasyonda olduğunu söyler. */
export function autoStateForPet(
  settings: SpecialActionsSettings,
  petId: SpecialPetId
): { config: PetAutoSpecialConfig; perActionEffective: Record<SpecialActionId, boolean> } {
  const config = settings.pets[petId];
  const perActionEffective = {} as Record<SpecialActionId, boolean>;
  for (const a of SPECIAL_ACTIONS) {
    if (a.pet !== petId) continue;
    perActionEffective[a.id] = isActionAutoEnabled(
      settings,
      petId,
      a.id,
      a.defaultAuto
    );
  }
  return { config, perActionEffective };
}
