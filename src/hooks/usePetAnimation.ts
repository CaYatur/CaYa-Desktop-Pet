// usePetAnimation.ts
// -----------------------------------------------------------------------------
// Sprite sheet üzerinde frame ilerletmesini yöneten hook.
//
// Mantık:
//   * Aktif state config'inden frameCount + frameDuration alır.
//   * requestAnimationFrame ile zaman akışını ölçer (setInterval'dan daha
//     pürüzsüz ve sekme arka plana atılınca da makul davranır).
//   * Loop=false ise son frame'de durup transitionTo state'ine geçiş için
//     onAnimationEnd callback'ini tetikler.
//   * Döndürdüğü `frame` index'i React state olarak yayınlandığı için Pet
//     bileşeni background-position'ı buna göre hesaplar.
// -----------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { PetDefinition, PetStateConfig, PetStateName } from "../data/petStates";

interface Args {
  pet: PetDefinition;
  stateName: PetStateName;
  /** Loop'suz bir animasyon bittiğinde tetiklenir. */
  onAnimationEnd?: (finished: PetStateName) => void;
}

export function usePetAnimation({ pet, stateName, onAnimationEnd }: Args) {
  const [frame, setFrame] = useState(0);

  // Stable referanslar; useEffect'i gereksiz yere yeniden başlatmamak için ref'te.
  const lastTimeRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);
  const finishedRef = useRef(false);
  const onEndRef = useRef(onAnimationEnd);
  useEffect(() => {
    onEndRef.current = onAnimationEnd;
  }, [onAnimationEnd]);

  useEffect(() => {
    const config: PetStateConfig = pet.states[stateName];

    // State değişiminde sıfırla.
    setFrame(0);
    lastTimeRef.current = null;
    accumulatorRef.current = 0;
    finishedRef.current = false;

    let rafId = 0;
    const tick = (now: number) => {
      if (lastTimeRef.current == null) lastTimeRef.current = now;
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      accumulatorRef.current += delta;

      // Birden çok frame atlamamız gerekiyorsa hepsini ilerlet.
      while (accumulatorRef.current >= config.frameDuration) {
        accumulatorRef.current -= config.frameDuration;

        setFrame((prev) => {
          const next = prev + 1;
          if (next >= config.frameCount) {
            if (config.loop) {
              return 0;
            }
            // Loop'suz animasyon: son frame'de kal ve bir kez bildir.
            if (!finishedRef.current) {
              finishedRef.current = true;
              // Microtask'a at — render içinde state set etmeyelim.
              queueMicrotask(() => onEndRef.current?.(stateName));
            }
            return config.frameCount - 1;
          }
          return next;
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [pet, stateName]);

  return { frame };
}
