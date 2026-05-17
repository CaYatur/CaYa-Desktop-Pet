// special/OverlayApp.tsx
// -----------------------------------------------------------------------------
// Overlay penceresinin (spawn_overlay_window ile açılan) React kök bileşeni.
// URL paramlerinden hangi efekti oynatacağını alır; efekt bittiğinde
// pencereyi kendi kendine kapatır.
//
// Bu pencere "click-through" olduğu için pointer-events: none kullanır;
// tıklamalar ve sürüklemeler altındaki masaüstüne (veya pet penceresine)
// geçer. set_ignore_cursor_events Rust tarafında da set edilir.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { findSpecialAction } from "./registry";
import { FullscreenEffectLayer } from "./FullscreenEffectLayer";
import type { SpecialActionId } from "./types";

interface ParsedQuery {
  effect: SpecialActionId | null;
  durationMs: number;
}

function parseQuery(): ParsedQuery {
  const params = new URLSearchParams(window.location.search);
  const effectRaw = params.get("effect") || "";
  const durationMs = Number.parseInt(params.get("duration") || "5000", 10);
  const meta = findSpecialAction(effectRaw as SpecialActionId);
  return {
    effect: meta ? (effectRaw as SpecialActionId) : null,
    durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 5000
  };
}

export default function OverlayApp() {
  const query = useMemo(parseQuery, []);
  const [closing, setClosing] = useState(false);

  // Bu pencere ne olursa olsun tıklamayı yutmamalı.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    const onCtx = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, []);

  // Geçersiz / tanınmayan efekt → pencereyi hemen kapat.
  useEffect(() => {
    if (query.effect) return;
    getCurrentWindow()
      .close()
      .catch(() => {});
  }, [query.effect]);

  const handleComplete = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      getCurrentWindow()
        .close()
        .catch(() => {
          /* zaten kapalı olabilir */
        });
    }, 250);
  }, [closing]);

  if (!query.effect) return null;

  return (
    <div
      className={`overlay-root${closing ? " overlay-root--fading" : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        background: "transparent"
      }}
    >
      <FullscreenEffectLayer
        effectId={query.effect}
        durationMs={query.durationMs}
        onComplete={handleComplete}
      />
    </div>
  );
}
