'use client';

/**
 * <InkFluid /> — a GPU 水墨流體 canvas.
 *
 * Wraps {@link InkFluidSim} (WebGL2 Navier–Stokes) and drives it with one of the
 * variant emitters. Fills its parent; the parent owns the size. Day/night aware
 * (re-seeds on theme flip so subtractive↔additive ink never blends), pauses when
 * the tab is hidden, and degrades to a static washi gradient when WebGL2 / reduced
 * motion is unavailable.
 */

import { useEffect, useRef, useState } from 'react';
import { InkFluidSim } from '@/lib/ink/fluidSim';
import { createEmitter, makePalette, tuningFor, type InkVariant, type RGB } from '@/lib/ink/palette';

interface InkFluidProps {
  variant?: InkVariant;
  /** Pointer drag writes ink + flow. Off for loaders (canvas stays click-through). */
  interactive?: boolean;
  className?: string;
}

/** Mirror html.dark — same MutationObserver pattern as ChamberView. */
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

const dim = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

export function InkFluid({ variant = 'bloom', interactive = false, className }: InkFluidProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDark = useIsDark();
  const [fallback, setFallback] = useState(false);
  // theme handler installed by the sim effect; the theme effect calls it
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

    // Size the canvas to the host. The host may be 0×0 when this first runs (a
    // route loading.tsx mounts mid-transition), so fit() is also called every
    // frame below — the sim self-corrects via resize() once layout lands. We do
    // NOT wait for a non-zero size before constructing: a fast/transient mount
    // (chamber overlay) would unmount before ever rendering.
    const fit = () => {
      const w = Math.max(1, Math.round(host.clientWidth * dpr));
      const h = Math.max(1, Math.round(host.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        sim.resize();
      }
    };

    // Construct immediately so the first frame paints right away.
    canvas.width = Math.max(1, Math.round(host.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(host.clientHeight * dpr));
    let sim: InkFluidSim;
    try {
      sim = new InkFluidSim(canvas, tuningFor(variant), palette);
    } catch {
      setFallback(true);
      return;
    }
    setFallback(false);

    let emitter = createEmitter(variant);
    const reseed = () => {
      sim.clear();
      emitter = createEmitter(variant);
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

    // Theme flips re-seed instead of tearing the sim down.
    applyThemeRef.current = (dark: boolean) => {
      palette = makePalette(dark);
      sim.setPalette(palette);
      reseed();
      if (reduced) warmup(56);
    };

    // The non-reduced loop re-fits every frame; the reduced path has no loop, so
    // the observer must also redevelop the still image when a late layout lands
    // (a route loading.tsx that hydrates after first paint) — otherwise a
    // reduced-motion user can be left on a blank, never-recovering loader.
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
      // Reduced motion: develop a settled image once, then hold. Late layout is
      // recovered by onResize above (reseed + redevelop), not a bounded poll.
      warmup(72);
    } else {
      let last = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        fit(); // every frame, before the pause guard, so late layout is caught
        if (!running()) {
          last = now;
          return;
        }
        if (!last) last = now;
        let dt = (now - last) / 1000;
        last = now;
        if (dt > 1 / 30) dt = 1 / 30; // clamp after a stall so it doesn't lurch
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

      // Pause when scrolled out of view (the showcase mounts several at once).
      const io = new IntersectionObserver(
        (entries) => {
          onScreen = entries[0]?.isIntersecting ?? true;
        },
        { threshold: 0.01 },
      );
      io.observe(host);
      cleanups.push(() => io.disconnect());

      if (interactive) {
        const toSim = (e: PointerEvent) => {
          const r = host.getBoundingClientRect();
          return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
        };
        const pointer = { down: false, x: 0, y: 0 };
        const onDown = (e: PointerEvent) => {
          const p = toSim(e);
          pointer.down = true;
          pointer.x = p.x;
          pointer.y = p.y;
        };
        const onMove = (e: PointerEvent) => {
          if (!pointer.down) return;
          const p = toSim(e);
          const dvx = (p.x - pointer.x) * 7000;
          const dvy = (p.y - pointer.y) * 7000;
          const roll = Math.random();
          const base = roll < 0.08 ? palette.cinnabar : roll < 0.14 ? palette.jade : palette.ink;
          sim.splat(p.x, p.y, dvx, dvy, dim(base, 0.6), 0.011);
          pointer.x = p.x;
          pointer.y = p.y;
        };
        const onUp = () => {
          pointer.down = false;
        };
        host.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        cleanups.push(() => {
          host.removeEventListener('pointerdown', onDown);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        });
      }
    }

    return () => {
      applyThemeRef.current = null;
      if (raf) cancelAnimationFrame(raf);
      for (const c of cleanups) c();
      sim.dispose();
    };
    // variant / interactive changes rebuild the sim; theme is handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, interactive]);

  // Apply theme only on an actual day↔night flip. The sim effect already seeds
  // with the current theme on mount, so firing this on the initial commit would
  // clear + re-seed (and warm 56 frames under reduced motion) for nothing.
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
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ pointerEvents: interactive ? 'auto' : 'none', touchAction: interactive ? 'none' : 'auto' }}
      />
      {fallback ? <InkFallback /> : null}
    </div>
  );
}

/** No-WebGL / reduced-motion still gets a quiet washi-and-ink wash. */
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
