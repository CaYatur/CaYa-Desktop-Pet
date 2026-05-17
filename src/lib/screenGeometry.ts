// screenGeometry.ts
// -----------------------------------------------------------------------------
// Çok ekranlı sistemlerde pet penceresinin sınır hesaplarını yapan yardımcılar.
//
// Tasarım kararları:
//   * Pencere boyutu (176x176), pet görselinin gerçek boyutundan (144x144)
//     büyüktür — pet ortalı durur. Sınır kontrolünde pencerenin tamamı değil
//     pet görselinin sığması istenir; böylece pet ekranın gerçek kenarına
//     kadar gidebilir (pencere şeffaf kısmı monitör dışına 16 px taşabilir).
//   * Her monitör KENDİ sınırları içinde değerlendirilir — birleşim
//     (union) kullanmak farklı çözünürlükteki ekranlarda "boşluğa" düşmeye
//     yol açar. Pet'in görsel merkezi her zaman EN AZ BİR monitörün
//     içindedir.
//   * Bir monitörden diğerine geçiş, paylaşılan kenarın orta noktası
//     üzerinden yapılır ("gateway"). Geçiş noktası iki monitörde de pet'in
//     sığabildiği bir konum olarak seçilir; böylece pet ışınlanmadan
//     yürüyerek geçer.
// -----------------------------------------------------------------------------

export interface MonitorInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor?: number;
}

// Pet görseli pencerenin tam ortasında, 144x144 boyutunda. Pencere kenarına
// 16 px boş alan kalır — bu offset'ler clamp hesabında düşülür.
export const PET_VISUAL_W = 144;
export const PET_VISUAL_H = 144;
export const PET_VISUAL_PAD_X = 16; // (176 - 144) / 2
export const PET_VISUAL_PAD_Y = 16;

// Pet'in monitör kenarına gerçekten "değmesi" için. 0 yaparsak pet kenarda
// sıfır boşluk bırakacak; küçük bir emniyet payı UI'ı görsel olarak daha iyi
// yapar ve dpi yuvarlamasından kaynaklı dalgalanmaları önler.
const SAFETY_PAD = 1;

/** Pet'in görsel merkez koordinatı (pencere pos x/y verildiğinde). */
export function petVisualCenter(
  winX: number,
  winY: number,
  winW: number,
  winH: number
) {
  return { cx: winX + winW / 2, cy: winY + winH / 2 };
}

/**
 * Verilen monitör için pencere pozisyonu (x,y) sınırları — pet görselinin
 * bu monitörün içinde kalması koşuluyla.
 */
export function petWindowBoundsForMonitor(
  m: MonitorInfo,
  winW: number,
  winH: number
) {
  // Pencerenin pet görselinden ne kadar geniş olduğu (sağ/alt taraf).
  const padRight = winW - PET_VISUAL_PAD_X - PET_VISUAL_W;
  const padBottom = winH - PET_VISUAL_PAD_Y - PET_VISUAL_H;

  const minX = m.x - PET_VISUAL_PAD_X + SAFETY_PAD;
  const maxX = m.x + m.width - PET_VISUAL_PAD_X - PET_VISUAL_W - SAFETY_PAD;
  const minY = m.y - PET_VISUAL_PAD_Y + SAFETY_PAD;
  const maxY = m.y + m.height - PET_VISUAL_PAD_Y - PET_VISUAL_H - SAFETY_PAD;

  // (winW < PET_VISUAL_W + 32 ise pad negatif olur — buradan emin olalım)
  void padRight;
  void padBottom;

  return { minX, maxX, minY, maxY };
}

/** Pet'in görsel merkezi bu monitörün içinde mi? */
export function petCenterInsideMonitor(
  m: MonitorInfo,
  winX: number,
  winY: number,
  winW: number,
  winH: number
) {
  const { cx, cy } = petVisualCenter(winX, winY, winW, winH);
  return cx >= m.x && cx < m.x + m.width && cy >= m.y && cy < m.y + m.height;
}

/**
 * Pet'in görsel merkezinin bulunduğu monitörü döner. Hiçbirinde değilse
 * (geçici geçiş hatası) merkez koordinatına en yakın monitörü verir.
 */
export function findMonitorForPet(
  monitors: MonitorInfo[],
  winX: number,
  winY: number,
  winW: number,
  winH: number
): MonitorInfo | null {
  if (monitors.length === 0) return null;
  const { cx, cy } = petVisualCenter(winX, winY, winW, winH);
  for (const m of monitors) {
    if (cx >= m.x && cx < m.x + m.width && cy >= m.y && cy < m.y + m.height) {
      return m;
    }
  }
  let best: MonitorInfo | null = null;
  let bestDist = Infinity;
  for (const m of monitors) {
    const dx = Math.max(m.x - cx, 0, cx - (m.x + m.width));
    const dy = Math.max(m.y - cy, 0, cy - (m.y + m.height));
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

/** Belirli bir monitörün geçerli aralığına kırp. */
export function clampToMonitor(
  m: MonitorInfo,
  winW: number,
  winH: number,
  x: number,
  y: number
) {
  const { minX, maxX, minY, maxY } = petWindowBoundsForMonitor(m, winW, winH);
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y))
  };
}

/**
 * Verilen monitör kümesinden HERHANGİ BİRİNDE pet merkezi varsa true.
 * Aynı zamanda pencere pos kendi monitörünün sınırları içinde olmalı —
 * yani pet görseli o monitörde tamamen görünür.
 */
export function isPositionValidInAny(
  monitors: MonitorInfo[],
  winW: number,
  winH: number,
  x: number,
  y: number
): boolean {
  const { cx, cy } = petVisualCenter(x, y, winW, winH);
  for (const m of monitors) {
    if (cx < m.x || cx >= m.x + m.width) continue;
    if (cy < m.y || cy >= m.y + m.height) continue;
    return true;
  }
  return false;
}

/**
 * Pozisyonu — verilen monitör kümesinden hangisi en yakınsa — onun bounds'una
 * kırp. "monitör kümesi" tipik olarak [currentMonitor, nextMonitor] olur;
 * yani pet, bu iki monitörün herhangi birinde geçerli olabilir.
 */
export function clampToNearestOf(
  monitors: MonitorInfo[],
  winW: number,
  winH: number,
  x: number,
  y: number
): { x: number; y: number } {
  if (monitors.length === 0) return { x, y };
  if (isPositionValidInAny(monitors, winW, winH, x, y)) return { x, y };

  let bestX = x;
  let bestY = y;
  let bestDist = Infinity;
  for (const m of monitors) {
    const c = clampToMonitor(m, winW, winH, x, y);
    const dx = c.x - x;
    const dy = c.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestX = c.x;
      bestY = c.y;
    }
  }
  return { x: bestX, y: bestY };
}

// ---- Gateway / patika planlama --------------------------------------------

export interface Gateway {
  /** monA'nın hangi kenarından monB'ye geçiliyor. */
  edge: "right" | "left" | "bottom" | "top";
  /** Geçişten hemen sonra pet'in monB içinde olacağı önerilen pencere konumu. */
  x: number;
  y: number;
}

/**
 * monA ile monB arasında pet'in yürüyerek geçebileceği bir geçit var mı?
 * Geçit varsa pet bu noktada her iki monitörde de görsel olarak sığar.
 */
export function findGateway(
  a: MonitorInfo,
  b: MonitorInfo,
  winW: number,
  winH: number
): Gateway | null {
  const tol = 4;

  // a'nın sağ kenarı = b'nin sol kenarı
  if (Math.abs(a.x + a.width - b.x) <= tol) {
    const top = Math.max(a.y, b.y);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    if (bottom - top >= PET_VISUAL_H + 4) {
      const aB = petWindowBoundsForMonitor(a, winW, winH);
      const bB = petWindowBoundsForMonitor(b, winW, winH);
      const yMin = Math.max(aB.minY, bB.minY);
      const yMax = Math.min(aB.maxY, bB.maxY);
      if (yMax >= yMin) {
        const cy = (top + bottom) / 2;
        const wantY = cy - winH / 2;
        const y = Math.max(yMin, Math.min(yMax, wantY));
        // Pet'in görsel merkezi b'nin sol kenarının hemen sağına geçsin.
        const x = b.x - PET_VISUAL_PAD_X + SAFETY_PAD + 1;
        return { edge: "right", x, y };
      }
    }
  }
  // a'nın sol kenarı = b'nin sağ kenarı
  if (Math.abs(a.x - (b.x + b.width)) <= tol) {
    const top = Math.max(a.y, b.y);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    if (bottom - top >= PET_VISUAL_H + 4) {
      const aB = petWindowBoundsForMonitor(a, winW, winH);
      const bB = petWindowBoundsForMonitor(b, winW, winH);
      const yMin = Math.max(aB.minY, bB.minY);
      const yMax = Math.min(aB.maxY, bB.maxY);
      if (yMax >= yMin) {
        const cy = (top + bottom) / 2;
        const wantY = cy - winH / 2;
        const y = Math.max(yMin, Math.min(yMax, wantY));
        // b'nin sağ iç kenarı.
        const x = b.x + b.width - PET_VISUAL_PAD_X - PET_VISUAL_W - SAFETY_PAD - 1;
        return { edge: "left", x, y };
      }
    }
  }
  // a'nın alt kenarı = b'nin üst kenarı
  if (Math.abs(a.y + a.height - b.y) <= tol) {
    const left = Math.max(a.x, b.x);
    const right = Math.min(a.x + a.width, b.x + b.width);
    if (right - left >= PET_VISUAL_W + 4) {
      const aB = petWindowBoundsForMonitor(a, winW, winH);
      const bB = petWindowBoundsForMonitor(b, winW, winH);
      const xMin = Math.max(aB.minX, bB.minX);
      const xMax = Math.min(aB.maxX, bB.maxX);
      if (xMax >= xMin) {
        const cx = (left + right) / 2;
        const wantX = cx - winW / 2;
        const x = Math.max(xMin, Math.min(xMax, wantX));
        const y = b.y - PET_VISUAL_PAD_Y + SAFETY_PAD + 1;
        return { edge: "bottom", x, y };
      }
    }
  }
  // a'nın üst kenarı = b'nin alt kenarı
  if (Math.abs(a.y - (b.y + b.height)) <= tol) {
    const left = Math.max(a.x, b.x);
    const right = Math.min(a.x + a.width, b.x + b.width);
    if (right - left >= PET_VISUAL_W + 4) {
      const aB = petWindowBoundsForMonitor(a, winW, winH);
      const bB = petWindowBoundsForMonitor(b, winW, winH);
      const xMin = Math.max(aB.minX, bB.minX);
      const xMax = Math.min(aB.maxX, bB.maxX);
      if (xMax >= xMin) {
        const cx = (left + right) / 2;
        const wantX = cx - winW / 2;
        const x = Math.max(xMin, Math.min(xMax, wantX));
        const y = b.y + b.height - PET_VISUAL_PAD_Y - PET_VISUAL_H - SAFETY_PAD - 1;
        return { edge: "top", x, y };
      }
    }
  }
  return null;
}

export interface Waypoint {
  /** Bu waypoint'e ulaşıldığında pet'in olması gereken pencere konumu. */
  x: number;
  y: number;
  /** Bu waypoint'e ulaşıldığında pet hangi monitörde olacak. */
  monitor: MonitorInfo;
}

/**
 * Pet'in başlangıç pos'undan hedef pos'a (waypoint listesi) BFS ile yol bulur.
 * Aynı monitör üzerinde -> tek waypoint (clamp edilmiş hedef).
 * Farklı monitör -> gateway'lerden geçerek hedefe ulaşan waypoint serisi.
 */
export function planPath(
  monitors: MonitorInfo[],
  startWinX: number,
  startWinY: number,
  endWinX: number,
  endWinY: number,
  winW: number,
  winH: number
): Waypoint[] {
  if (monitors.length === 0) return [];

  const startM =
    findMonitorForPet(monitors, startWinX, startWinY, winW, winH) ?? monitors[0];

  // Hedef hangi monitöre düşüyor?
  const targetCx = endWinX + winW / 2;
  const targetCy = endWinY + winH / 2;
  let endM: MonitorInfo | null = null;
  for (const m of monitors) {
    if (
      targetCx >= m.x &&
      targetCx < m.x + m.width &&
      targetCy >= m.y &&
      targetCy < m.y + m.height
    ) {
      endM = m;
      break;
    }
  }
  if (!endM) {
    // En yakın monitör.
    let bestDist = Infinity;
    for (const m of monitors) {
      const dx = Math.max(m.x - targetCx, 0, targetCx - (m.x + m.width));
      const dy = Math.max(m.y - targetCy, 0, targetCy - (m.y + m.height));
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        endM = m;
      }
    }
    endM ??= startM;
  }

  if (startM === endM) {
    const c = clampToMonitor(endM, winW, winH, endWinX, endWinY);
    return [{ x: c.x, y: c.y, monitor: endM }];
  }

  // BFS — monitör grafı.
  interface Node {
    monitor: MonitorInfo;
    path: Waypoint[];
  }
  const queue: Node[] = [{ monitor: startM, path: [] }];
  const visited = new Set<MonitorInfo>([startM]);

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.monitor === endM) {
      const c = clampToMonitor(endM, winW, winH, endWinX, endWinY);
      return [...node.path, { x: c.x, y: c.y, monitor: endM }];
    }
    for (const next of monitors) {
      if (visited.has(next)) continue;
      const gate = findGateway(node.monitor, next, winW, winH);
      if (!gate) continue;
      visited.add(next);
      queue.push({
        monitor: next,
        path: [...node.path, { x: gate.x, y: gate.y, monitor: next }]
      });
    }
  }

  // Hedef monitör bağlı değil — kendi monitöründe en yakın noktaya gitsin.
  const c = clampToMonitor(startM, winW, winH, endWinX, endWinY);
  return [{ x: c.x, y: c.y, monitor: startM }];
}
