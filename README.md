# CaYa Desktop Pet

CaYaDev temalı, **şeffaf**, **kenarlıksız**, **always-on-top** bir masaüstü pet uygulaması.  
Tauri + React + TypeScript + Rust ile yazıldı. Windows için optimize edildi (Linux/macOS'ta da derlenir).

> Masaüstünde yaşayan, etrafa koşan, pencereleri iten, ekrana efekt yağdıran, aksesuarlar takan,  
> arkadaş edinebilen ve kendi kendine dolaşabilen bir dijital maskot sistemi.

!(cover)[Cover.png]

---

## Özellikler

### Temel Pencere
- **Şeffaf** + kenarlıksız + always-on-top + skip-taskbar pencere
- Sürükleme sonrası **pencere konumu otomatik kaydedilir** ve uygulama yeniden açılınca geri yüklenir
- Sağ tık menüsü açılırken pencere geçici olarak genişler (menü taşmasın diye), kapanınca eski boyutuna döner

### Pet Seçimi — 3 Karakter
| Pet | Karakter |
|-----|---------|
| **CaYa** | CaYaDev temalı, kırmızı–siyah resmi maskot. Konsol ruhuyla gelir. |
| **Blob** | Yumuşak, sevimli, jölemsi bir dost. Çift tıkta seker. |
| **Cube** | Minimal, pikselleşmiş, kübik bir ajan. Kısa sistem mesajları yazar. |

### Animasyon Sistemi — 7 Durum
Sprite sheet başına **4 sütun × 7 satır** grid; her frame **144×144 px**.

| Satır | State | Süre/Frame | Loop | Geçiş |
|-------|-------|------------|------|-------|
| 0 | `idle` | 220 ms | ✓ | — |
| 1 | `sleep` | 380 ms | ✓ | — |
| 2 | `happy` | 140 ms | ✗ | → idle |
| 3 | `thinking` | 260 ms | ✓ | — |
| 4 | `clicked` | 90 ms | ✗ | → happy |
| 5 | `dragged` | 120 ms | ✓ | — |
| 6 | `walking` | 180 ms | ✓ | — |

Her durum için her pet'e özgü onlarca **konuşma balonu mesajı** bulunur.

### Renk Temaları — 10 Seçenek
Pet görselini SVG düzeyinde yeniden renklendirir; sprite her tema için ayrı üretilir.

| Tema | Renk |
|------|------|
| Varsayılan | Kırmızı → Cyan → Yeşil gradyan |
| Elektrik Mavi | `#4ab8ff` |
| Neon Yeşil | `#84ff5d` |
| Mor | `#9d72ff` |
| Altın | `#ffc74f` |
| Aqua | `#49f2ff` |
| Günbatımı | `#ff9252` |
| Bubblegum | `#ff73b8` |
| Buz | `#d9f7ff` |
| Mono | `#d0d0d0` |

Her pet için ayrı tema seçilebilir; seçimler `settings.json`'a `color_theme_by_pet` altında kaydedilir.

### Kozmetik Sistem — Şapkalar ve Gözlükler
Pet'in üzerine bindirilen SVG aksesuarlar. Kategori, konum ve ölçek `cosmetics.ts` içinde tanımlı.

**Şapkalar (4 adet):**
- Silindir Şapka · Sihirbaz Şapkası · Taç · Pervane Şapka

**Gözlükler (5 adet):**
- Monokl · Yuvarlak Gözlük · Yıldız Gözlük · Kalp Gözlük · Pixel Glasses

Kozmetikler pencere bazında saklanır (`cosmetics_by_window`). Ana pencere ve arkadaş pencereleri birbirinden bağımsız kozmetik taşıyabilir.

### Sürükleme & Fırlatma Fiziği
- Tauri native drag ile pencere sürüklenir; sürükleme sırasında konum **30 ms** aralıklarla örneklenir.
- Bırakma hızı `>600 px/s` ise **momentum simülasyonu** başlar:
  - Her frame: `pos += velocity × dt`, `velocity *= 0.92` (friction)
  - Ekran kenarlarına çarpınca `0.55` sönümleme ile **sekme** (bounce)
  - Hız `<40 px/s`'ye düşünce simülasyon biter, otonom mod devreye girer

### Otonom Gezinti Modu (Wander)
- Pencere bazında açılır/kapatılır; her pencere kendi `wander_by_window` ayarını taşır.
- Pet rastgele hedef seçer, `walking` animasyonuyla **90 px/s** hızda yürür.
- Ara sıra **%18 şansla zıplar** (`vy = -260 px/s`, `gravity = 900`).
- **Çoklu monitör** desteği: hedef farklı bir monitörde ise monitörler arasındaki ortak kenarda geçit noktaları hesaplanır; pet ışınlanmadan komşu ekrana **yürüyerek geçer**.
- Belirli süre ilerlemezse (1.2 s, <2 px) **sıkışma koruması** devreye girer ve rota yeniden planlanır.

### Pencere Etkileşimi (Interactive Mode)
Wander modundayken pet masaüstündeki gerçek pencerelerin üzerinden geçince **ağırlıklı rastgele** bir davranış seçer:

| Davranış | Açıklama | Ağırlık |
|----------|----------|---------|
| `skip` | Hiçbir şey yapma, sadece geç | 28 |
| `nudge` | Yürüyüş yönünde küçük tek-adım itme | 32 |
| `bump` | Ease-out + overshoot ile daha büyük itme | 16 |
| `shake` | Sönümlü sallama | 14 |
| `hop` | Pencereyi kısa süre zıplatıp indir | 10 |

Her davranışın kendi cooldown'ı vardır (320 ms – 2.3 s arası).

### Arkadaş Sistemi (Friend Windows)
- Sağ tık menüsünden herhangi bir pet için **yeni arkadaş penceresi** açılır.
- Arkadaşlar `friend-{petId}` label'lı bağımsız Tauri pencereleridir.
- Uygulama kapatılıp tekrar açıldığında **arkadaş pencereleri otomatik geri gelir** (`friends` kaydı).
- Her arkadaş pencere **250 ms** aralıklarla konumunu `pet:position` event'i ile yayınlar.
- Kendi arkadaşına `<220 px` yaklaşınca **selam** (`happy`) animasyonu oynar.
- Arkadaş pencereler, ana pencereden bağımsız pet/kozmetik/tema/wander ayarına sahip olabilir.

### Konuşma Balonu
- Duruma (state) göre değişen onlarca mesaj, her pet için özelleştirilmiş.
- Sağ tık menüsünden açılıp kapatılabilir; ayar `settings.json`'a kaydedilir.

### Otomatik Uyku
- Belirli süre etkileşim olmazsa `sleep` durumuna otomatik geçer (varsayılan: 60 s).
- Konfigüre edilebilir: `auto_sleep_seconds` ayarı.

### Özel Eylemler Sistemi (Special Actions)
Pet'e özgü **prop** (yan mini sahne), **fullscreen** (tüm ekran efekti) ve **pet-mod** (pet konumu / görünümü) kategorilerinde otomatik ya da manuel tetiklenebilen 17 eylem.

#### CaYa Eylemleri (5 adet)
| Eylem | Kapsam | Süre | Cooldown |
|-------|--------|------|---------|
| Mini Bilgisayar | prop | 9 s | 45 s |
| Matrix Code Rain | fullscreen | 12 s | 90 s |
| Meteor Compile | fullscreen | 8 s | 80 s |
| Bug Invasion | fullscreen | 7.5 s | 100 s |
| Terminal Portal | prop | 8 s | 60 s |

#### Cube Eylemleri (6 adet)
| Eylem | Kapsam | Süre | Cooldown |
|-------|--------|------|---------|
| Grid Scan | fullscreen | 6 s | 70 s |
| Geometry Lab | prop | 8 s | 55 s |
| Portal Jump | pet-mod | 1.8 s | 65 s |
| Clone Cubes | prop | 5 s | 50 s |
| System Analyzer | prop | 9 s | 60 s |
| Pixel Repair | fullscreen | 6.5 s | 95 s |

#### Blob Eylemleri (6 adet)
| Eylem | Kapsam | Süre | Cooldown |
|-------|--------|------|---------|
| Bubble World | fullscreen | 8 s | 80 s |
| Water Splash | prop | 1.5 s | 25 s |
| Snack Time | prop | 5.5 s | 50 s |
| Sleep Zone | prop | 8 s | 70 s |
| Toy Ball | prop | — | 50 s |
| Mood Aura | prop | — | — |

#### Otomasyon
- **Global anahtar**: tüm petler için otomatik efektleri açar/kapatır.
- **Per-pet anahtar**: belirli bir pet'in otomasyonunu açar/kapatır.
- **Per-action anahtar**: tek tek eylem bazında kontrol.
- Otomasyon tiki **8 ± 6 s** aralıklı, her seferinde `%35` tetikleme şansı.
- Ayarlar `special-settings.json` dosyasına ayrı kaydedilir.

#### Fullscreen Efektler
Tüm monitörlere ayrı şeffaf overlay pencereleri açılarak kaplama yapılır; efektler bittikten sonra pencereler otomatik kapatılır. Pet pencereleri `always-on-top` ile efektin üstünde kalır.

#### Prop Pencereleri
Her prop için bağımsız şeffaf, click-through Tauri penceresi açılır. Prop penceresi pet hareket ettikçe pozisyonunu günceller (90 ms aralıkla).

### Sağ Tık Menüsü
Tam temalı HTML menü; alt menüler (submenu) destekler.

| Menü Grubu | İçerik |
|-----------|--------|
| Durum | Uyut · Uyandır · Mutlu yap · Düşünüyor moduna al |
| Hareket | Wander Modu aç/kapat · Pencere Etkileşimi aç/kapat |
| Pet Seç | CaYa · Blob · Cube |
| Arkadaşlar | Her pet için arkadaş ekle/kapat |
| Renkler | 10 renk teması |
| Şapkalar | 4 şapka seçeneği (tek tıkla toggle) |
| Gözlükler | 5 gözlük seçeneği (tek tıkla toggle) |
| Özel Eylemler | Manuel tetikleme (per-action) |
| Otomatik Efektler | Global / pet / eylem bazında toggle |
| Konuşma Balonu | Aç / Kapat |
| Gizle | Pencereyi gizler |
| Çıkış | Uygulamayı sonlandırır |

---

## Hızlı başlangıç

### 1) Gereksinimler

| Araç         | Sürüm     | Kurulum                                                            |
|--------------|-----------|--------------------------------------------------------------------|
| Node.js      | ≥ 20      | <https://nodejs.org>                                               |
| npm          | ≥ 10      | Node.js ile birlikte                                               |
| Rust (cargo) | stable    | <https://www.rust-lang.org/tools/install> (Windows: `rustup-init`) |
| Tauri sistem bağımlılıkları | — | <https://tauri.app/start/prerequisites/> |

Windows için ek olarak **Visual Studio Build Tools** + **WebView2** gerekir
(Windows 11'de WebView2 zaten kurulu).

### 2) Bağımlılıkları kur

```powershell
npm install
```

`postinstall` adımı **sprite sheet'leri** (`public/pets/`) ve **Tauri ikonlarını**
(`src-tauri/icons/`) otomatik üretir. Manuel olarak da çalıştırabilirsiniz:

```powershell
npm run generate-assets   # sprite + icon
npm run generate-sprites  # sadece sprite
npm run generate-icons    # sadece icon
```

### 3) Geliştirme modu

```powershell
npm run tauri:dev
```

İlk açılışta Rust bağımlılıklarını indirip derlemesi 3–8 dakika sürebilir.

#### Windows'ta sık karşılaşılan iki sorun

1. **`cargo: program not found`** — Rustup'ı `winget` ile kurduktan sonra
   **PowerShell'i kapatıp yeniden açın**. Yeni PATH eski oturumlara taşınmaz.
   Veya geçici olarak:
   ```powershell
   $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
   ```

2. **`SSL connect error … CRYPT_E_NO_REVOCATION_CHECK`** — Windows schannel,
   sertifika revocation listesine ulaşamadığında cargo paket indiremez
   (kurumsal proxy/AV ortamlarında yaygın). Çözüm:
   ```powershell
   # Kalıcı kullanıcı env değişkeni:
   [Environment]::SetEnvironmentVariable("CARGO_HTTP_CHECK_REVOKE", "false", "User")
   ```
   Sonra PowerShell'i yeniden açın. (Yalnız bu oturum için:
   `$env:CARGO_HTTP_CHECK_REVOKE = "false"`)

### 4) Üretim build

```powershell
npm run tauri:build
```

Çıktılar: `src-tauri/target/release/bundle/`
(NSIS installer ve MSI üretilir.)

> **Not:** `tauri build` için `src-tauri/icons/` altında ikon dosyaları gerekir.
> Hızlıca üretmek için: `npm run tauri icon path/to/source-1024.png`

---

## Proje yapısı

```
.
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ scripts/
│  ├─ generate-sprites.mjs   # SVG sprite sheet + renk teması varyantları üretici
│  └─ generate-icons.mjs     # Tauri ikon setini üretir
├─ public/
│  ├─ pets/                  # generate-sprites tarafından üretilir
│  │  ├─ caya.svg            # Varsayılan tema
│  │  ├─ caya--electric-blue.svg
│  │  ├─ blob.svg
│  │  ├─ cube.svg
│  │  └─ ...                 # her pet × her tema
│  └─ cosmetics/             # Aksesuar SVG'leri
│     ├─ hat-tophat.svg
│     ├─ hat-wizard.svg
│     ├─ hat-crown.svg
│     ├─ hat-propeller.svg
│     ├─ glasses-monocle.svg
│     ├─ glasses-round.svg
│     ├─ glasses-star.svg
│     ├─ glasses-heart.svg
│     └─ glasses-pixel.svg
├─ src/
│  ├─ main.tsx               # Uygulama giriş noktası
│  ├─ App.tsx                # Kök bileşen — tüm hook'ları orkestre eder
│  ├─ components/
│  │  ├─ Pet.tsx             # Sprite animasyon + kozmetik bindirme
│  │  ├─ SpeechBubble.tsx    # Konuşma balonu
│  │  └─ ContextMenu.tsx     # Temalı sağ tık menüsü (submenu destekli)
│  ├─ hooks/
│  │  ├─ usePetAnimation.ts  # Frame döngüsü + state geçişleri
│  │  ├─ usePetState.ts      # Durum makinesi yönetimi
│  │  ├─ useDraggable.ts     # Tauri native drag
│  │  ├─ useThrowPhysics.ts  # Fırlatma + sekme fiziği
│  │  ├─ useWander.ts        # Otonom gezinti + çok monitör + pencere etkileşimi
│  │  └─ useFriendAwareness.ts # Arkadaş pencere konum yayını/dinleme
│  ├─ data/
│  │  ├─ petStates.ts        # Pet tanımları, state konfigürasyonları, bubble mesajlar
│  │  ├─ colorThemes.ts      # 10 renk teması + SVG URL çözümleyici
│  │  └─ cosmetics.ts        # Aksesuar tanımları (konum, ölçek, kategori)
│  ├─ special/
│  │  ├─ types.ts            # Özel eylem tip tanımları
│  │  ├─ registry.ts         # 17 özel eylem kaydı (süre, cooldown, pencere boyutları)
│  │  ├─ useSpecialActions.ts # Özel eylem orkestratörü (tetikleme, otomasyon, cooldown)
│  │  ├─ specialStorage.ts   # special-settings.json okuma/yazma
│  │  ├─ FullscreenEffectLayer.tsx # Tüm fullscreen efekt bileşenleri (canvas + DOM)
│  │  ├─ PropLayer.tsx       # Tüm prop bileşenleri (mini sahne objeleri)
│  │  ├─ OverlayApp.tsx      # Fullscreen overlay pencere giriş noktası
│  │  └─ PropWindowApp.tsx   # Prop pencere giriş noktası
│  └─ styles/
│     └─ app.css             # Uygulama stilleri
└─ src-tauri/
   ├─ Cargo.toml
   ├─ tauri.conf.json
   ├─ build.rs
   ├─ capabilities/default.json
   ├─ icons/                 # build için gerekir
   └─ src/
      ├─ main.rs
      └─ lib.rs              # Tüm Tauri komutları (21+ komut)
```

---

## Sprite sheet sistemi

Her sprite sheet **4 sütun × 7 satır** bir grid'tir; frame boyutu **144×144 px**.
Pencere boyutu 176×176'dır — pet ortada durur, kenarlarda 16 px şeffaf alan kalır.

| Satır | State | Davranış |
|-------|-------|---------|
| 0 | `idle` | 4 frame × 220ms — loop |
| 1 | `sleep` | 4 frame × 380ms — loop |
| 2 | `happy` | 4 frame × 140ms — bitince idle'a döner |
| 3 | `thinking` | 4 frame × 260ms — loop |
| 4 | `clicked` | 4 frame × 90ms — bitince happy'ye döner |
| 5 | `dragged` | 4 frame × 120ms — loop |
| 6 | `walking` | 4 frame × 180ms — loop |

**Renk teması varyantları:** `generate-sprites.mjs` her pet için tüm temalar adına ayrı SVG üretir (`caya--violet.svg`, `blob--gold.svg` vb.). Ana tema dosyası renksiz/orijinal kalır.

### Kendi pet'inizi eklemek

1. `scripts/generate-sprites.mjs` dosyasındaki mevcut pet fonksiyonlarını inceleyin.
2. Yeni bir `myPetFrame(state, frame)` fonksiyonu yazın (SVG string döndürür).
3. `targets` dizisine ekleyin → `npm run generate-sprites`.
4. [`src/data/petStates.ts`](src/data/petStates.ts) içindeki `PETS` dizisine kayıt ekleyin:
   ```ts
   {
     id: "mypet",
     displayName: "My Pet",
     spriteUrl: "/pets/mypet.svg",
     frameSize: 144,
     cols: 4,
     rows: 7,
     description: "...",
     states: buildStates({ idle: ["merhaba!"], ... })
   }
   ```

Hazır PNG sprite sheet kullanmak için dosyayı `public/pets/` altına atın ve `PETS`'e uygun `frameSize/cols/rows` değerleriyle kayıt ekleyin.

---

## Ayar dosyaları

### `settings.json`
```jsonc
// %APPDATA%/com.cayadev.desktoppet/settings.json
{
  "selected_pet": "caya",
  "auto_sleep_seconds": 60,
  "speech_bubble_enabled": false,
  "wander_enabled": false,
  "wander_by_window": { "main": true, "friend-blob": false },
  "interactive_by_window": { "main": true },
  "volume": 0.6,
  "theme": "dark",
  "window": { "x": 1200, "y": 600, "width": 176, "height": 176 },
  "friends": { "friend-blob": "blob" },
  "cosmetics_by_window": {
    "main": { "hat": "hat-tophat", "glasses": "glasses-round" }
  },
  "color_theme_by_pet": { "caya": "electric-blue", "blob": "bubblegum" }
}
```

### `special-settings.json`
```jsonc
// %APPDATA%/com.cayadev.desktoppet/special-settings.json
{
  "globalEnabled": true,
  "pets": {
    "caya": { "enabled": true, "perAction": { "caya.bugInvasion": false } },
    "blob": { "enabled": true, "perAction": {} },
    "cube": { "enabled": false, "perAction": {} }
  }
}
```

---

## Tauri Komutları (Rust ↔ Frontend)

| Komut | Açıklama |
|-------|---------|
| `load_settings` | Disk'ten ayarları yükle |
| `save_settings` | Ayarları diske yaz |
| `get_window_state` | Mevcut pencere konumu/boyutu |
| `apply_window_state` | Pencereyi verilen konuma/boyuta taşı |
| `expand_window` | Menü için pencereyi geçici genişlet |
| `collapse_window` | Pencereyi normal boyutuna döndür |
| `get_monitor_info` | Tüm monitörlerin bilgilerini al |
| `get_desktop_info` | Monitörler + görünür masaüstü pencereleri |
| `hide_window` | Pencereyi gizle |
| `exit_app` | Uygulamayı kapat |
| `spawn_friend` | Yeni arkadaş penceresi aç |
| `close_friend` | Arkadaş penceresini kapat |
| `broadcast_pet_position` | Tüm pencerelere konum event'i yayınla |
| `spawn_overlay_window` | Tek monitörde fullscreen efekt penceresi aç |
| `spawn_overlay_windows_all_monitors` | Tüm monitörlerde efekt penceresi aç |
| `spawn_prop_window` | Pet yanında prop penceresi aç |
| `close_prop_window` | Prop penceresini kapat |
| `update_prop_window_position` | Prop pencereyi pet konumuna göre güncelle |
| `raise_pet_windows` | Tüm pet pencerelerini always-on-top yap |
| `nudge_window_near` | Belirtilen konuma yakın masaüstü penceresini it |
| `shake_window_near` | Yakın pencereyi sönümlü salla |
| `hop_window_near` | Yakın pencereyi kısa süre zıplatıp indir |

---

## Lisans

MIT — istediğiniz gibi kullanın, değiştirin, dağıtın.  
CaYaDev kırmızı–siyah tema kimliği [cayadev.com](https://cayadev.com) tarafından ilham alınmıştır.
