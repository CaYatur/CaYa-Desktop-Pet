// useDraggable.ts
// -----------------------------------------------------------------------------
// Borderless Tauri penceresini pet uzerinden surukler. Native startDragging()
// mouseup olayini WebView'e geri dusurmedigi icin release/throw state'i manuel
// takip edilir.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  clampToNearestOf,
  isPositionValidInAny,
  type MonitorInfo
} from "../lib/screenGeometry";

interface Args {
  onDragStart?: () => void;
  /** Drag bitti, velocity hesaplanmadan once cagrilir. */
  onDragEnd?: () => void | Promise<void>;
  disabled?: boolean;
  /** Drag baslangicinda cagrilir (sampling baslat). */
  onSamplingStart?: () => void;
  /** Drag bitiminde cagrilir (velocity'yi al ve firlat/settle). */
  onRelease?: () => void;
  /** Drag sirasinda toplam hareket mesafesini bildirir. */
  onDragMove?: (distancePx: number) => void;
}

interface WinState {
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
}

interface DragSession {
  startScreenX: number;
  startScreenY: number;
  startWindowX: number;
  startWindowY: number;
  latestX: number;
  latestY: number;
  dpr: number;
  winW: number;
  winH: number;
  monitors: MonitorInfo[];
  rafId: number | null;
}

export function useDraggable({
  onDragStart,
  onDragEnd,
  disabled,
  onSamplingStart,
  onRelease,
  onDragMove
}: Args = {}) {
  const dragRef = useRef<DragSession | null>(null);

  const flushPosition = useCallback(() => {
    const session = dragRef.current;
    if (!session) return;
    session.rafId = null;
    getCurrentWindow()
      .setPosition({
        type: "Physical",
        x: Math.round(session.latestX),
        y: Math.round(session.latestY)
      } as any)
      .catch((err) => console.warn("setPosition failed", err));
  }, []);

  const schedulePosition = useCallback(() => {
    const session = dragRef.current;
    if (!session || session.rafId != null) return;
    session.rafId = window.requestAnimationFrame(flushPosition);
  }, [flushPosition]);

  const finishDrag = useCallback(() => {
    const session = dragRef.current;
    if (!session) return;
    dragRef.current = null;
    if (session.rafId != null) {
      window.cancelAnimationFrame(session.rafId);
      session.rafId = null;
    }

    getCurrentWindow()
      .setPosition({
        type: "Physical",
        x: Math.round(session.latestX),
        y: Math.round(session.latestY)
      } as any)
      .catch((err) => console.warn("setPosition failed", err))
      .finally(() => {
        void onDragEnd?.();
        onRelease?.();
      });
  }, [onDragEnd, onRelease]);

  const handleMouseDown = useCallback(
    async (e: React.MouseEvent) => {
      if (disabled) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-no-drag]")) return;

      e.preventDefault();

      try {
        const dpr = window.devicePixelRatio || 1;
        const [win, desktop] = await Promise.all([
          invoke<WinState>("get_window_state"),
          invoke<DesktopInfo>("get_desktop_info")
        ]);
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
        dragRef.current = {
          startScreenX: e.screenX,
          startScreenY: e.screenY,
          startWindowX: win.x,
          startWindowY: win.y,
          latestX: win.x,
          latestY: win.y,
          dpr,
          winW: win.width,
          winH: win.height,
          monitors,
          rafId: null
        };
        onDragStart?.();
        onSamplingStart?.();
      } catch (err) {
        console.warn("drag start failed", err);
      }
    },
    [disabled, onDragStart, onSamplingStart]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const session = dragRef.current;
      if (!session) return;
      e.preventDefault();
      const dx = (e.screenX - session.startScreenX) * session.dpr;
      const dy = (e.screenY - session.startScreenY) * session.dpr;
      const wantX = session.startWindowX + dx;
      const wantY = session.startWindowY + dy;
      // Pet'in görsel merkezi herhangi bir monitörde geçerli olmalı —
      // farklı çözünürlükteki monitörler arası "boşluğa" sürüklenmesini önler.
      // Geçerliyse olduğu gibi kullan; değilse en yakın monitöre çek.
      if (
        isPositionValidInAny(session.monitors, session.winW, session.winH, wantX, wantY)
      ) {
        session.latestX = wantX;
        session.latestY = wantY;
      } else {
        const c = clampToNearestOf(
          session.monitors,
          session.winW,
          session.winH,
          wantX,
          wantY
        );
        session.latestX = c.x;
        session.latestY = c.y;
      }
      onDragMove?.(Math.hypot(e.screenX - session.startScreenX, e.screenY - session.startScreenY));
      schedulePosition();
    };
    const onUp = () => finishDrag();
    const onBlur = () => finishDrag();

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
    };
  }, [finishDrag, onDragMove, schedulePosition]);

  return { handleMouseDown };
}
