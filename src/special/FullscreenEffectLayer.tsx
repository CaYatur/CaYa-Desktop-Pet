// special/FullscreenEffectLayer.tsx
// -----------------------------------------------------------------------------
// Şeffaf overlay pencere içinde render edilen tüm tam-ekran efektleri.
// OverlayApp tarafından mount edilir; effectId ve durationMs URL'den gelir.
//
// Performans notları:
//   * Matrix / Meteor — <canvas> kullanır (DOM şişmesin diye).
//   * Bubble / Bug / Pixel — sınırlı sayıda DOM elemanı (≤ 60).
//   * Tüm interval/animation frame'ler unmount'ta temizlenir.
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { SpecialActionId } from "./types";

interface Props {
  effectId: SpecialActionId;
  durationMs: number;
  onComplete: () => void;
}

export function FullscreenEffectLayer({ effectId, durationMs, onComplete }: Props) {
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Süre dolunca onComplete tetiklenir.
  useEffect(() => {
    const handle = window.setTimeout(() => onCompleteRef.current(), durationMs);
    return () => window.clearTimeout(handle);
  }, [durationMs]);

  return (
    <div className="fx-layer" data-no-drag>
      {renderEffect(effectId, durationMs)}
    </div>
  );
}

function renderEffect(effectId: SpecialActionId, durationMs: number) {
  switch (effectId) {
    case "caya.matrixCodeRain":
      return <MatrixCodeRain durationMs={durationMs} />;
    case "caya.meteorCompile":
      return <MeteorCompile durationMs={durationMs} />;
    case "caya.bugInvasion":
      return <BugInvasion durationMs={durationMs} />;
    case "cube.gridScan":
      return <GridScan durationMs={durationMs} />;
    case "cube.pixelRepair":
      return <PixelRepair durationMs={durationMs} />;
    case "blob.bubbleWorld":
      return <BubbleWorld durationMs={durationMs} />;
    default:
      return null;
  }
}

// ─── Matrix Code Rain ──────────────────────────────────────────────────────
const MATRIX_TOKENS = [
  "010101", "CaYaDev", "build()", "system.online", "npm", "AI",
  "pet.run()", "compile", "debug", "0xFF", "while", "if(true)",
  "deploy", "merge", "stage", ":)", "v0.1.0"
];

function MatrixCodeRain({ durationMs }: { durationMs: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      // canvas.clientWidth bazı durumlarda 0 dönebiliyor; window'a düş.
      const w = canvas.clientWidth || window.innerWidth || 800;
      const h = canvas.clientHeight || window.innerHeight || 600;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const fontSize = 18 * dpr;
    const columnCount = Math.max(1, Math.floor(canvas.width / fontSize));
    const rowMax = Math.max(1, canvas.height / fontSize);
    // Sütunlara başlangıç satırı dağıt — her satır ekranın her yerinde
    // birden başlasın, ilk frame'de yazılar görünür hâle gelsin.
    const drops = new Array(columnCount)
      .fill(0)
      .map(() => Math.random() * rowMax);
    // Her sütuna kendi düşme hızı.
    const speeds = new Array(columnCount)
      .fill(0)
      .map(() => 0.9 + Math.random() * 1.1);

    let raf = 0;
    let lastTokenRoll = 0;
    let activeTokens: string[] = MATRIX_TOKENS.slice();
    const endTime = Date.now() + durationMs;

    const frame = () => {
      const now = Date.now();
      const fading = now >= endTime - 800;
      const remaining = Math.max(0, endTime - now);
      const opacity = fading ? Math.max(0, remaining / 800) : 1;

      // Trail: önceki frame'i hafifçe silikleştir (destination-out alpha düşürür).
      // Bu sayede şeffaf zemin opak siyaha dönmez.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";

      ctx.font = `${fontSize}px "Cascadia Code", "Consolas", monospace`;
      ctx.textBaseline = "top";

      if (now - lastTokenRoll > 800) {
        activeTokens = activeTokens.slice().sort(() => Math.random() - 0.5);
        lastTokenRoll = now;
      }

      for (let i = 0; i < columnCount; i++) {
        const rowIdx = Math.floor(drops[i]);
        const tokenIdx = ((i + rowIdx) % activeTokens.length + activeTokens.length) % activeTokens.length;
        const token = activeTokens[tokenIdx] || "0";
        const ch = token[Math.floor(Math.random() * token.length)] || "0";
        const y = drops[i] * fontSize;

        // Düşen baş kısmı daha parlak.
        ctx.fillStyle = `rgba(180, 255, 200, ${opacity})`;
        ctx.fillText(ch, i * fontSize, y);
        // Gövde — bir önceki harfin yerine biraz daha karanlık yeşil.
        if (drops[i] >= 1) {
          ctx.fillStyle = `rgba(0, 255, 90, ${opacity * 0.8})`;
          ctx.fillText(ch, i * fontSize, y - fontSize);
        }

        if (y > canvas.height && Math.random() > 0.97) {
          drops[i] = -Math.random() * 6;
        }
        drops[i] += speeds[i];
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, [durationMs]);

  return <canvas ref={canvasRef} className="fx-canvas fx-matrix" />;
}

// ─── Meteor Compile ────────────────────────────────────────────────────────
function MeteorCompile({ durationMs }: { durationMs: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth || 800;
      const h = canvas.clientHeight || window.innerHeight || 600;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    interface Meteor {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      dead: boolean;
      size: number;
    }
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
    }

    const meteors: Meteor[] = [];
    const particles: Particle[] = [];
    let lastSpawn = 0;
    let raf = 0;
    const endTime = Date.now() + durationMs;

    const frame = () => {
      const now = Date.now();
      const stopSpawn = now > endTime - 1500;

      // Trail: önceki frame'i destination-out ile silikleştir; ZEMİN
      // ŞEFFAF kalır, opak siyaha dönmez.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";

      if (!stopSpawn && now - lastSpawn > 130) {
        lastSpawn = now;
        const size = 3 + Math.random() * 2;
        meteors.push({
          x: Math.random() * canvas.width,
          y: -40 * dpr,
          vx: (-1 + Math.random() * 0.6) * 5 * dpr,
          vy: (5.5 + Math.random() * 3) * dpr,
          life: 0,
          dead: false,
          size
        });
      }

      meteors.forEach((m) => {
        if (m.dead) return;
        m.life += 1;
        m.x += m.vx;
        m.y += m.vy;

        // Trail (uzun + kalın)
        const trailLen = 10;
        const grad = ctx.createLinearGradient(
          m.x,
          m.y,
          m.x - m.vx * trailLen,
          m.y - m.vy * trailLen
        );
        grad.addColorStop(0, "rgba(255, 220, 220, 0.95)");
        grad.addColorStop(0.4, "rgba(255, 80, 80, 0.85)");
        grad.addColorStop(1, "rgba(255, 40, 60, 0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = m.size * dpr;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * trailLen, m.y - m.vy * trailLen);
        ctx.stroke();

        // Glow head
        ctx.fillStyle = "rgba(255, 230, 230, 0.95)";
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size * 1.6 * dpr, 0, Math.PI * 2);
        ctx.fill();

        // Patlama
        if (m.y > canvas.height - 6 * dpr) {
          for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 4 + 1.5;
            particles.push({
              x: m.x,
              y: canvas.height - 4 * dpr,
              vx: Math.cos(a) * s * dpr,
              vy: -Math.abs(Math.sin(a) * s) * dpr,
              life: 0
            });
          }
          m.dead = true;
        }
      });

      // Pikselleri çiz
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += 1;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2 * dpr;
        const alpha = Math.max(0, 1 - p.life / 45);
        ctx.fillStyle = `rgba(255, ${Math.max(60, 200 - p.life * 4)}, 80, ${alpha})`;
        ctx.fillRect(p.x, p.y, 3 * dpr, 3 * dpr);
        if (p.life > 45) particles.splice(i, 1);
      }

      // Ölü meteorları temizle
      for (let i = meteors.length - 1; i >= 0; i--) {
        if (meteors[i].dead && meteors[i].life > 5) meteors.splice(i, 1);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, [durationMs]);

  return <canvas ref={canvasRef} className="fx-canvas fx-meteor" />;
}

// ─── Bug Invasion ──────────────────────────────────────────────────────────
function BugInvasion({ durationMs }: { durationMs: number }) {
  const [bugs, setBugs] = useState(() =>
    Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      x: Math.random() * 90 + 5,
      y: Math.random() * 80 + 10,
      cleared: false,
      hue: Math.random() < 0.5 ? "🐛" : "🪲"
    }))
  );
  const [done, setDone] = useState(false);
  const [doneToken, setDoneToken] = useState(0);

  useEffect(() => {
    const sweepStart = Math.max(800, durationMs - 1800);
    const sweepInterval = window.setInterval(() => {
      setBugs((prev) => {
        // %35 ihtimalle bir bug pozisyon değiştir.
        return prev.map((b) =>
          b.cleared || Math.random() > 0.35
            ? b
            : { ...b, x: Math.max(2, Math.min(96, b.x + (Math.random() * 8 - 4))), y: Math.max(2, Math.min(96, b.y + (Math.random() * 6 - 3))) }
        );
      });
    }, 220);

    const sweep = window.setTimeout(() => {
      setBugs((prev) => prev.map((b) => ({ ...b, cleared: true })));
      window.setTimeout(() => setDone(true), 500);
      setDoneToken((t) => t + 1);
    }, sweepStart);

    return () => {
      window.clearInterval(sweepInterval);
      window.clearTimeout(sweep);
    };
  }, [durationMs]);

  return (
    <div className="fx-bug">
      <div className="fx-bug__scan" />
      {bugs.map((b) => (
        <span
          key={b.id}
          className={`fx-bug__icon${b.cleared ? " fx-bug__icon--cleared" : ""}`}
          style={{ left: `${b.x}%`, top: `${b.y}%` }}
        >
          {b.hue}
        </span>
      ))}
      {done ? (
        <div key={doneToken} className="fx-bug__message">
          ✓ bugs cleared
        </div>
      ) : null}
    </div>
  );
}

// ─── Grid Scan ─────────────────────────────────────────────────────────────
function GridScan({ durationMs }: { durationMs: number }) {
  return (
    <div
      className="fx-grid"
      style={{ ["--fx-duration" as never]: `${durationMs}ms` } as CSSProperties}
    >
      <div className="fx-grid__pattern" />
      <div className="fx-grid__scan fx-grid__scan--h" />
      <div className="fx-grid__scan fx-grid__scan--v" />
    </div>
  );
}

// ─── Pixel Repair ──────────────────────────────────────────────────────────
function PixelRepair({ durationMs }: { durationMs: number }) {
  const pixels = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => ({
        id: i,
        x: Math.random() * 90 + 5,
        y: Math.random() * 80 + 10,
        size: 6 + Math.random() * 8,
        delay: Math.random() * (durationMs * 0.35)
      })),
    [durationMs]
  );
  return (
    <div className="fx-pixel">
      {pixels.map((p) => (
        <span
          key={p.id}
          className="fx-pixel__glitch"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}ms`
          }}
        />
      ))}
    </div>
  );
}

// ─── Bubble World ──────────────────────────────────────────────────────────
function BubbleWorld({ durationMs }: { durationMs: number }) {
  const bubbles = useMemo(
    () =>
      Array.from({ length: 48 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 12 + Math.random() * 36,
        delay: Math.random() * (durationMs * 0.6),
        duration: 3500 + Math.random() * 2500
      })),
    [durationMs]
  );
  return (
    <div className="fx-bubble">
      {bubbles.map((b) => (
        <span
          key={b.id}
          className="fx-bubble__b"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            animationDelay: `${b.delay}ms`,
            animationDuration: `${b.duration}ms`
          }}
        />
      ))}
    </div>
  );
}
