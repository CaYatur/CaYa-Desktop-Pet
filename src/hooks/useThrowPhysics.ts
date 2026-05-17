// useThrowPhysics.ts
// -----------------------------------------------------------------------------
// Pet penceresine "fırlatma" fiziği veren hook.
//
// Mantık:
//   * Drag sırasında her frame'de window konumu sample'lanır → son N örnekten
//     velocity (px/s) hesaplanır.
//   * Drag bittikten sonra velocity yeterince büyükse (THROW_THRESHOLD)
//     momentum simülasyonu başlar:
//       - Her frame: pos += velocity * dt;  velocity *= friction
//       - Ekran sınırlarına çarpınca velocity tersine döner (bounce)
//       - Velocity yeterince küçülünce simülasyon durur, onIdle çağrılır
//   * Velocity küçükse direkt onIdle (yavaş bırakma → idle'a dön)
//
// Tasarım:
//   * Çoklu pencere desteği için her hook örneği ait olduğu pencere üzerinde
//     çalışır (getCurrentWindow ile).
//   * Otonom hareket başka bir hook'tur; fizik tamamlanınca o devreye girer.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  clampToNearestOf,
  findMonitorForPet,
  isPositionValidInAny,
  petWindowBoundsForMonitor,
  type MonitorInfo
} from "../lib/screenGeometry";

// İstenirse dışarıdan override edilebilir; mantıklı defaults:
const SAMPLE_INTERVAL_MS = 30; // pencere konumu örnekleme aralığı
const VELOCITY_WINDOW_MS = 120; // son 120 ms'lik örneklerden velocity al
const THROW_THRESHOLD = 600; // px/s — bu hızın altı "yavaş bırakma" sayılır
const FRICTION = 0.92; // her frame için kalan velocity oranı
const STOP_SPEED = 40; // px/s — bu hızın altına düşünce dur
const BOUNCE_DAMP = 0.55; // duvara çarpınca velocity bu oranda korunur (ters yönde)

interface DesktopInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  monitors: MonitorInfo[];
}

interface WinState {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

interface Args {
  /** Atış başladığında çağrılır (momentum simülasyonu aktifken). */
  onThrowStart?: () => void;
  /** Simülasyon bittiğinde — pet artık duruyor; otonom hareket başlayabilir. */
  onSettled?: () => void;
  /** Süre boyunca yapılan polling'i kontrol için. */
  enabled?: boolean;
}

export function useThrowPhysics({ onThrowStart, onSettled, enabled = true }: Args = {}) {
  const samplesRef = useRef<Sample[]>([]);
  const samplingTimerRef = useRef<number | null>(null);
  const animatingRef = useRef(false);
  const onThrowStartRef = useRef(onThrowStart);
  const onSettledRef = useRef(onSettled);

  useEffect(() => {
    onThrowStartRef.current = onThrowStart;
    onSettledRef.current = onSettled;
  }, [onThrowStart, onSettled]);

  // Pencere konumunu periyodik olarak sample'la (drag sırasında).
  const startSampling = useCallback(async () => {
    if (!enabled) return;
    samplesRef.current = [];
    // İlk sample.
    try {
      const w: WinState = await invoke("get_window_state");
      samplesRef.current.push({ t: performance.now(), x: w.x, y: w.y });
    } catch {
      /* dev/web modda olabilir */
    }

    samplingTimerRef.current = window.setInterval(async () => {
      try {
        const w: WinState = await invoke("get_window_state");
        const now = performance.now();
        samplesRef.current.push({ t: now, x: w.x, y: w.y });
        // Eski örnekleri at.
        const cutoff = now - VELOCITY_WINDOW_MS * 2;
        while (samplesRef.current.length > 2 && samplesRef.current[0].t < cutoff) {
          samplesRef.current.shift();
        }
      } catch {
        /* ignore */
      }
    }, SAMPLE_INTERVAL_MS);
  }, [enabled]);

  const stopSampling = useCallback(() => {
    if (samplingTimerRef.current != null) {
      window.clearInterval(samplingTimerRef.current);
      samplingTimerRef.current = null;
    }
  }, []);

  /** Son sample'lardan velocity tahmin et (px/s). */
  const estimateVelocity = useCallback((): { vx: number; vy: number } => {
    const samples = samplesRef.current;
    if (samples.length < 2) return { vx: 0, vy: 0 };
    const now = performance.now();
    // VELOCITY_WINDOW_MS içindeki en eski sample'ı bul.
    let start = samples[samples.length - 2];
    for (let i = samples.length - 1; i >= 0; i--) {
      if (now - samples[i].t >= VELOCITY_WINDOW_MS) {
        start = samples[i];
        break;
      }
      if (i === 0) start = samples[i];
    }
    const end = samples[samples.length - 1];
    const dt = (end.t - start.t) / 1000;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return {
      vx: (end.x - start.x) / dt,
      vy: (end.y - start.y) / dt
    };
  }, []);

  /** Drag bittiğinde çağrılır. Velocity büyükse fırlat, küçükse direkt settle. */
  const releaseWithVelocity = useCallback(async () => {
    stopSampling();
    const { vx, vy } = estimateVelocity();
    const speed = Math.hypot(vx, vy);

    if (speed < THROW_THRESHOLD) {
      // Yavaş bırakma — direkt settle.
      onSettledRef.current?.();
      return;
    }

    // Momentum simülasyonu başla.
    animatingRef.current = true;
    onThrowStartRef.current?.();

    let vxCur = vx;
    let vyCur = vy;
    let last = performance.now();

    // Başlangıç durumu + monitor sınırları.
    let win: WinState | null = null;
    let desktop: DesktopInfo | null = null;
    try {
      win = await invoke<WinState>("get_window_state");
      desktop = await invoke<DesktopInfo>("get_desktop_info");
    } catch {
      animatingRef.current = false;
      onSettledRef.current?.();
      return;
    }

    const w = win.width;
    const h = win.height;

    // Pet'in mevcut monitörünü bul — bounce sınırları ÜNYÖN değil, BU monitör.
    // Farklı çözünürlükteki ekranlarda union kullanılırsa pet "boşluğa"
    // taşıp orada zıplayabiliyordu.
    const monitors: MonitorInfo[] =
      desktop.monitors && desktop.monitors.length > 0
        ? desktop.monitors
        : [
            {
              x: desktop.x,
              y: desktop.y,
              width: desktop.width,
              height: desktop.height,
              scale_factor: 1
            }
          ];
    const currentMonitor =
      findMonitorForPet(monitors, win.x, win.y, w, h) ?? monitors[0];
    const { minX, maxX, minY, maxY } = petWindowBoundsForMonitor(
      currentMonitor,
      w,
      h
    );

    // Drag'den çıkan pozisyon sınır dışında olabilir — anında içeri çek.
    let posX = Math.max(minX, Math.min(maxX, win.x));
    let posY = Math.max(minY, Math.min(maxY, win.y));

    const window_ = getCurrentWindow();

    const tick = async (now: number) => {
      if (!animatingRef.current) return;
      const dt = Math.min(0.05, (now - last) / 1000); // 50ms üstünü clamp
      last = now;

      // Velocity uygula.
      posX += vxCur * dt;
      posY += vyCur * dt;

      // Friction.
      const decay = Math.pow(FRICTION, dt * 60); // 60fps eşdeğeri normalleştirme
      vxCur *= decay;
      vyCur *= decay;

      // Duvar çarpışmaları (bounce) — yalnızca aktif monitör sınırlarında.
      if (posX < minX) {
        posX = minX;
        vxCur = -vxCur * BOUNCE_DAMP;
      } else if (posX > maxX) {
        posX = maxX;
        vxCur = -vxCur * BOUNCE_DAMP;
      }
      if (posY < minY) {
        posY = minY;
        vyCur = -vyCur * BOUNCE_DAMP;
      } else if (posY > maxY) {
        posY = maxY;
        vyCur = -vyCur * BOUNCE_DAMP;
      }

      // Sürpriz — başka bir monitöre kaymışsa (çoklu ekran arası fizik)
      // pet'i komşu monitörün geçerli alanına çek; ışınlanmasın diye sadece
      // gerçekten geçerli kümede tut.
      if (!isPositionValidInAny(monitors, w, h, posX, posY)) {
        const c = clampToNearestOf(monitors, w, h, posX, posY);
        posX = c.x;
        posY = c.y;
      }

      // Pencereyi taşı.
      try {
        await window_.setPosition({
          type: "Physical",
          x: Math.round(posX),
          y: Math.round(posY)
        } as any);
      } catch {
        /* pencere kapanmış olabilir */
        animatingRef.current = false;
        return;
      }

      // Durma koşulu.
      if (Math.hypot(vxCur, vyCur) < STOP_SPEED) {
        animatingRef.current = false;
        onSettledRef.current?.();
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [estimateVelocity, stopSampling]);

  // Dışarı doğru bir cancel API'si — fizik koşarken kullanıcı tekrar drag'e başlarsa.
  const cancel = useCallback(() => {
    animatingRef.current = false;
    stopSampling();
  }, [stopSampling]);

  useEffect(() => {
    return () => {
      animatingRef.current = false;
      stopSampling();
    };
  }, [stopSampling]);

  return {
    startSampling,
    releaseWithVelocity,
    cancel,
    /** Şu anda fizik simülasyonu koşuyor mu? */
    isAnimating: () => animatingRef.current
  };
}
