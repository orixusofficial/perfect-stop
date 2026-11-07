"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type BurstOptions = {
  colors?: string[];
  count?: number;
  /** Initial particle speed in px/s. */
  power?: number;
  /** Upward bias, 0..1 (1 = straight up). */
  updraft?: number;
};

export type ParticleHandle = {
  /** Confetti burst at a point (coordinates relative to the layer). */
  burst: (x: number, y: number, options?: BurstOptions) => void;
  /** Full-width celebration falling from the top of the layer. */
  celebrate: (colors?: string[]) => void;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  spin: number;
  life: number;
  maxLife: number;
  gravity: number;
  color: string;
  round: boolean;
};

const PALETTE = ["#7c3aed", "#38bdf8", "#fde047", "#6ee7b7", "#ffffff"];

const ParticleLayer = forwardRef<ParticleHandle>(function ParticleLayer(
  _props,
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    particles: [] as Particle[],
    width: 0,
    height: 0,
    raf: 0,
    last: 0,
  });

  useImperativeHandle(ref, () => {
    const tick = (time: number) => {
      const state = stateRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const dt = Math.min(0.034, (time - state.last) / 1000);
      state.last = time;

      if (canvas && ctx) {
        ctx.clearRect(0, 0, state.width, state.height);

        for (let i = state.particles.length - 1; i >= 0; i--) {
          const p = state.particles[i];
          p.life += dt;
          if (p.life >= p.maxLife) {
            state.particles.splice(i, 1);
            continue;
          }

          p.vy += p.gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.spin * dt;

          const fade = Math.min(1, (p.maxLife - p.life) / 0.35);
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;

          if (p.round) {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          }
          ctx.restore();
        }
      }

      if (state.particles.length > 0) {
        state.raf = requestAnimationFrame(tick);
      } else {
        state.raf = 0;
      }
    };

    const spawn = (particle: Particle) => {
      stateRef.current.particles.push(particle);
    };

    const ensureLoop = () => {
      const state = stateRef.current;
      if (state.raf === 0 && state.particles.length > 0) {
        state.last = performance.now();
        state.raf = requestAnimationFrame(tick);
      }
    };

    const burst = (x: number, y: number, options: BurstOptions = {}) => {
      const {
        colors = PALETTE,
        count = 26,
        power = 340,
        updraft = 0.55,
      } = options;
      const state = stateRef.current;
      if (state.width === 0 || state.height === 0) return;

      for (let i = 0; i < count; i++) {
        const angle =
          -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * (1.15 - updraft * 0.5);
        const speed = power * (0.35 + Math.random() * 0.75);
        spawn({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 5 + Math.random() * 7,
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 10,
          life: 0,
          maxLife: 0.6 + Math.random() * 0.5,
          gravity: 900,
          color: colors[i % colors.length],
          round: Math.random() > 0.55,
        });
      }
      ensureLoop();
    };

    const celebrate = (colors: string[] = PALETTE) => {
      const state = stateRef.current;
      if (state.width === 0 || state.height === 0) return;

      const count = Math.min(120, Math.round(state.width / 7));
      for (let i = 0; i < count; i++) {
        spawn({
          x: Math.random() * state.width,
          y: -20 - Math.random() * 60,
          vx: (Math.random() - 0.5) * 160,
          vy: 60 + Math.random() * 180,
          size: 7 + Math.random() * 8,
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 9,
          life: 0,
          maxLife: 2 + Math.random() * 1.2,
          gravity: 220,
          color: colors[i % colors.length],
          round: Math.random() > 0.6,
        });
      }
      ensureLoop();
    };

    return { burst, celebrate };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = stateRef.current;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      stateRef.current.width = rect.width;
      stateRef.current.height = rect.height;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      if (state.raf) cancelAnimationFrame(state.raf);
      state.particles = [];
      state.raf = 0;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
    />
  );
});

export default ParticleLayer;
