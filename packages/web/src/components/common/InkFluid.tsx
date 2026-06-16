'use client';

// <InkFluid /> — drives InkFluidSim with the 墨綻 emitter. Fills its parent,
// day/night aware (re-seeds on theme flip), pauses when hidden/off-screen, and
// degrades to a static wash when WebGL2 / reduced motion is unavailable.

import { useEffect, useRef, useState } from 'react';
import { InkFluidSim } from '@/lib/ink/fluidSim';
import { createInkEmitter, makePalette, INK_TUNING } from '@/lib/ink/palette';

export function InkFluid({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDark = useIsDark();
  const [fallback, setFallback] = useState(false);
  const applyThemeRef = useRef<((dark: boolean) => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!InkFluidSim.isSupported()) {
      setFallback(true);
      return;
    }

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5);
    let elapsed = 0;
    let raf = 0;
    let visible = true;
    let onScreen = true;
    let palette = makePalette(document.documentElement.classList.contains('dark'));
    const running = () => visible && onScreen;
    const cleanups: Array<() => void> = [];

    // The host may be 0×0 at mount (a route loading.tsx mounts mid-transition), so
    // fit() runs every frame and the sim self-corrects. We construct immediately
    // rather than wait for layout, or a transient mount unmounts before painting.
    const fit = () => {
      const w = Math.max(1, Math.round(host.clientWidth * dpr));
      const h = Math.max(1, Math.round(host.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        sim.resize();
      }
    };

    canvas.width = Math.max(1, Math.round(host.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(host.clientHeight * dpr));
    let sim: InkFluidSim;
    try {
      sim = new InkFluidSim(canvas, INK_TUNING, palette);
    } catch {
      setFallback(true);
      return;
    }
    setFallback(false);

    let emitter = createInkEmitter();
    const reseed = () => {
      sim.clear();
      emitter = createInkEmitter();
      elapsed = 0;
      emitter.seed(sim, palette);
    };
    const warmup = (steps: number) => {
      const h = 1 / 60;
      for (let i = 0; i < steps; i++) {
        emitter.update(sim, palette, h, elapsed);
        elapsed += h;
        sim.step(h);
      }
      sim.render(elapsed);
    };

    reseed();

    applyThemeRef.current = (dark: boolean) => {
      palette = makePalette(dark);
      sim.setPalette(palette);
      reseed();
      if (reduced) warmup(56);
    };

    // Reduced motion has no loop, so the observer redevelops the still image if a
    // late layout lands; otherwise it just re-fits (the loop handles that case).
    const onResize = () => {
      const before = canvas.width;
      fit();
      if (reduced && canvas.width !== before) {
        reseed();
        warmup(72);
      }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);
    cleanups.push(() => ro.disconnect());

    if (reduced) {
      warmup(72);
    } else {
      let last = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        fit();
        if (!running()) {
          last = now;
          return;
        }
        if (!last) last = now;
        let dt = (now - last) / 1000;
        last = now;
        if (dt > 1 / 30) dt = 1 / 30;
        elapsed += dt;
        emitter.update(sim, palette, dt, elapsed);
        sim.step(dt);
        sim.render(elapsed);
      };
      raf = requestAnimationFrame(loop);

      const onVis = () => {
        visible = !document.hidden;
      };
      document.addEventListener('visibilitychange', onVis);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

      const io = new IntersectionObserver(
        (entries) => {
          onScreen = entries[0]?.isIntersecting ?? true;
        },
        { threshold: 0.01 },
      );
      io.observe(host);
      cleanups.push(() => io.disconnect());
    }

    return () => {
      applyThemeRef.current = null;
      if (raf) cancelAnimationFrame(raf);
      for (const c of cleanups) c();
      sim.dispose();
    };
  }, []);

  // Only on an actual flip — the sim effect already seeds with the current theme.
  const themeDidMount = useRef(false);
  useEffect(() => {
    if (!themeDidMount.current) {
      themeDidMount.current = true;
      return;
    }
    applyThemeRef.current?.(isDark);
  }, [isDark]);

  return (
    <div ref={hostRef} className={className} aria-hidden>
      <canvas ref={canvasRef} className="block h-full w-full" style={{ pointerEvents: 'none' }} />
      {fallback ? <InkFallback /> : null}
    </div>
  );
}

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof document === 'undefined' ? false : document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const html = document.documentElement;
    const update = () => setIsDark(html.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

function InkFallback() {
  return (
    <div
      className="pointer-events-none absolute inset-0 bg-canvas"
      style={{
        backgroundImage:
          'radial-gradient(60% 55% at 50% 48%, rgb(var(--color-ink) / 0.16), transparent 70%),' +
          'radial-gradient(28% 24% at 50% 50%, rgb(var(--color-cinnabar) / 0.18), transparent 72%)',
      }}
    />
  );
}
