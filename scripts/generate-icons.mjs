// scripts/generate-icons.mjs
// -----------------------------------------------------------------------------
// CaYaDev temalı app ikonlarını sıfır-bağımlılık ile üretir.
//   - 32x32.png, 128x128.png, 128x128@2x.png (256x256)
//   - icon.ico  (içine 256x256 PNG'yi gömer — Vista+ uyumlu PNG-in-ICO)
//
// Çıktı: src-tauri/icons/
//
// Kullanım: node scripts/generate-icons.mjs
// -----------------------------------------------------------------------------

import { deflateSync } from "node:zlib";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "src-tauri", "icons");

// --- 1) CaYa ikonunu raster (RGBA) olarak çiz --------------------------------
// Basit: kırmızı yuvarlatılmış kare arka plan + siyah "konsol penceresi" çerçevesi
// + beyaz "> _" ikonu. Tüm çizim aritmetik; SVG/canvas yok.

const RED = [0xff, 0x2b, 0x3d, 0xff];
const RED_DIM = [0xb4, 0x16, 0x24, 0xff];
const BLACK = [0x15, 0x16, 0x1b, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];
const TRANSPARENT = [0, 0, 0, 0];

function makeIconPixels(size) {
  const px = new Uint8ClampedArray(size * size * 4);
  const setPx = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    if (a === 255) {
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    } else if (a > 0) {
      // basit alpha blend
      const da = px[i + 3] / 255;
      const sa = a / 255;
      const oa = sa + da * (1 - sa);
      px[i]     = Math.round((r * sa + px[i]     * da * (1 - sa)) / (oa || 1));
      px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / (oa || 1));
      px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / (oa || 1));
      px[i + 3] = Math.round(oa * 255);
    }
  };

  // Şeffaf temizle.
  for (let i = 3; i < px.length; i += 4) px[i] = 0;

  // 1) Yuvarlatılmış kırmızı kare (arka plan).
  const radius = Math.max(2, Math.round(size * 0.18));
  const pad = Math.round(size * 0.06);
  drawRoundedRect(setPx, pad, pad, size - pad * 2, size - pad * 2, radius, RED);

  // 2) İnce dış çerçeve (koyu kırmızı).
  drawRoundedRectStroke(setPx, pad, pad, size - pad * 2, size - pad * 2, radius, RED_DIM);

  // 3) İçeride siyah konsol penceresi.
  const innerPad = Math.round(size * 0.20);
  const inner = drawRoundedRect(
    setPx,
    innerPad,
    innerPad,
    size - innerPad * 2,
    size - innerPad * 2,
    Math.max(2, Math.round(size * 0.10)),
    BLACK
  );

  // 4) Üst bar (kırmızı şerit).
  const barH = Math.max(2, Math.round(size * 0.08));
  for (let y = inner.y0; y < inner.y0 + barH; y++) {
    for (let x = inner.x0; x < inner.x1; x++) setPx(x, y, RED);
  }
  // Üst barda 3 nokta (window controls).
  const dotR = Math.max(1, Math.round(size * 0.012));
  const dotY = inner.y0 + Math.round(barH / 2);
  drawCircle(setPx, inner.x0 + dotR * 4, dotY, dotR, WHITE);
  drawCircle(setPx, inner.x0 + dotR * 8, dotY, dotR, WHITE);
  drawCircle(setPx, inner.x0 + dotR * 12, dotY, dotR, WHITE);

  // 5) İçerikte ">" prompt ve "_" cursor (CaYa esinli).
  // ">" piksel bloklu üçgen.
  const promptX = inner.x0 + Math.round(size * 0.06);
  const promptY = inner.y0 + Math.round(size * 0.20);
  const promptH = Math.round(size * 0.25);
  drawChevron(setPx, promptX, promptY, promptH, WHITE);

  const cursorX = promptX + Math.round(size * 0.18);
  const cursorY = promptY + Math.round(promptH * 0.7);
  const cursorW = Math.round(size * 0.14);
  const cursorH = Math.max(2, Math.round(size * 0.05));
  for (let y = cursorY; y < cursorY + cursorH; y++) {
    for (let x = cursorX; x < cursorX + cursorW; x++) setPx(x, y, WHITE);
  }

  return Buffer.from(px.buffer);
}

// --- Çizim primitifleri ------------------------------------------------------

function drawRoundedRect(setPx, x, y, w, h, r, color) {
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (insideRounded(px, py, w, h, r)) {
        setPx(x + px, y + py, color);
      }
    }
  }
  return { x0: x, y0: y, x1: x + w, y1: y + h };
}

function drawRoundedRectStroke(setPx, x, y, w, h, r, color) {
  // 2 px kalınlık.
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (
        insideRounded(px, py, w, h, r) &&
        !insideRounded(px, py, w, h, r, 2)
      ) {
        setPx(x + px, y + py, color);
      }
    }
  }
}

function insideRounded(px, py, w, h, r, inset = 0) {
  const xi = px + inset;
  const yi = py + inset;
  const wi = w - inset * 2;
  const hi = h - inset * 2;
  if (xi < 0 || yi < 0 || xi >= wi || yi >= hi) return false;
  // Köşe kontrolleri
  if (xi < r && yi < r)
    return (r - xi) ** 2 + (r - yi) ** 2 <= r * r;
  if (xi >= wi - r && yi < r)
    return (xi - (wi - r - 1)) ** 2 + (r - yi) ** 2 <= r * r;
  if (xi < r && yi >= hi - r)
    return (r - xi) ** 2 + (yi - (hi - r - 1)) ** 2 <= r * r;
  if (xi >= wi - r && yi >= hi - r)
    return (xi - (wi - r - 1)) ** 2 + (yi - (hi - r - 1)) ** 2 <= r * r;
  return true;
}

function drawCircle(setPx, cx, cy, r, color) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) setPx(cx + x, cy + y, color);
    }
  }
}

// ">" şeklini bloklu çizer.
function drawChevron(setPx, x, y, h, color) {
  const thickness = Math.max(2, Math.round(h * 0.18));
  const half = Math.round(h / 2);
  for (let i = 0; i < half; i++) {
    for (let t = 0; t < thickness; t++) {
      setPx(x + i, y + i + t, color);
      setPx(x + i, y + (h - 1 - i) - t, color);
    }
  }
}

// --- PNG ENCODER (sıfır bağımlılık) -----------------------------------------
// Sade RGBA-8 PNG; filter byte = 0 (None) ve zlib deflate ile sıkıştırma.

function crc32(buf) {
  let c;
  if (!crc32.table) {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    crc32.table = t;
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = (crc32.table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // color type RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  // Filtered scanlines (filter byte 0 + raw pixels)
  const rowLen = width * 4;
  const filtered = Buffer.alloc((rowLen + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (rowLen + 1)] = 0; // filter None
    rgba.copy(filtered, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen);
  }
  const idat = deflateSync(filtered, { level: 9 });

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// --- ICO (PNG-in-ICO formatı, Vista+) ----------------------------------------
// Tek bir PNG embed eden ICO container yazıyoruz. Modern Windows tüm boyutları
// PNG embed olarak destekler.

function encodeIco(pngs /* [{ size, buffer }] */) {
  const HEADER = 6;
  const ENTRY = 16;
  const headerBuf = Buffer.alloc(HEADER);
  headerBuf.writeUInt16LE(0, 0); // reserved
  headerBuf.writeUInt16LE(1, 2); // type = 1 (icon)
  headerBuf.writeUInt16LE(pngs.length, 4); // image count

  const entries = Buffer.alloc(ENTRY * pngs.length);
  let offset = HEADER + ENTRY * pngs.length;
  pngs.forEach((p, idx) => {
    const off = idx * ENTRY;
    entries.writeUInt8(p.size >= 256 ? 0 : p.size, off + 0); // width (0 = 256)
    entries.writeUInt8(p.size >= 256 ? 0 : p.size, off + 1); // height
    entries.writeUInt8(0, off + 2);            // colors in palette (0 = none)
    entries.writeUInt8(0, off + 3);            // reserved
    entries.writeUInt16LE(1, off + 4);         // color planes
    entries.writeUInt16LE(32, off + 6);        // bits per pixel
    entries.writeUInt32LE(p.buffer.length, off + 8); // image size
    entries.writeUInt32LE(offset, off + 12);   // image data offset
    offset += p.buffer.length;
  });

  return Buffer.concat([headerBuf, entries, ...pngs.map((p) => p.buffer)]);
}

// --- Yeniden boyutlandırma (nearest-neighbor) -------------------------------
// Sadece tek bir 256x256 raster çiziyor sonra küçük boyutları downsample'lıyoruz.

function resampleNearest(src, srcSize, dstSize) {
  const out = Buffer.alloc(dstSize * dstSize * 4);
  const ratio = srcSize / dstSize;
  for (let y = 0; y < dstSize; y++) {
    const sy = Math.min(srcSize - 1, Math.floor(y * ratio));
    for (let x = 0; x < dstSize; x++) {
      const sx = Math.min(srcSize - 1, Math.floor(x * ratio));
      const sIdx = (sy * srcSize + sx) * 4;
      const dIdx = (y * dstSize + x) * 4;
      out[dIdx] = src[sIdx];
      out[dIdx + 1] = src[sIdx + 1];
      out[dIdx + 2] = src[sIdx + 2];
      out[dIdx + 3] = src[sIdx + 3];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
async function main() {
  await mkdir(OUT, { recursive: true });

  // Yüksek çözünürlükte tek bir kaynak çiz.
  const SRC = 256;
  const srcRgba = makeIconPixels(SRC);

  // Hedef PNG'ler.
  const targets = [
    { name: "32x32.png", size: 32 },
    { name: "128x128.png", size: 128 },
    { name: "128x128@2x.png", size: 256 }
  ];

  for (const t of targets) {
    const rgba = t.size === SRC ? srcRgba : resampleNearest(srcRgba, SRC, t.size);
    const png = encodePng(t.size, t.size, rgba);
    await writeFile(resolve(OUT, t.name), png);
    console.log(`✔ ${t.name} (${(png.length / 1024).toFixed(1)} KB)`);
  }

  // ICO — 16, 32, 48, 64, 128, 256 boyutlarını embed et.
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoPngs = icoSizes.map((size) => {
    const rgba = size === SRC ? srcRgba : resampleNearest(srcRgba, SRC, size);
    return { size, buffer: encodePng(size, size, rgba) };
  });
  const ico = encodeIco(icoPngs);
  await writeFile(resolve(OUT, "icon.ico"), ico);
  console.log(`✔ icon.ico (${(ico.length / 1024).toFixed(1)} KB, ${icoSizes.length} sizes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
