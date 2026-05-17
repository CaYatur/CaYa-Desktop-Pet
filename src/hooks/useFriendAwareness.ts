// useFriendAwareness.ts
// -----------------------------------------------------------------------------
// Diğer pet pencerelerinin konumunu dinler ve kendi konumumuzu yayınlar.
//
//   * Her pet pencere ayarlanan aralıkta `broadcast_pet_position` çağırır;
//     Rust bu konumu tüm pencerelere "pet:position" event'i olarak yayınlar.
//   * Bu hook gelen event'leri toplar (label -> snapshot) ve dizide döner.
//   * Kendi label'ını broadcast'lerken kullanır; gelen kendi event'lerini de
//     bilse de filtrelemez — wander hook kendini hariç tutar.
// -----------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FriendSnapshot } from "./useWander";

interface WinState {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface IncomingEvent {
  label: string;
  pet_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Args {
  ownLabel: string;
  ownPetId: string;
  /** Yayınlama frekansı (ms). */
  broadcastIntervalMs?: number;
}

export function useFriendAwareness({
  ownLabel,
  ownPetId,
  broadcastIntervalMs = 250
}: Args) {
  const [friends, setFriends] = useState<FriendSnapshot[]>([]);

  // Periyodik olarak kendi konumumuzu yayınla.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const w: WinState = await invoke("get_window_state");
        await invoke("broadcast_pet_position", {
          label: ownLabel,
          petId: ownPetId,
          x: w.x,
          y: w.y,
          width: w.width,
          height: w.height
        });
      } catch {
        /* ignore */
      }
    };
    const id = window.setInterval(tick, broadcastIntervalMs);
    tick();
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [ownLabel, ownPetId, broadcastIntervalMs]);

  // Gelen broadcast'leri dinle.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const u = await listen<IncomingEvent>("pet:position", (e) => {
        const p = e.payload;
        setFriends((prev) => {
          // Kendimizi yine de tut — debugging için faydalı olabilir; wander hariç tutar.
          const next = prev.filter((f) => f.label !== p.label);
          next.push({
            label: p.label,
            petId: p.pet_id,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height
          });
          return next;
        });
      });
      if (cancelled) {
        u();
      } else {
        unlisten = u;
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return { friends };
}
