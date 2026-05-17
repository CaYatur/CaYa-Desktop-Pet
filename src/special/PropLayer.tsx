// special/PropLayer.tsx
// -----------------------------------------------------------------------------
// Pet'in yanında çıkan tüm mini-objelerin/mini-sahnelerin render bileşenleri.
//
// YENİ MİMARİ:
//   Bu dosya artık tek bir <PropLayer> kabuğu olarak DEĞİL, her prop tipini
//   bağımsız bir bileşen olarak EXPORT eder. Her prop kendi şeffaf, click-
//   through Tauri pencerede mount edilir (PropWindowApp); CSS olarak
//   pencereyi tamamen doldurur (inset: 0).
//
//   renderProp(id) yardımcısı verilen aksiyona göre doğru bileşeni döner.
//
// Auto-expire yine vardır: PropWindowApp kendi süresini bilir ve pencereyi
// kendisi kapatır; ekstra bir onDone callback'ine ihtiyaç yoktur.
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";

import type { SpecialActionId } from "./types";

// Her prop yardımcı bileşeni şu varsayımla çalışır:
//   parent <html>/<body>/<#root>/.prop-host şeffaf + tüm pencereyi doldurur.
//   Prop kendisi de inset:0 ile pencereyi kaplar ve içinde merkezlenir.

interface MoodProp {
  /** Blob için mevcut ruh hali — moodAura'da kullanılır. */
  mood?: string;
}

export function renderProp(id: SpecialActionId, opts?: MoodProp): JSX.Element | null {
  switch (id) {
    case "caya.miniComputer":
      return <MiniComputerProp />;
    case "caya.terminalPortal":
      return <TerminalPortalProp />;
    case "cube.geometryLab":
      return <GeometryLabProp />;
    case "cube.cloneCubes":
      return <CloneCubesProp />;
    case "cube.systemAnalyzer":
      return <SystemAnalyzerProp />;
    case "cube.portalJump":
      return <PortalJumpProp />;
    case "blob.snackTime":
      return <SnackTimeProp />;
    case "blob.sleepZone":
      return <SleepZoneProp />;
    case "blob.toyBall":
      return <ToyBallProp />;
    case "blob.moodAura":
      return <MoodAuraProp mood={opts?.mood} />;
    case "blob.waterSplash":
      return <WaterSplashProp />;
    default:
      return null;
  }
}

// ─── CaYa: Mini Computer ───────────────────────────────────────────────────
const MINI_COMPUTER_LINES = [
  "const pet = new CaYa();",
  "$ npm run dev",
  "> build started...",
  "> scanning bugs...",
  "> compiling modules...",
  "CaYaDev system online",
  "> tests/all: PASS",
  "> deploy sequence ready",
  "$ git status :: clean",
  "✓ all systems nominal"
];
function MiniComputerProp() {
  const [visibleLines, setVisibleLines] = useState<string[]>([MINI_COMPUTER_LINES[0]]);
  useEffect(() => {
    let i = 1;
    const interval = window.setInterval(() => {
      setVisibleLines((prev) => {
        const next = [...prev, MINI_COMPUTER_LINES[i % MINI_COMPUTER_LINES.length]];
        return next.length > 7 ? next.slice(next.length - 7) : next;
      });
      i += 1;
    }, 700);
    return () => window.clearInterval(interval);
  }, []);
  return (
    <div className="prop prop--mini-computer">
      <div className="prop__mc-frame">
        <div className="prop__mc-screen">
          {visibleLines.map((line, idx) => (
            <div key={`${idx}-${line}`} className="prop__mc-line">
              {line}
            </div>
          ))}
          <span className="prop__mc-caret">_</span>
        </div>
        <div className="prop__mc-base" />
      </div>
    </div>
  );
}

// ─── CaYa: Terminal Portal ─────────────────────────────────────────────────
const TERMINAL_LINES = [
  "$ ./caya --boot",
  "[OK] core",
  "[OK] net",
  "[OK] pet.sense",
  "> awaiting input"
];
function TerminalPortalProp() {
  return (
    <div className="prop prop--terminal">
      <div className="prop__term-frame">
        <div className="prop__term-bar">
          <span /> <span /> <span /> caya@dev
        </div>
        <div className="prop__term-body">
          {TERMINAL_LINES.map((l, i) => (
            <div key={i} className="prop__term-line">
              {l}
            </div>
          ))}
          <span className="prop__term-caret">█</span>
        </div>
      </div>
      <SmallParticles count={12} color="#ff2b3d" />
    </div>
  );
}

// ─── Cube: Geometry Lab ────────────────────────────────────────────────────
function GeometryLabProp() {
  return (
    <div className="prop prop--geometry-lab">
      <div className="prop__lab-bezel">
        <div className="prop__lab-cube">
          <span /> <span /> <span /> <span /> <span /> <span />
        </div>
        <div className="prop__lab-rings">
          <span /> <span /> <span />
        </div>
      </div>
      <div className="prop__lab-label">{"> calc.geometry"}</div>
    </div>
  );
}

// ─── Cube: Clone Cubes ─────────────────────────────────────────────────────
function CloneCubesProp() {
  const positions = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, i) => ({
        left: 6 + i * 13 + (Math.random() * 6 - 3),
        delay: i * 90,
        size: 14 + Math.random() * 8
      })),
    []
  );
  return (
    <div className="prop prop--clone-cubes">
      {positions.map((p, i) => (
        <span
          key={i}
          className="prop__clone-cube"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}ms`
          }}
        />
      ))}
    </div>
  );
}

// ─── Cube: System Analyzer ─────────────────────────────────────────────────
function SystemAnalyzerProp() {
  const [stats, setStats] = useState({
    cpu: 12,
    ram: 38,
    fps: 60
  });
  useEffect(() => {
    const interval = window.setInterval(() => {
      setStats({
        cpu: Math.round(8 + Math.random() * 50),
        ram: Math.round(30 + Math.random() * 30),
        fps: Math.round(55 + Math.random() * 8)
      });
    }, 700);
    return () => window.clearInterval(interval);
  }, []);
  return (
    <div className="prop prop--analyzer">
      <div className="prop__an-card">
        <div className="prop__an-title">SYSTEM</div>
        <div className="prop__an-row">CPU: {stats.cpu}%</div>
        <div className="prop__an-bar">
          <span style={{ width: `${stats.cpu}%` }} />
        </div>
        <div className="prop__an-row">RAM: {stats.ram}%</div>
        <div className="prop__an-bar">
          <span style={{ width: `${stats.ram}%` }} />
        </div>
        <div className="prop__an-row">FPS: {stats.fps}</div>
      </div>
    </div>
  );
}

// ─── Cube: Portal Jump ─────────────────────────────────────────────────────
// Sadece görsel portal — pet'i hareket ettirme kararı App.tsx tarafında
// (trigger anında) verilir; bu bileşen sadece portal görselini render eder.
function PortalJumpProp() {
  return (
    <div className="prop prop--portal-jump">
      <div className="prop__portal" />
    </div>
  );
}

// ─── Blob: Snack Time ──────────────────────────────────────────────────────
function SnackTimeProp() {
  return (
    <div className="prop prop--snack">
      <div className="prop__snack">🍪</div>
      <div className="prop__crumbs">
        <span /> <span /> <span />
      </div>
    </div>
  );
}

// ─── Blob: Sleep Zone ──────────────────────────────────────────────────────
function SleepZoneProp() {
  return (
    <div className="prop prop--sleep">
      <div className="prop__pillow" />
      <div className="prop__zzz">
        <span>z</span>
        <span>Z</span>
        <span>z</span>
      </div>
    </div>
  );
}

// ─── Blob: Toy Ball ────────────────────────────────────────────────────────
function ToyBallProp() {
  return (
    <div className="prop prop--toy-ball">
      <div className="prop__ball" />
      <div className="prop__ball-shadow" />
    </div>
  );
}

// ─── Blob: Mood Aura ───────────────────────────────────────────────────────
function MoodAuraProp({ mood }: { mood?: string }) {
  const palette = useMemo(() => {
    switch (mood) {
      case "happy":
        return { color: "#ff6b9a", icon: "♥" };
      case "sleep":
        return { color: "#7ab8ff", icon: "z" };
      case "thinking":
        return { color: "#b48cff", icon: "?" };
      default:
        return { color: "#7ad7ff", icon: "✦" };
    }
  }, [mood]);
  const particles = useMemo(
    () =>
      Array.from({ length: 10 }).map((_, i) => ({
        delay: i * 180,
        angle: (Math.PI * 2 * i) / 10,
        distance: 60 + Math.random() * 16
      })),
    []
  );
  return (
    <div className="prop prop--mood-aura">
      {particles.map((p, i) => {
        const dx = Math.cos(p.angle) * p.distance;
        const dy = Math.sin(p.angle) * p.distance;
        return (
          <span
            key={i}
            className="prop__aura-particle"
            style={{
              color: palette.color,
              transform: `translate(${dx}px, ${dy}px)`,
              animationDelay: `${p.delay}ms`
            }}
          >
            {palette.icon}
          </span>
        );
      })}
    </div>
  );
}

// ─── Blob: Water Splash ────────────────────────────────────────────────────
function WaterSplashProp() {
  const drops = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        angle: (Math.PI * 2 * i) / 18 + Math.random() * 0.3,
        distance: 40 + Math.random() * 50,
        delay: Math.random() * 80
      })),
    []
  );
  return (
    <div className="prop prop--water-splash">
      {drops.map((d, i) => {
        const dx = Math.cos(d.angle) * d.distance;
        const dy = Math.sin(d.angle) * d.distance;
        return (
          <span
            key={i}
            className="prop__water-drop"
            style={{
              transform: `translate(${dx}px, ${dy}px)`,
              animationDelay: `${d.delay}ms`
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Small reusable particles ──────────────────────────────────────────────
function SmallParticles({ count, color }: { count: number; color: string }) {
  const items = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        left: Math.random() * 100,
        delay: Math.random() * 800,
        size: 2 + Math.random() * 2
      })),
    [count]
  );
  return (
    <div className="prop__particles">
      {items.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: color,
            animationDelay: `${p.delay}ms`
          }}
        />
      ))}
    </div>
  );
}
