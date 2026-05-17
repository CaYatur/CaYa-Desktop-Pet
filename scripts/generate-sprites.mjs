// scripts/generate-sprites.mjs
// -----------------------------------------------------------------------------
// SVG sprite sheet üretici. Her pet için tek bir SVG dosyası üretir:
//   * Grid: 4 column (frame) × 6 row (state)
//   * Frame size: 144×144  →  toplam SVG: 576×864
//   * State'ler: idle, sleep, happy, thinking, clicked, dragged
//
// Çıktı: public/pets/{caya,blob,cube}.svg
//
// Yeniden tasarım notu: CaYa peti Codex peti gibi karakter-temelli — kafa +
// ekran-yüz + omuzlar + ufak kollar. Konsol "penceresi" değil, kırmızı/siyah
// CaYaDev tonunda küçük bir robot maskot. Alt yazı yok, gözler büyük.
// -----------------------------------------------------------------------------

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "pets");

const FRAME = 144;
const COLS = 4;
const ROWS = 7;
const STATES = ["idle", "sleep", "happy", "thinking", "clicked", "dragged", "walking"];
const COLOR_VARIANTS = [
  { id: "electric-blue", accent: "#4ab8ff" },
  { id: "neon-green", accent: "#84ff5d" },
  { id: "violet", accent: "#9d72ff" },
  { id: "gold", accent: "#ffc74f" },
  { id: "aqua", accent: "#49f2ff" },
  { id: "sunset", accent: "#ff9252" },
  { id: "bubblegum", accent: "#ff73b8" },
  { id: "ice", accent: "#d9f7ff" },
  { id: "mono", accent: "#d0d0d0" }
];

// -----------------------------------------------------------------------------
// Yardımcılar
// -----------------------------------------------------------------------------

/** Bir frame'i (cx, cy) merkezli olarak çizmek için <g transform> sarar. */
function frameGroup(col, row, inner) {
  const tx = col * FRAME + FRAME / 2;
  const ty = row * FRAME + FRAME / 2;
  return `<g transform="translate(${tx},${ty})">${inner}</g>`;
}

/** Tüm frame'leri toplayıp tam SVG dosyasını döner. */
function wrapSvg(body, palette) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * FRAME}" height="${ROWS * FRAME}" viewBox="0 0 ${COLS * FRAME} ${ROWS * FRAME}" shape-rendering="geometricPrecision">
  <defs>
    <radialGradient id="glow-${palette.id}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${palette.glow}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${palette.glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="body-${palette.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.bodyTop}"/>
      <stop offset="100%" stop-color="${palette.bodyBottom}"/>
    </linearGradient>
    <linearGradient id="head-${palette.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.headTop}"/>
      <stop offset="100%" stop-color="${palette.headBottom}"/>
    </linearGradient>
  </defs>
  ${body}
</svg>`;
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "").trim();
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHex(base, target, amount) {
  const from = hexToRgb(base);
  const to = hexToRgb(target);
  const weight = Math.max(0, Math.min(1, amount));

  return rgbToHex({
    r: from.r + (to.r - from.r) * weight,
    g: from.g + (to.g - from.g) * weight,
    b: from.b + (to.b - from.b) * weight
  });
}

function lightenHex(hex, amount) {
  return mixHex(hex, "#ffffff", amount);
}

function darkenHex(hex, amount) {
  return mixHex(hex, "#000000", amount);
}

// =============================================================================
// 1) CAYA — Codex-stili tombul sevimli karakter, CaYaDev kırmızı/siyah.
//    Yumuşak "bulutlu/kıvırcık" kafa silüeti, oval gövde, kısa kol/ayak.
// =============================================================================
const CAYA_PALETTE = {
  id: "caya",
  glow: "#ff2b3d",
  headTop: "#ff5666",
  headBottom: "#cc1a2a",
  headShade: "#8a1019",
  bodyTop: "#1f1f28",
  bodyBottom: "#0a0a10",
  bodyEdge: "#ff2b3d",
  screen: "#0a0b10",
  eye: "#ff6b7a",
  eyeBright: "#ffe9ec",
  cheek: "#ff5c6f"
};

const CAYA_TERMINAL_PALETTE = {
  id: "caya",
  glow: "#ff2b3d",
  headTop: "#ff5666",
  headBottom: "#cc1a2a",
  bodyTop: "#15151d",
  bodyBottom: "#0a0a10",
  body: "#0a0a10",
  bodyAlt: "#15151d",
  edge: "#ff2b3d",
  edgeDim: "#8a1019",
  pixel: "#ff4a5c",
  pixelBright: "#ffd7dc",
  terminal: "#0f1016"
};

function buildCayaVariantPalette(theme) {
  const accent = theme.accent;
  return {
    id: "caya",
    glow: lightenHex(accent, 0.06),
    headTop: lightenHex(accent, 0.24),
    headBottom: darkenHex(accent, 0.18),
    bodyTop: "#15151d",
    bodyBottom: "#0a0a10",
    body: "#0a0a10",
    bodyAlt: "#15151d",
    edge: accent,
    edgeDim: darkenHex(accent, 0.42),
    pixel: lightenHex(accent, 0.08),
    pixelBright: lightenHex(accent, 0.78),
    terminal: "#0f1016"
  };
}

// "Bulut" kafanın silüeti — birden çok birleşmiş yumuşak yay/yuvarlak.
// pathString döner; karakter merkezi (0,0).
function cayaCloudHeadPath() {
  // Bulut benzeri 5 yuvarlatılmış çıkıntı + alt düz taban.
  // Frame içi koordinat sistemine göre (kafa merkezi 0,0, yarıçap ~30).
  return `
    M -32 -2
    C -36 -16, -28 -28, -18 -26
    C -16 -34, -4  -36,   2 -30
    C  8 -38,  20 -36,  22 -26
    C  30 -28, 38 -20,  34  -6
    C  38   2, 36  14,  26  16
    L -26  16
    C -36  16, -38  6, -32 -2
    Z`;
}

function cayaCharacter(opts = {}) {
  const {
    bounceY = 0,    // tüm gövde Y kayması
    headTilt = 0,   // kafa eğimi
    armSwing = 0,   // kol açısı
    squash = 0,     // -1..1
    eyes = ""
  } = opts;

  const c = CAYA_PALETTE;
  const sx = 1 + squash * 0.06;
  const sy = 1 - squash * 0.10;

  // Karakter geometrisi (frame 144, ~120 px yükseklik).
  const HEAD_Y = -26;     // kafa merkezi
  const BODY_Y = 22;      // gövde merkezi
  const BODY_RX = 32;     // oval gövde X yarıçapı
  const BODY_RY = 26;     // oval gövde Y yarıçapı

  return `
    <g transform="translate(0, ${bounceY}) scale(${sx} ${sy})">
      <!-- arka glow + zemin gölgesi -->
      <circle cx="0" cy="-4" r="64" fill="url(#glow-caya)"/>
      <ellipse cx="0" cy="${BODY_Y + 28}" rx="32" ry="5" fill="#000" opacity="0.45"/>

      <!-- AYAKLAR (kısa tombul) -->
      <ellipse cx="-12" cy="${BODY_Y + 26}" rx="9" ry="6"
               fill="${c.bodyTop}" stroke="${c.bodyEdge}" stroke-width="1.6"/>
      <ellipse cx=" 12" cy="${BODY_Y + 26}" rx="9" ry="6"
               fill="${c.bodyTop}" stroke="${c.bodyEdge}" stroke-width="1.6"/>

      <!-- GÖVDE (oval, kırmızı çerçeve) -->
      <ellipse cx="0" cy="${BODY_Y}" rx="${BODY_RX}" ry="${BODY_RY}"
               fill="url(#body-caya)"
               stroke="${c.bodyEdge}" stroke-width="2.2"/>
      <!-- gövde üst parıltı -->
      <ellipse cx="-8" cy="${BODY_Y - 12}" rx="14" ry="5"
               fill="#fff" opacity="0.05"/>

      <!-- Göğüste prompt: > _ -->
      <text x="0" y="${BODY_Y + 6}" text-anchor="middle"
            font-family="Cascadia Code, Consolas, monospace"
            font-size="16" font-weight="700"
            fill="${c.bodyEdge}">&gt;_</text>

      <!-- KOLLAR (kısa tombul, yanlardan sarkık) -->
      <g transform="translate(${-BODY_RX + 4}, ${BODY_Y - 4}) rotate(${-armSwing})">
        <ellipse cx="-6" cy="8" rx="7" ry="10"
                 fill="${c.bodyTop}" stroke="${c.bodyEdge}" stroke-width="1.6"/>
        <circle cx="-6" cy="16" r="4" fill="${c.bodyEdge}"/>
      </g>
      <g transform="translate(${BODY_RX - 4}, ${BODY_Y - 4}) rotate(${armSwing})">
        <ellipse cx="6" cy="8" rx="7" ry="10"
                 fill="${c.bodyTop}" stroke="${c.bodyEdge}" stroke-width="1.6"/>
        <circle cx="6" cy="16" r="4" fill="${c.bodyEdge}"/>
      </g>

      <!-- KAFA (yumuşak bulut silüeti, içinde siyah ekran-yüz) -->
      <g transform="translate(0, ${HEAD_Y}) rotate(${headTilt})">
        <!-- bulut gölgesi (hafif derinlik) -->
        <path d="${cayaCloudHeadPath()}"
              fill="${c.headShade}"
              transform="translate(1.5, 2.5)"
              opacity="0.55"/>
        <!-- bulut ana silüet -->
        <path d="${cayaCloudHeadPath()}"
              fill="url(#head-caya)"
              stroke="${c.bodyEdge}" stroke-width="2"/>
        <!-- bulutun üst-orta parıltı -->
        <ellipse cx="-6" cy="-22" rx="10" ry="3.5"
                 fill="#fff" opacity="0.18"/>

        <!-- EKRAN-YÜZ (siyah yuvarlatılmış panel) -->
        <rect x="-21" y="-10" width="42" height="22" rx="9" ry="9"
              fill="${c.screen}"
              stroke="${c.bodyEdge}" stroke-width="1.2"/>
        <!-- ekran üst yansıma -->
        <rect x="-19" y="-9" width="38" height="3" rx="1.5"
              fill="${c.bodyEdge}" opacity="0.20"/>

        <!-- YANAK BLUSH (yumuşak gül) -->
        <ellipse cx="-22" cy="6" rx="4" ry="2.5"
                 fill="${c.cheek}" opacity="0.55"/>
        <ellipse cx=" 22" cy="6" rx="4" ry="2.5"
                 fill="${c.cheek}" opacity="0.55"/>

        ${eyes}
      </g>
    </g>`;
}

function cayaEyes(state, frame) {
  const c = CAYA_PALETTE;

  // Sleep: yumuşak yay kapalı gözler + z balonu.
  if (state === "sleep") {
    const z = ["z", "Z", "z", "·"][frame % 4];
    return `
      <path d="M-12,1 q4,-6 8,0" stroke="${c.eye}" stroke-width="2.6"
            fill="none" stroke-linecap="round"/>
      <path d="M 4,1 q4,-6 8,0" stroke="${c.eye}" stroke-width="2.6"
            fill="none" stroke-linecap="round"/>
      <text x="18" y="${-12 - frame * 1.5}" font-family="Consolas, monospace"
            font-size="9" font-weight="700"
            fill="${c.eye}">${z}</text>`;
  }
  // Thinking: kısık gözler + ekranda dönen yükleme noktaları.
  if (state === "thinking") {
    const dotX = -6 + (frame % 4) * 4;
    return `
      <rect x="-12" y="-3" width="7" height="3" rx="1.4" fill="${c.eye}"/>
      <rect x=" 5"  y="-3" width="7" height="3" rx="1.4" fill="${c.eye}"/>
      <rect x="${dotX}" y="6" width="3" height="3" rx="1" fill="${c.eye}"/>`;
  }
  // Happy: ":>" tarzı tek "winking" + yay göz, ekran çok mutlu.
  if (state === "happy") {
    return `
      <path d="M-12,1 L-8,-5 L-4,1" stroke="${c.eye}" stroke-width="2.8"
            fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 4,1 L 8,-5 L 12,1" stroke="${c.eye}" stroke-width="2.8"
            fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M-6,6 q6,4 12,0" stroke="${c.eye}" stroke-width="2"
            fill="none" stroke-linecap="round"/>`;
  }
  // Clicked: kocaman parlak gözler.
  if (state === "clicked") {
    const s = frame === 0 ? 1.4 : 1.0;
    return `
      <circle cx="-8" cy="-1" r="${5 * s}" fill="${c.eye}"/>
      <circle cx="8"  cy="-1" r="${5 * s}" fill="${c.eye}"/>
      <circle cx="-9" cy="-2.5" r="1.6" fill="${c.eyeBright}"/>
      <circle cx="7"  cy="-2.5" r="1.6" fill="${c.eyeBright}"/>
      <circle cx="-7" cy="0.5" r="0.8" fill="${c.eyeBright}"/>
      <circle cx="9"  cy="0.5" r="0.8" fill="${c.eyeBright}"/>`;
  }
  // Dragged: gözler titriyor + ağız ":O" şaşkın.
  if (state === "dragged") {
    const off = (frame % 4) - 1.5;
    return `
      <rect x="${-12 + off * 0.6}" y="-4" width="7" height="6" rx="1.4" fill="${c.eye}"/>
      <rect x="${5  + off * 0.6}" y="-4" width="7" height="6" rx="1.4" fill="${c.eye}"/>
      <ellipse cx="0" cy="7" rx="2.5" ry="2" fill="${c.eye}"/>`;
  }
  // Walking (yürüme): yumuşak göz + alt "..." (otonom mod gösterir).
  if (state === "walking") {
    const blink = frame === 3;
    if (blink) {
      return `
        <line x1="-12" y1="-1" x2="-4" y2="-1" stroke="${c.eye}" stroke-width="2.8" stroke-linecap="round"/>
        <line x1="4"   y1="-1" x2="12" y2="-1" stroke="${c.eye}" stroke-width="2.8" stroke-linecap="round"/>`;
    }
    return `
      <rect x="-12" y="-4" width="7" height="6" rx="1.4" fill="${c.eye}"/>
      <rect x=" 5"  y="-4" width="7" height="6" rx="1.4" fill="${c.eye}"/>
      <circle cx="-9.5" cy="-2.5" r="1.3" fill="${c.eyeBright}"/>
      <circle cx="7.5"  cy="-2.5" r="1.3" fill="${c.eyeBright}"/>`;
  }
  // Idle: yumuşak gözler, frame 3'te kapalı (blink) + hafif ağız.
  if (frame === 3) {
    return `
      <line x1="-12" y1="-1" x2="-4" y2="-1" stroke="${c.eye}" stroke-width="2.8" stroke-linecap="round"/>
      <line x1="4"   y1="-1" x2="12" y2="-1" stroke="${c.eye}" stroke-width="2.8" stroke-linecap="round"/>`;
  }
  return `
    <rect x="-12" y="-4" width="7" height="7" rx="1.6" fill="${c.eye}"/>
    <rect x="5"   y="-4" width="7" height="7" rx="1.6" fill="${c.eye}"/>
    <circle cx="-9.5" cy="-2.5" r="1.6" fill="${c.eyeBright}"/>
    <circle cx="7.5"  cy="-2.5" r="1.6" fill="${c.eyeBright}"/>`;
}

function cayaFrame(state, frame, palette = CAYA_TERMINAL_PALETTE) {
  return cayaCubeFrame(state, frame, palette);
}

// =============================================================================
// 2) BLOB — sevimli, yuvarlak.
// =============================================================================
const BLOB_PALETTE = {
  id: "blob",
  glow: "#7be0ff",
  headTop: "#9bf0ff",
  headBottom: "#39a8d6",
  bodyTop: "#7be0ff",
  bodyBottom: "#39a8d6",
  bodyEdge: "#1e6e92",
  eye: "#0a1622",
  cheek: "#ff8aa8"
};

function buildBlobVariantPalette(theme) {
  const accent = theme.accent;
  return {
    id: "blob",
    glow: lightenHex(accent, 0.18),
    headTop: lightenHex(accent, 0.24),
    headBottom: darkenHex(accent, 0.16),
    bodyTop: lightenHex(accent, 0.18),
    bodyBottom: darkenHex(accent, 0.12),
    bodyEdge: darkenHex(accent, 0.42),
    eye: darkenHex(accent, 0.86),
    cheek: mixHex(accent, "#ff9ab6", 0.28)
  };
}

function blobFrame(state, frame, palette = BLOB_PALETTE) {
  const c = palette;
  const idleSquash = [0, -0.05, 0, 0.05][frame];
  const sleepBob = [0, 1, 2, 1][frame];
  const happyJump = [-4, -14, -8, -1][frame];
  const thinkTilt = [-3, 0, 3, 0][frame];
  const clickShrink = [0.6, 0.78, 0.92, 1][frame];
  const dragTilt = [-10, -3, 3, 10][frame];

  let sx = 1, sy = 1, ty = 0, rot = 0;
  if (state === "idle") { sy = 1 + idleSquash; sx = 1 - idleSquash; ty = -idleSquash * 6; }
  if (state === "sleep") { ty = sleepBob; sy = 0.95; }
  if (state === "happy") { ty = happyJump; }
  if (state === "thinking") { rot = thinkTilt; }
  if (state === "clicked") { sx = sy = clickShrink; }
  if (state === "dragged") { rot = dragTilt; ty = -2; }
  if (state === "walking") { ty = [0, -3, 0, -3][frame]; rot = [-2, 2, -2, 2][frame]; }

  const r = 48;
  const closedEyes = state === "sleep" || (state === "idle" && frame === 3);

  const eyes = closedEyes
    ? `<path d="M-16,-6 q5,-7 10,0" stroke="${c.eye}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
       <path d="M 6,-6 q5,-7 10,0" stroke="${c.eye}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
    : `<circle cx="-10" cy="-6" r="${state === "clicked" ? 5.5 : 4.2}" fill="${c.eye}"/>
       <circle cx="10"  cy="-6" r="${state === "clicked" ? 5.5 : 4.2}" fill="${c.eye}"/>
       <circle cx="-9"  cy="-7" r="1.4" fill="#fff"/>
       <circle cx="11"  cy="-7" r="1.4" fill="#fff"/>`;

  const mouth =
    state === "happy"
      ? `<path d="M-12,8 q12,12 24,0" stroke="${c.eye}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
      : state === "sleep"
      ? `<path d="M-5,9 q5,3 10,0" stroke="${c.eye}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
      : state === "thinking"
      ? `<line x1="-6" y1="9" x2="6" y2="9" stroke="${c.eye}" stroke-width="2.6" stroke-linecap="round"/>`
      : state === "clicked"
      ? `<ellipse cx="0" cy="10" rx="6" ry="4.5" fill="${c.eye}"/>`
      : `<path d="M-8,7 q8,5 16,0" stroke="${c.eye}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;

  const cheeks = `
    <circle cx="-22" cy="5" r="4" fill="${c.cheek}" opacity="0.55"/>
    <circle cx="22"  cy="5" r="4" fill="${c.cheek}" opacity="0.55"/>`;

  return `
    <ellipse cx="0" cy="${48}" rx="42" ry="8" fill="#000" opacity="0.35"/>
    <circle cx="0" cy="0" r="60" fill="url(#glow-blob)"/>
    <g transform="translate(0,${ty}) rotate(${rot}) scale(${sx} ${sy})">
      <circle cx="0" cy="0" r="${r}" fill="url(#body-blob)" stroke="${c.bodyEdge}" stroke-width="2"/>
      ${cheeks}
      ${eyes}
      ${mouth}
    </g>`;
}

// =============================================================================
// 3) CUBE — pikselleşmiş, minimalist.
// =============================================================================
const CUBE_PALETTE = {
  id: "cube",
  glow: "#9aff6c",
  headTop: "#1c1f1a",
  headBottom: "#1c1f1a",
  bodyTop: "#1c1f1a",
  bodyBottom: "#1c1f1a",
  bodyEdge: "#9aff6c",
  pixel: "#9aff6c"
};

function buildCubeVariantPalette(theme) {
  const accent = theme.accent;
  return {
    id: "cube",
    glow: lightenHex(accent, 0.14),
    headTop: "#1c1f1a",
    headBottom: "#1c1f1a",
    bodyTop: "#1c1f1a",
    bodyBottom: "#1c1f1a",
    bodyEdge: accent,
    pixel: lightenHex(accent, 0.04)
  };
}

function cubeFrame(state, frame, palette = CUBE_PALETTE) {
  const c = palette;
  const size = 76;
  const half = size / 2;

  let rot = 0, ty = 0, sx = 1, sy = 1;
  if (state === "idle") ty = [0, -1.5, -3, -1.5][frame];
  if (state === "sleep") { ty = [0, 1.5, 3, 1.5][frame]; sy = 0.92; }
  if (state === "happy") { ty = [-6, -14, -8, -1][frame]; rot = [-5, 5, -5, 0][frame]; }
  if (state === "thinking") rot = [-3, 0, 3, 0][frame];
  if (state === "clicked") sx = sy = [0.7, 0.85, 1, 1][frame];
  if (state === "dragged") rot = [-10, -3, 3, 10][frame];
  if (state === "walking") { ty = [0, -4, 0, -4][frame]; rot = [-3, 3, -3, 3][frame]; }

  const px = 7;
  let leftEye = [[0, 1], [1, 1]];
  let rightEye = [[3, 1], [4, 1]];

  if (state === "sleep") { leftEye = [[0, 1], [1, 2]]; rightEye = [[3, 1], [4, 2]]; }
  else if (state === "happy") { leftEye = [[0, 1]]; rightEye = [[4, 1]]; }
  else if (state === "thinking") {
    const sh = frame % 2;
    leftEye = [[0 + sh, 1]];
    rightEye = [[3 + sh, 1]];
  } else if (state === "clicked") {
    leftEye = [[0, 0], [1, 0], [0, 1], [1, 1]];
    rightEye = [[3, 0], [4, 0], [3, 1], [4, 1]];
  } else if (state === "dragged") {
    const sh = (frame % 2) - 0.5;
    leftEye = [[0, 1 + sh]];
    rightEye = [[4, 1 + sh]];
  }

  const eyesSvg = [...leftEye, ...rightEye]
    .map(([x, y]) => {
      const cx = -14 + x * px;
      const cy = -10 + y * px;
      return `<rect x="${cx}" y="${cy}" width="${px}" height="${px}" fill="${c.pixel}"/>`;
    })
    .join("");

  let mouth = "";
  if (state === "happy") {
    mouth = `<rect x="-10" y="8" width="${px}" height="${px}" fill="${c.pixel}"/>
             <rect x="-3" y="11" width="${px}" height="${px}" fill="${c.pixel}"/>
             <rect x="4" y="11" width="${px}" height="${px}" fill="${c.pixel}"/>
             <rect x="11" y="8" width="${px}" height="${px}" fill="${c.pixel}"/>`;
  } else if (state === "sleep") {
    mouth = `<rect x="-3" y="11" width="${px}" height="${px}" fill="${c.pixel}"/>`;
  } else if (state === "thinking") {
    mouth = `<rect x="-14" y="11" width="${px * 4}" height="${px}" fill="${c.pixel}"/>`;
  } else if (state === "clicked") {
    mouth = `<rect x="-7" y="8" width="${px * 2}" height="${px * 2}" fill="${c.pixel}"/>`;
  } else {
    mouth = `<rect x="-10" y="11" width="${px * 3}" height="${px}" fill="${c.pixel}"/>`;
  }

  return `
    <ellipse cx="0" cy="${half + 8}" rx="38" ry="6" fill="#000" opacity="0.4"/>
    <circle cx="0" cy="0" r="55" fill="url(#glow-cube)"/>
    <g transform="translate(0,${ty}) rotate(${rot}) scale(${sx} ${sy})">
      <rect x="${-half}" y="${-half}" width="${size}" height="${size}"
            rx="6" ry="6"
            fill="${c.bodyTop}" stroke="${c.bodyEdge}" stroke-width="2"/>
      ${eyesSvg}
      ${mouth}
    </g>`;
}

// CAYA v2 — Cube kadar sade, CaYaDev kirmizi/siyah terminal temali.
function cayaCubeFrame(state, frame, palette = CAYA_TERMINAL_PALETTE) {
  const c = palette;
  const size = 78;
  const half = size / 2;

  let rot = 0, ty = 0, sx = 1, sy = 1;
  if (state === "idle") ty = [0, -1.5, -3, -1.5][frame];
  if (state === "sleep") { ty = [0, 1.5, 3, 1.5][frame]; sy = 0.92; }
  if (state === "happy") { ty = [-6, -14, -8, -1][frame]; rot = [-5, 5, -5, 0][frame]; }
  if (state === "thinking") rot = [-3, 0, 3, 0][frame];
  if (state === "clicked") sx = sy = [0.72, 0.88, 1.03, 1][frame];
  if (state === "dragged") rot = [-10, -3, 3, 10][frame];
  if (state === "walking") { ty = [0, -4, 0, -4][frame]; rot = [-3, 3, -3, 3][frame]; }

  const px = 7;
  let leftEye = [[0, 1], [1, 1]];
  let rightEye = [[3, 1], [4, 1]];

  if (state === "sleep") { leftEye = [[0, 1], [1, 2]]; rightEye = [[3, 1], [4, 2]]; }
  else if (state === "happy") { leftEye = [[0, 1]]; rightEye = [[4, 1]]; }
  else if (state === "thinking") {
    const sh = frame % 2;
    leftEye = [[0 + sh, 1]];
    rightEye = [[3 + sh, 1]];
  } else if (state === "clicked") {
    leftEye = [[0, 0], [1, 0], [0, 1], [1, 1]];
    rightEye = [[3, 0], [4, 0], [3, 1], [4, 1]];
  } else if (state === "dragged") {
    const sh = (frame % 2) - 0.5;
    leftEye = [[0, 1 + sh]];
    rightEye = [[4, 1 + sh]];
  }

  const eyesSvg = [...leftEye, ...rightEye]
    .map(([x, y]) => {
      const cx = -14 + x * px;
      const cy = -13 + y * px;
      return `<rect x="${cx}" y="${cy}" width="${px}" height="${px}" fill="${c.pixel}"/>`;
    })
    .join("");

  let mouth = "";
  if (state === "happy") {
    mouth = `<rect x="-10" y="5" width="${px}" height="${px}" fill="${c.pixel}"/>
             <rect x="-3" y="8" width="${px}" height="${px}" fill="${c.pixel}"/>
             <rect x="4" y="8" width="${px}" height="${px}" fill="${c.pixel}"/>
             <rect x="11" y="5" width="${px}" height="${px}" fill="${c.pixel}"/>`;
  } else if (state === "sleep") {
    mouth = `<rect x="-3" y="8" width="${px}" height="${px}" fill="${c.pixel}"/>`;
  } else if (state === "thinking") {
    mouth = `<rect x="-14" y="8" width="${px * 4}" height="${px}" fill="${c.pixel}"/>`;
  } else if (state === "clicked") {
    mouth = `<rect x="-7" y="5" width="${px * 2}" height="${px * 2}" fill="${c.pixel}"/>`;
  } else {
    mouth = `<rect x="-10" y="8" width="${px * 3}" height="${px}" fill="${c.pixel}"/>`;
  }

  const cursorOpacity = state === "thinking" ? [0.2, 0.5, 1, 0.5][frame] : 1;

  return `
    <ellipse cx="0" cy="${half + 8}" rx="38" ry="6" fill="#000" opacity="0.42"/>
    <circle cx="0" cy="0" r="57" fill="url(#glow-caya)"/>
    <g transform="translate(0,${ty}) rotate(${rot}) scale(${sx} ${sy})">
      <rect x="${-half}" y="${-half}" width="${size}" height="${size}"
            rx="7" ry="7"
            fill="${c.body}" stroke="${c.edge}" stroke-width="2.2"/>
      <rect x="${-half + 6}" y="${-half + 6}" width="${size - 12}" height="${size - 12}"
            rx="4" ry="4"
            fill="${c.bodyAlt}" opacity="0.7"/>
      <path d="M${-half + 8},${-half + 17} H${half - 8}" stroke="${c.edgeDim}" stroke-width="2"/>
      ${eyesSvg}
      ${mouth}
      <rect x="-28" y="22" width="56" height="14" rx="3"
            fill="${c.terminal}" stroke="${c.edgeDim}" stroke-width="1"/>
      <text x="-23" y="32"
            font-family="Cascadia Code, Consolas, monospace"
            font-size="10" font-weight="700"
            fill="${c.pixelBright}">&gt;</text>
      <rect x="-12" y="27" width="13" height="2.5" fill="${c.pixel}" opacity="${cursorOpacity}"/>
      <rect x="5" y="27" width="8" height="2.5" fill="${c.pixel}" opacity="0.75"/>
    </g>`;
}

// -----------------------------------------------------------------------------
// Sprite sheet üreteci — her pet için tüm state×frame matrisini birleştirir.
// -----------------------------------------------------------------------------
function buildSheet(palette, frameRenderer) {
  let body = "";
  for (let row = 0; row < ROWS; row++) {
    const state = STATES[row];
    for (let col = 0; col < COLS; col++) {
      body += frameGroup(col, row, frameRenderer(state, col, palette));
    }
  }
  return wrapSvg(body, palette);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const targets = [
    { name: "caya.svg", palette: CAYA_TERMINAL_PALETTE, renderer: cayaFrame },
    { name: "blob.svg", palette: BLOB_PALETTE, renderer: blobFrame },
    { name: "cube.svg", palette: CUBE_PALETTE, renderer: cubeFrame }
  ];

  for (const theme of COLOR_VARIANTS) {
    targets.push(
      {
        name: `caya--${theme.id}.svg`,
        palette: buildCayaVariantPalette(theme),
        renderer: cayaFrame
      },
      {
        name: `blob--${theme.id}.svg`,
        palette: buildBlobVariantPalette(theme),
        renderer: blobFrame
      },
      {
        name: `cube--${theme.id}.svg`,
        palette: buildCubeVariantPalette(theme),
        renderer: cubeFrame
      }
    );
  }

  for (const t of targets) {
    const svg = buildSheet(t.palette, t.renderer);
    const path = resolve(OUT_DIR, t.name);
    await writeFile(path, svg, "utf8");
    console.log(`✔ wrote ${path} (${(svg.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
