// main.tsx — React entry point.
//
// URL routing:
//   ?overlay=1 → fullscreen efekt penceresi (OverlayApp)
//   ?prop=1    → tek prop penceresi (PropWindowApp)
//   diğer      → normal pet penceresi (App)

import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import OverlayApp from "./special/OverlayApp";
import PropWindowApp from "./special/PropWindowApp";
import "./special/styles.css";

const params = new URLSearchParams(window.location.search);
const isOverlay = params.get("overlay") === "1";
const isProp = params.get("prop") === "1";

// Sağ tık menüsünü kendimiz açıyoruz; tarayıcının default menüsü kapalı.
window.addEventListener("contextmenu", (e) => e.preventDefault());

// Şeffaf pencerede yanlışlıkla page'i seçmek görüntüyü bozar.
document.body.style.userSelect = "none";

function Root() {
  if (isOverlay) return <OverlayApp />;
  if (isProp) return <PropWindowApp />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
