// useWander.ts
// -----------------------------------------------------------------------------
// Pet'i ekranda akıllıca dolaştıran otonom hareket hook'u.
//
// Davranış:
//   * Rastgele bir hedef seçilir — önce hedef monitör seçilir, sonra o
//     monitörün pet'in görsel olarak sığabileceği iç aralığından bir nokta.
//   * Hedef başka bir monitördeyse `planPath` ile geçiş waypoint'leri
//     hesaplanır; pet, ortak kenarlara denk gelen "geçit" noktalarından
//     komşu monitöre yürüyerek geçer. Hiç ışınlama yok.
//   * Yürürken her frame'de pet'in görsel merkezinin geçerli monitörler
//     içinde kalıp kalmadığı kontrol edilir; çıkış denemesi olursa eksen
//     bazında kaydırma (slide) yapılır.
//   * Ara sıra rastgele "zıplama" yapar.
//   * Drag/click/throw için cancel()/resume() API'leri.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  clampToMonitor,
  clampToNearestOf,
  findMonitorForPet,
  isPositionValidInAny,
  petWindowBoundsForMonitor,
  planPath,
  type MonitorInfo,
  type Waypoint
} from "../lib/screenGeometry";

interface DesktopWindowInfo {
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface DesktopInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  monitors: MonitorInfo[];
  visible_windows: DesktopWindowInfo[];
}
interface WinState {
  x: number;
  y: number;
  width: number;
  height: number;
}

const WALK_SPEED = 90; // px/s
const TARGET_REACH = 12; // px — son waypoint'e bu mesafede yaklaştıysa varıldı say
const WAYPOINT_REACH = 18; // px — ara waypoint için biraz daha gevşek
const IDLE_PAUSE_MIN_MS = 1500;
const IDLE_PAUSE_MAX_MS = 5000;
const JUMP_CHANCE = 0.18;
const JUMP_VY = -260;
const GRAVITY = 900;
const FRIEND_GREET_DIST = 220;
// Güvenlik ağı: bir waypoint'te bu kadar süredir anlamlı ilerleme yoksa vazgeç.
const STUCK_TIMEOUT_MS = 1200;
const STUCK_MIN_PROGRESS_PX = 2;
// Zıplama bu süreden uzun süremez — bir köşede sıkışıp gravity'nin vy'yi
// asla sıfırlayamadığı durumda kilitlenmeyi önler.
const JUMP_MAX_MS = 1100;

// ── Etkileşim (pencerelerle) ─────────────────────────────────────────────
type InteractKind = "skip" | "nudge" | "bump" | "shake" | "hop";

interface InteractActionSpec {
  kind: InteractKind;
  weight: number;
  cooldownMs: number;
}

// Ağırlıklı random davranış havuzu. Pet bir pencerenin üstünden geçerken
// her seferinde otomatik itme yerine bunlardan birini rastgele seçer:
//   - skip:  hiçbir şey yapma (sadece üzerinden geç, doğal hissi ver)
//   - nudge: yürüyüş yönünde küçük tek-adım itme
//   - bump:  yumuşak, daha büyük, ease-out + overshoot itme
//   - shake: pencereyi sönümlenen sallama
//   - hop:   pencereyi kısa süre zıplatıp indir
const INTERACT_ACTIONS: InteractActionSpec[] = [
  { kind: "skip", weight: 28, cooldownMs: 320 },
  { kind: "nudge", weight: 32, cooldownMs: 750 },
  { kind: "bump", weight: 16, cooldownMs: 1900 },
  { kind: "shake", weight: 14, cooldownMs: 2300 },
  { kind: "hop", weight: 10, cooldownMs: 1700 }
];

function pickInteractAction(): InteractActionSpec {
  const total = INTERACT_ACTIONS.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const a of INTERACT_ACTIONS) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return INTERACT_ACTIONS[0];
}

export interface FriendSnapshot {
  label: string;
  petId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Args {
  enabled: boolean;
  onWalkingChange?: (walking: boolean) => void;
  onGreet?: (friend: FriendSnapshot) => void;
  friends: FriendSnapshot[];
  ownLabel: string;
  interactiveEnabled?: boolean;
}

function monitorsOf(desktop: DesktopInfo): MonitorInfo[] {
  if (desktop.monitors.length > 0) return desktop.monitors;
  return [
    {
      x: desktop.x,
      y: desktop.y,
      width: desktop.width,
      height: desktop.height,
      scale_factor: 1
    }
  ];
}

export function useWander({
  enabled,
  onWalkingChange,
  onGreet,
  friends,
  ownLabel,
  interactiveEnabled = false
}: Args) {
  const runningRef = useRef(false);
  const cancelRef = useRef(false);
  const friendsRef = useRef<FriendSnapshot[]>(friends);
  const interactiveRef = useRef(interactiveEnabled);
  const lastGreetRef = useRef<Record<string, number>>({});
  const onWalkingRef = useRef(onWalkingChange);
  const onGreetRef = useRef(onGreet);

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);
  useEffect(() => {
    interactiveRef.current = interactiveEnabled;
  }, [interactiveEnabled]);
  useEffect(() => {
    onWalkingRef.current = onWalkingChange;
    onGreetRef.current = onGreet;
  }, [onWalkingChange, onGreet]);

  const sleep = (ms: number) =>
    new Promise<void>((res) => {
      const id = window.setTimeout(res, ms);
      const check = window.setInterval(() => {
        if (cancelRef.current) {
          window.clearTimeout(id);
          window.clearInterval(check);
          res();
        }
      }, 80);
    });

  // ---- Hedef seçimi ------------------------------------------------------
  // Hedef SEÇİMİ: sadece geçerli (pet'in sığabildiği) noktalar üretilir.
  const pickTarget = (
    desktop: DesktopInfo,
    win: WinState
  ): { tx: number; ty: number } => {
    const monitors = monitorsOf(desktop);

    // 1) Arkadaş etrafı
    const friendTargets = friendsRef.current.filter(
      (f) => f.label !== ownLabel
    );
    if (friendTargets.length > 0 && Math.random() < 0.28) {
      const f = friendTargets[Math.floor(Math.random() * friendTargets.length)];
      const angle = Math.random() * Math.PI * 2;
      const radius = 70 + Math.random() * 120;
      const wantX = f.x + f.width / 2 - win.width / 2 + Math.cos(angle) * radius;
      const wantY = f.y + f.height / 2 - win.height / 2 + Math.sin(angle) * radius;
      const targetM =
        findMonitorForPet(monitors, wantX, wantY, win.width, win.height) ??
        monitors[0];
      const c = clampToMonitor(targetM, win.width, win.height, wantX, wantY);
      return { tx: Math.round(c.x), ty: Math.round(c.y) };
    }

    // 2) Görünür bir uygulama penceresinin kenarı
    const visibleWindows = (desktop.visible_windows ?? []).filter(
      (w) => w.width > win.width && w.height > 60
    );
    if (visibleWindows.length > 0 && Math.random() < 0.55) {
      const target =
        visibleWindows[Math.floor(Math.random() * visibleWindows.length)];
      const side = Math.floor(Math.random() * 4);
      const insetX = Math.random() * Math.max(1, target.width - win.width);
      const insetY = Math.random() * Math.max(1, target.height - win.height);
      let wantX: number;
      let wantY: number;
      if (side === 0) {
        wantX = target.x + insetX;
        wantY = target.y - win.height - 10;
      } else if (side === 1) {
        wantX = target.x + insetX;
        wantY = target.y + target.height + 10;
      } else if (side === 2) {
        wantX = target.x - win.width - 10;
        wantY = target.y + insetY;
      } else {
        wantX = target.x + target.width + 10;
        wantY = target.y + insetY;
      }
      const targetM =
        findMonitorForPet(monitors, wantX, wantY, win.width, win.height) ??
        monitors[0];
      const c = clampToMonitor(targetM, win.width, win.height, wantX, wantY);
      return { tx: Math.round(c.x), ty: Math.round(c.y) };
    }

    // 3) Rastgele monitör + iç noktası (alan ağırlıklı seçim)
    let totalArea = 0;
    for (const m of monitors) totalArea += m.width * m.height;
    let r = Math.random() * totalArea;
    let chosen = monitors[0];
    for (const m of monitors) {
      r -= m.width * m.height;
      if (r <= 0) {
        chosen = m;
        break;
      }
    }
    const bounds = petWindowBoundsForMonitor(chosen, win.width, win.height);
    const spanX = Math.max(0, bounds.maxX - bounds.minX);
    const spanY = Math.max(0, bounds.maxY - bounds.minY);
    return {
      tx: Math.round(bounds.minX + Math.random() * spanX),
      ty: Math.round(bounds.minY + Math.random() * spanY)
    };
  };

  // ---- Yürüme ------------------------------------------------------------
  const walkTo = async (
    tx: number,
    ty: number,
    desktop: DesktopInfo,
    jump: boolean
  ) => {
    const monitors = monitorsOf(desktop);
    const win_ = getCurrentWindow();
    let win: WinState;
    try {
      win = await invoke<WinState>("get_window_state");
    } catch {
      return;
    }
    let posX = win.x;
    let posY = win.y;

    // Başlangıç pos pet'i geçerli bir monitöre çek (boşluktaysa).
    if (!isPositionValidInAny(monitors, win.width, win.height, posX, posY)) {
      const startM =
        findMonitorForPet(monitors, posX, posY, win.width, win.height) ??
        monitors[0];
      const c = clampToMonitor(startM, win.width, win.height, posX, posY);
      posX = c.x;
      posY = c.y;
    }

    const waypoints: Waypoint[] = planPath(
      monitors,
      posX,
      posY,
      tx,
      ty,
      win.width,
      win.height
    );
    if (waypoints.length === 0) return;

    let vy = jump ? JUMP_VY : 0;
    let last = performance.now();
    const jumpStartT = jump ? last : 0;
    // Zıplama başladığı andaki "yer seviyesi" — vy bu Y'ye dönünce sıfırlanır.
    const jumpGroundY = posY;
    // Bir sonraki etkileşimin EN ERKEN ne zaman tetikleneceği. Her aksiyon
    // kendi cooldown'unu set eder; "skip" daha kısa cooldown'lu olduğu için
    // doğal bir ritim oluşur.
    let nextInteractAt = 0;
    onWalkingRef.current?.(true);

    let currentMonitor =
      findMonitorForPet(monitors, posX, posY, win.width, win.height) ??
      monitors[0];

    for (let wIdx = 0; wIdx < waypoints.length; wIdx++) {
      if (cancelRef.current) break;
      const wp = waypoints[wIdx];
      const isLast = wIdx === waypoints.length - 1;

      // Pet'in bu segment boyunca geçerli olabileceği monitör kümesi —
      // şu anki monitör VE waypoint'in monitörü.
      const allowed: MonitorInfo[] =
        currentMonitor === wp.monitor
          ? [currentMonitor]
          : [currentMonitor, wp.monitor];

      // Stuck-detection: bu waypoint'te ilerleyemezsek vazgeç.
      let stuckRefX = posX;
      let stuckRefY = posY;
      let stuckRefT = performance.now();

      // Bu waypoint'e doğru sabit bir unit vector ile yürü; her frame yeniden
      // hesapla — slide olduğunda yön düzeltsin.
      while (!cancelRef.current) {
        await new Promise((r) => requestAnimationFrame(r));
        if (cancelRef.current) break;
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        // Zıplama emniyet ağı: çok uzun sürmüşse vy'yi zorla sıfırla.
        if (vy !== 0 && jumpStartT > 0 && now - jumpStartT > JUMP_MAX_MS) {
          vy = 0;
        }

        const dx = wp.x - posX;
        const dy = wp.y - posY;
        const len = Math.hypot(dx, dy);
        // Vardı sayıldı: yeterince yakın VE artık zıplamıyor.
        if (len < (isLast ? TARGET_REACH : WAYPOINT_REACH) && vy === 0) {
          currentMonitor = wp.monitor;
          break;
        }
        const ux = len > 0 ? dx / len : 0;
        const uy = len > 0 ? dy / len : 0;

        const stepX = ux * WALK_SPEED * dt;
        let stepY = uy * WALK_SPEED * dt;

        // Zıplama velocity'si — yatayda hareket etmeye devam et, dikeyde
        // velocity gravity ile düşür.
        if (vy !== 0) {
          stepY += vy * dt;
          vy += GRAVITY * dt;
          // Yere döndük (zıplama başladığı Y'ye geri indi) — durdur.
          if (vy > 0 && posY + stepY >= jumpGroundY) {
            const overshoot = posY + stepY - jumpGroundY;
            if (overshoot > 0) stepY -= overshoot;
            vy = 0;
          }
        }

        // Önce tam adım dene; geçerli değilse eksen-bazlı slide.
        const tryX = posX + stepX;
        const tryY = posY + stepY;
        const beforeX = posX;
        const beforeY = posY;
        if (isPositionValidInAny(allowed, win.width, win.height, tryX, tryY)) {
          posX = tryX;
          posY = tryY;
        } else {
          // Sadece X
          if (
            stepX !== 0 &&
            isPositionValidInAny(allowed, win.width, win.height, tryX, posY)
          ) {
            posX = tryX;
          }
          // Sadece Y
          if (
            stepY !== 0 &&
            isPositionValidInAny(allowed, win.width, win.height, posX, posY + stepY)
          ) {
            posY = posY + stepY;
          }
          // İkisi de tıkalı: en yakın izinli noktaya çek.
          if (
            !isPositionValidInAny(allowed, win.width, win.height, posX, posY)
          ) {
            const c = clampToNearestOf(
              allowed,
              win.width,
              win.height,
              posX,
              posY
            );
            posX = c.x;
            posY = c.y;
          }
        }

        // Y ekseninde blok: pet sınıra çarptı, gravity vy'sini sıfırlayalım
        // ki "havada" sıkışıp kalmasın.
        if (vy !== 0 && Math.abs(posY - beforeY) < Math.abs(stepY) - 0.5) {
          vy = 0;
        }

        // Stuck detection: kayda değer hareket yoksa vazgeç ve sonraki
        // waypoint'e (veya hedefe) geç.
        const moved = Math.hypot(posX - stuckRefX, posY - stuckRefY);
        if (moved >= STUCK_MIN_PROGRESS_PX) {
          stuckRefX = posX;
          stuckRefY = posY;
          stuckRefT = now;
        } else if (now - stuckRefT > STUCK_TIMEOUT_MS) {
          // Sıkıştık — bu waypoint'i bırak. Bir sonraki segment için pet'in
          // şu anki pozisyonunu mevcut monitör olarak kabul et.
          currentMonitor =
            findMonitorForPet(monitors, posX, posY, win.width, win.height) ??
            currentMonitor;
          vy = 0;
          break;
        }

        try {
          await win_.setPosition({
            type: "Physical",
            x: Math.round(posX),
            y: Math.round(posY)
          } as any);
        } catch {
          onWalkingRef.current?.(false);
          return;
        }

        // Etkileşim — yakındaki uygulama penceresiyle ne yapacağımıza
        // her seferinde ağırlıklı random ile karar veriyoruz. Her aksiyonun
        // kendi cooldown'u var; "skip" daha kısaya sahip olduğu için bazen
        // sadece pencerelerin üstünden geçer.
        if (
          interactiveRef.current &&
          desktop.visible_windows.length > 0 &&
          now > nextInteractAt
        ) {
          const action = pickInteractAction();
          nextInteractAt = now + action.cooldownMs;
          const centerX = Math.round(posX + win.width / 2);
          const centerY = Math.round(posY + win.height / 2);

          switch (action.kind) {
            case "skip":
              // Hiç bir şey yapma — doğal "sadece üstünden geçti" hissi.
              break;
            case "nudge": {
              // Yürüme yönünde küçük tek-adım itme.
              const dx = Math.round(ux * (12 + Math.random() * 8));
              const dy = Math.round(uy * (12 + Math.random() * 8));
              void invoke<boolean>("nudge_desktop_window_near", {
                pointX: centerX,
                pointY: centerY,
                radius: 78,
                deltaX: dx,
                deltaY: dy
              }).catch(() => {});
              break;
            }
            case "bump": {
              // Daha büyük, yumuşak (animated) itme — yön: yürüme yönü +
              // küçük random sapma; minimum bir magnitude garanti edelim
              // (pet yavaşlamış olabilir).
              const mag = 28 + Math.random() * 24;
              const jitterX = (Math.random() - 0.5) * 16;
              const jitterY = (Math.random() - 0.5) * 16;
              let bx = ux * mag + jitterX;
              let by = uy * mag + jitterY;
              if (Math.hypot(bx, by) < 18) {
                // Hareketsiz duruyorsa rastgele bir yön bul.
                const a = Math.random() * Math.PI * 2;
                bx = Math.cos(a) * mag;
                by = Math.sin(a) * mag;
              }
              void invoke<boolean>("bump_desktop_window_near", {
                pointX: centerX,
                pointY: centerY,
                radius: 90,
                deltaX: Math.round(bx),
                deltaY: Math.round(by)
              }).catch(() => {});
              break;
            }
            case "shake": {
              const amplitude = 7 + Math.floor(Math.random() * 10);
              const durationMs = 480 + Math.floor(Math.random() * 480);
              void invoke<boolean>("shake_desktop_window_near", {
                pointX: centerX,
                pointY: centerY,
                radius: 90,
                amplitude,
                durationMs
              }).catch(() => {});
              break;
            }
            case "hop": {
              const height = 14 + Math.floor(Math.random() * 18);
              void invoke<boolean>("hop_desktop_window_near", {
                pointX: centerX,
                pointY: centerY,
                radius: 90,
                height
              }).catch(() => {});
              break;
            }
          }
        }

        // Arkadaş selamı.
        const fs = friendsRef.current;
        for (const f of fs) {
          if (f.label === ownLabel) continue;
          const fcx = f.x + f.width / 2;
          const fcy = f.y + f.height / 2;
          const ccx = posX + win.width / 2;
          const ccy = posY + win.height / 2;
          const dist = Math.hypot(fcx - ccx, fcy - ccy);
          if (dist < FRIEND_GREET_DIST) {
            const lastT = lastGreetRef.current[f.label] ?? 0;
            if (now - lastT > 4000) {
              lastGreetRef.current[f.label] = now;
              onGreetRef.current?.(f);
            }
          }
        }
      }
    }

    onWalkingRef.current?.(false);
  };

  // ---- Ana döngü ---------------------------------------------------------
  const loop = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    cancelRef.current = false;

    try {
      while (!cancelRef.current) {
        let desktop: DesktopInfo;
        let win: WinState;
        try {
          desktop = await invoke<DesktopInfo>("get_desktop_info");
          win = await invoke<WinState>("get_window_state");
        } catch {
          await sleep(800);
          continue;
        }
        const { tx, ty } = pickTarget(desktop, win);
        const jump = Math.random() < JUMP_CHANCE;
        await walkTo(tx, ty, desktop, jump);
        if (cancelRef.current) break;
        const pause =
          IDLE_PAUSE_MIN_MS +
          Math.random() * (IDLE_PAUSE_MAX_MS - IDLE_PAUSE_MIN_MS);
        await sleep(pause);
      }
    } finally {
      runningRef.current = false;
      onWalkingRef.current?.(false);
    }
  }, [ownLabel]);

  useEffect(() => {
    if (enabled) {
      cancelRef.current = false;
      loop();
    } else {
      cancelRef.current = true;
    }
    return () => {
      cancelRef.current = true;
    };
  }, [enabled, loop]);

  const interrupt = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const resume = useCallback(() => {
    if (!enabled) return;
    cancelRef.current = false;
    if (!runningRef.current) {
      loop();
      return;
    }
    window.setTimeout(() => {
      if (!cancelRef.current && !runningRef.current) loop();
    }, 100);
  }, [enabled, loop]);

  return { interrupt, resume };
}
