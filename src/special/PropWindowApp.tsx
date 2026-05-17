// special/PropWindowApp.tsx
// -----------------------------------------------------------------------------
// Tek bir prop'u kendi şeffaf, click-through, always-on-top Tauri penceresinde
// render eden React kök bileşeni. URL paramlerinden hangi prop'u oynatacağını
// alır; süresi bitince pencereyi kendi kendine kapatır.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { renderProp } from "./PropLayer";
import { findSpecialAction } from "./registry";
import type { SpecialActionId } from "./types";

interface ParsedQuery {
  id: SpecialActionId | null;
  durationMs: number;
}

function parseQuery(): ParsedQuery {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get("id") || "") as SpecialActionId;
  const durationMs = Number.parseInt(params.get("duration") || "4000", 10);
  const meta = findSpecialAction(id);
  return {
    id: meta ? id : null,
    durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 4000
  };
}

export default function PropWindowApp() {
  const query = useMemo(parseQuery, []);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Pencere zemini şeffaf ve fareyi yutmasın.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    const onCtx = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, []);

  useEffect(() => {
    if (query.id) return;
    getCurrentWindow().close().catch(() => {});
  }, [query.id]);

  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      getCurrentWindow().close().catch(() => {});
    }, 220);
  }, [closing]);

  // Süre dolunca pencereyi kapat.
  useEffect(() => {
    if (!query.id) return;
    const handle = window.setTimeout(handleClose, query.durationMs);
    return () => window.clearTimeout(handle);
  }, [query.id, query.durationMs, handleClose]);

  if (!query.id) return null;

  return (
    <div
      className={`prop-host${closing ? " prop-host--fading" : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        background: "transparent"
      }}
    >
      {renderProp(query.id)}
    </div>
  );
}
