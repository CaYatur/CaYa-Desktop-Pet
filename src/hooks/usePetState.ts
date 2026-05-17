// usePetState.ts
// -----------------------------------------------------------------------------
// Pet'in mantıksal durumunu yöneten merkezi state machine hook'u.
//
// İçerdiği davranışlar:
//   * Geçişler: setState(name) ile herhangi bir state'e geçer.
//   * Idle timer: Belirlenmiş süre boyunca etkileşim olmazsa otomatik
//     `sleep` durumuna geçer. Etkileşim sayılan eylemler `markActivity()`
//     ile bildirilir.
//   * Bubble metni: Aktif state'in bubble havuzundan rastgele bir mesaj
//     üretir; state değiştikçe veya elle `regenerateBubble()` çağrıldıkça
//     güncellenir.
//
// Tasarım kararları:
//   * Manuel state (kullanıcı menüden uyut/uyandır seçti) ile geçici state
//     (clicked -> happy -> idle) birbirinden ayrı tutuluyor. Geçici state
//     bitince son "kalıcı" state'e dönülür (defaultState).
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { PetStateName } from "../data/petStates";

interface Args {
  /** Boşta ne kadar süre sonra uyusun (saniye). 0 -> kapalı. */
  autoSleepSeconds: number;
  /** Aktif pet'in state -> bubble metinleri lookup'ı için fonksiyon. */
  getBubblePool: (state: PetStateName) => string[] | undefined;
  /** Bubble açık mı? Kapalıysa metin üretmez. */
  bubbleEnabled: boolean;
}

export function usePetState({
  autoSleepSeconds,
  getBubblePool,
  bubbleEnabled
}: Args) {
  // "Kalıcı" state — kullanıcı tarafından son seçilen mod.
  const [restingState, setRestingState] = useState<PetStateName>("idle");
  // "Aktif" state — UI'ın gerçek anda gösterdiği. Geçici animasyonlar bunu değiştirir.
  const [activeState, setActiveState] = useState<PetStateName>("idle");
  const [bubble, setBubble] = useState<string | null>(null);

  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<number | null>(null);

  // -- Bubble yardımcıları --------------------------------------------------
  const pickBubble = useCallback(
    (state: PetStateName) => {
      if (!bubbleEnabled) return null;
      const pool = getBubblePool(state);
      if (!pool || pool.length === 0) return null;
      return pool[Math.floor(Math.random() * pool.length)];
    },
    [bubbleEnabled, getBubblePool]
  );

  const regenerateBubble = useCallback(() => {
    setBubble(pickBubble(activeState));
  }, [pickBubble, activeState]);

  // Active state değiştikçe yeni bir mesaj üret.
  useEffect(() => {
    setBubble(pickBubble(activeState));
  }, [activeState, pickBubble]);

  // -- Idle timer -----------------------------------------------------------
  const clearIdleTimer = () => {
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  const scheduleIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (autoSleepSeconds <= 0) return;
    idleTimerRef.current = window.setTimeout(() => {
      // Yalnızca etkileşimsiz "idle" durumdayken otomatik uyut.
      setRestingState((cur) => (cur === "idle" ? "sleep" : cur));
      setActiveState((cur) => (cur === "idle" ? "sleep" : cur));
    }, autoSleepSeconds * 1000);
  }, [autoSleepSeconds]);

  // -- Public API -----------------------------------------------------------
  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    scheduleIdleTimer();
  }, [scheduleIdleTimer]);

  /** Kullanıcının seçtiği kalıcı bir state (menü -> uyut/uyandır/...). */
  const setMode = useCallback(
    (state: PetStateName) => {
      setRestingState(state);
      setActiveState(state);
      markActivity();
    },
    [markActivity]
  );

  /** Geçici, kısa süreli bir animasyon (clicked, happy, dragged...). */
  const playTransient = useCallback(
    (state: PetStateName) => {
      setActiveState(state);
      markActivity();
    },
    [markActivity]
  );

  /** Geçici animasyon bittiğinde — bizim restingState'e geri dön. */
  const onTransientFinished = useCallback(
    (finished: PetStateName) => {
      setActiveState((cur) => (cur === finished ? restingState : cur));
    },
    [restingState]
  );

  // Mount'ta ve autoSleepSeconds değişiminde timer'ı kur.
  useEffect(() => {
    scheduleIdleTimer();
    return clearIdleTimer;
  }, [scheduleIdleTimer]);

  return {
    activeState,
    restingState,
    bubble,
    setMode,
    playTransient,
    onTransientFinished,
    markActivity,
    regenerateBubble
  };
}
