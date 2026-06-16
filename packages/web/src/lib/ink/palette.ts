/**
 * 水墨 palette + 變體 (variant) emitters.
 *
 * Palette is derived live from the site's CSS theme tokens so the ink always
 * matches 春雪社 — and flips meaning with day/night:
 *   • 日間：墨「吸光」滲進米色和紙 → splat 顏色 = Beer–Lambert 吸收係數
 *           absorb = −ln(token / paper)，疊到密度≈1 時還原成 token 色。
 *   • 夜間：墨在深炭紙上「發光」 → splat 顏色 = token − paper（加光增量）。
 *
 * Emitters are the「一系列」：每個 variant 是一支墨的書寫程式，按時間在
 * velocity / dye 兩張 texture 上落點。互動拖曳由 component 直接呼叫 splat。
 */

export type InkVariant = 'bloom' | 'drip' | 'sweep' | 'breath';

export type RGB = [number, number, number];

export interface InkColorSet {
  /** 和紙底色 (normalized 0..1). */
  paper: RGB;
  /** 主墨 (sumi) splat 單位色. */
  ink: RGB;
  /** 朱砂 / 夜間轉金 — 印泥點. */
  cinnabar: RGB;
  /** 黛綠 — 次要色點. */
  jade: RGB;
  dark: boolean;
}

/** What an emitter needs from the sim — kept minimal to avoid an import cycle. */
export interface InkSplatTarget {
  /**
   * @param x,y    位置，[0,1]，y 向上 (GL 慣例)
   * @param dvx,dvy velocity 力（推動水流）
   * @param color  dye 顏色（墨量，逐通道累加）
   * @param radius splat 半徑（越大越柔、越廣）
   */
  splat(x: number, y: number, dvx: number, dvy: number, color: RGB, radius: number): void;
}

export interface InkEmitter {
  /** Called once on (re)start — paint the opening ink so the loader is never blank. */
  seed(sim: InkSplatTarget, palette: InkColorSet): void;
  /** Called every frame with elapsed seconds since seed. */
  update(sim: InkSplatTarget, palette: InkColorSet, dt: number, t: number): void;
}

// ── theme token → palette ──────────────────────────────────────────────────

const DEFAULTS = {
  light: { canvas: [250, 248, 243], ink: [24, 24, 27], cinnabar: [176, 74, 60], jade: [108, 138, 111] },
  dark: { canvas: [15, 14, 12], ink: [242, 232, 210], cinnabar: [204, 164, 92], jade: [144, 164, 126] },
} as const;

function readToken(name: string, fallback: readonly number[]): RGB {
  if (typeof document === 'undefined') return [fallback[0], fallback[1], fallback[2]];
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = raw.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  if (parts.length < 3) return [fallback[0], fallback[1], fallback[2]];
  return [parts[0], parts[1], parts[2]];
}

const norm = (c: RGB): RGB => [c[0] / 255, c[1] / 255, c[2] / 255];

/** Day = subtractive absorption; night = additive glow above paper. */
function inkSplatColor(token: RGB, paper: RGB, dark: boolean): RGB {
  const t = norm(token);
  if (dark) {
    return [Math.max(t[0] - paper[0], 0), Math.max(t[1] - paper[1], 0), Math.max(t[2] - paper[2], 0)];
  }
  const eps = 1e-3;
  return [
    -Math.log(Math.min(Math.max(t[0] / paper[0], eps), 1)),
    -Math.log(Math.min(Math.max(t[1] / paper[1], eps), 1)),
    -Math.log(Math.min(Math.max(t[2] / paper[2], eps), 1)),
  ];
}

/** The fluid's night ink — a cool moonlit white, NOT the warm beige text token
 *  (--color-ink in dark mode), which glowed too yellow/bright. Light mode still
 *  uses the token so the day ink stays a true sumi black. */
const NIGHT_INK: RGB = [231, 235, 242];

/** Build the active ink palette from the live theme tokens (or SSR defaults). */
export function makePalette(dark: boolean): InkColorSet {
  const fb = dark ? DEFAULTS.dark : DEFAULTS.light;
  const paper = norm(readToken('--color-canvas', fb.canvas));
  const inkToken = dark ? NIGHT_INK : readToken('--color-ink', fb.ink);
  return {
    paper,
    ink: inkSplatColor(inkToken, paper, dark),
    cinnabar: inkSplatColor(readToken('--color-cinnabar', fb.cinnabar), paper, dark),
    jade: inkSplatColor(readToken('--color-jade', fb.jade), paper, dark),
    dark,
  };
}

// ── emitters ────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** 墨綻 — a drop of ink set at the heart of the sheet that slowly bleeds open
 *  (慢慢暈開). Elegant and centred. Night = one soft moonlit drop; day = two
 *  smaller drops of different inks set a little apart (less of a single 大坨). */
function bloomEmitter(): InkEmitter {
  let next = 2.8;
  return {
    seed(sim, p) {
      if (p.dark) {
        // night — a single soft drop at the heart, opening slowly
        sim.splat(0.5, 0.52, 0, rand(15, 45), scale(p.ink, 0.78), 0.022);
        sim.splat(0.5, 0.52, 0, -30, scale(p.cinnabar, 0.5), 0.006);
        const a = rand(0, TAU);
        sim.splat(0.5 + Math.cos(a) * 0.05, 0.52 + Math.sin(a) * 0.05, Math.cos(a) * 110, Math.sin(a) * 110, scale(p.ink, 0.4), 0.015);
      } else {
        // day — two smaller drops of different ink, set apart, drifting toward
        // each other so they meet and mingle (RGB 混色 in the dye buffer)
        const second = Math.random() < 0.5 ? p.cinnabar : p.jade;
        sim.splat(0.42, 0.54, rand(45, 95), rand(0, 35), scale(p.ink, 0.6), 0.014);
        sim.splat(0.6, 0.48, rand(-95, -45), rand(5, 40), scale(second, 0.55), 0.013);
      }
    },
    update(sim, p, _dt, t) {
      if (t < next) return;
      next = t + rand(2.6, 4.2); // sparse + calm — nothing rushes
      const a = rand(0, TAU);
      const r = rand(0.04, 0.14);
      // night stays mostly monochrome; day keeps colour variety between the inks
      const accent = p.dark
        ? Math.random() < 0.12
          ? p.cinnabar
          : p.ink
        : Math.random() < 0.45
          ? Math.random() < 0.5
            ? p.cinnabar
            : p.jade
          : p.ink;
      sim.splat(
        0.5 + Math.cos(a) * r,
        0.5 + Math.sin(a) * r * 0.8,
        Math.cos(a) * rand(70, 170),
        Math.sin(a) * rand(70, 170),
        scale(accent, 0.42),
        rand(0.013, 0.02),
      );
    },
  };
}

/** 墨滴 — drops fall from the top edge and bleed downward. */
function dripEmitter(): InkEmitter {
  let next = 0.4;
  const drop = (sim: InkSplatTarget, p: InkColorSet) => {
    const x = rand(0.12, 0.88);
    const accent = Math.random() < 0.18 ? (Math.random() < 0.55 ? p.cinnabar : p.jade) : p.ink;
    sim.splat(x, rand(0.86, 0.96), rand(-60, 60), rand(-900, -560), scale(accent, 0.8), rand(0.006, 0.012));
  };
  return {
    seed(sim, p) {
      drop(sim, p);
      drop(sim, p);
    },
    update(sim, p, _dt, t) {
      if (t < next) return;
      next = t + rand(0.85, 1.7);
      drop(sim, p);
    },
  };
}

/** 一筆掃 — a calligraphic stroke sweeps across, then restarts from a new side. */
function sweepEmitter(): InkEmitter {
  const DUR = 1.6;
  let phase = 0; // 0..1 along the current stroke
  let start: RGB = [0, 0, 0];
  let dir: [number, number] = [1, 0];
  let from: [number, number] = [0.08, 0.6];
  let to: [number, number] = [0.92, 0.42];
  let useCinnabar = false;

  const reroll = (p: InkColorSet) => {
    const leftToRight = Math.random() < 0.5;
    const y0 = rand(0.3, 0.72);
    const y1 = y0 + rand(-0.18, 0.18);
    from = leftToRight ? [0.06, y0] : [0.94, y0];
    to = leftToRight ? [0.94, y1] : [0.06, y1];
    dir = [to[0] - from[0], to[1] - from[1]];
    const len = Math.hypot(dir[0], dir[1]) || 1;
    dir = [dir[0] / len, dir[1] / len];
    useCinnabar = Math.random() < 0.2;
    start = useCinnabar ? p.cinnabar : p.ink;
  };

  return {
    seed(sim, p) {
      reroll(p);
      phase = 0;
      // a faint anchor dab so the sheet is never empty before the stroke lands
      sim.splat(from[0], from[1], dir[0] * 200, dir[1] * 200, scale(p.ink, 0.25), 0.012);
    },
    update(sim, p, dt, _t) {
      phase += dt / DUR;
      if (phase >= 1) {
        reroll(p);
        phase = 0;
        return;
      }
      // ease so the brush accelerates then lifts
      const e = phase < 0.5 ? 2 * phase * phase : 1 - Math.pow(-2 * phase + 2, 2) / 2;
      const x = from[0] + (to[0] - from[0]) * e;
      const y = from[1] + (to[1] - from[1]) * e;
      const press = Math.sin(phase * Math.PI); // thin → thick → thin
      const speed = 1400 * (0.4 + press);
      sim.splat(x, y, dir[0] * speed, dir[1] * speed, scale(start, 0.5 + press * 0.7), 0.006 + press * 0.01);
    },
  };
}

/** 氣息 — a slow, calm ambient drift; meant to live quietly behind content. */
function breathEmitter(): InkEmitter {
  let next = 0.6;
  let angle = rand(0, TAU);
  return {
    seed(sim, p) {
      sim.splat(0.5, 0.5, 0, 0, scale(p.ink, 0.4), 0.03);
    },
    update(sim, p, dt, t) {
      angle += dt * 0.25;
      if (t < next) return;
      next = t + rand(1.6, 2.8);
      const x = 0.5 + Math.cos(angle) * rand(0.1, 0.32);
      const y = 0.5 + Math.sin(angle * 0.7) * rand(0.1, 0.28);
      const accent = Math.random() < 0.15 ? p.jade : p.ink;
      sim.splat(x, y, Math.cos(angle) * 280, Math.sin(angle) * 280, scale(accent, 0.32), rand(0.018, 0.032));
    },
  };
}

export function createEmitter(variant: InkVariant): InkEmitter {
  switch (variant) {
    case 'drip':
      return dripEmitter();
    case 'sweep':
      return sweepEmitter();
    case 'breath':
      return breathEmitter();
    case 'bloom':
    default:
      return bloomEmitter();
  }
}

/** Per-variant render tuning (dissipation, vorticity, paper finish, sim weight). */
export interface InkTuning {
  velocityDissipation: number;
  dyeDissipation: number;
  curl: number;
  pressureIterations: number;
  inkGain: number;
  vignette: number;
  grain: number;
  fiber: number;
  /** longer side of the simulation grid (square-ish); display upscales it. */
  simResolution: number;
}

const BASE: InkTuning = {
  velocityDissipation: 0.2,
  dyeDissipation: 0.9,
  curl: 24,
  pressureIterations: 24,
  inkGain: 1.12,
  vignette: 0.55,
  grain: 0.035,
  fiber: 1.0,
  simResolution: 180,
};

export function tuningFor(variant: InkVariant): InkTuning {
  switch (variant) {
    case 'drip':
      return { ...BASE, dyeDissipation: 0.6, curl: 20, velocityDissipation: 0.14, inkGain: 1.15 };
    case 'sweep':
      return { ...BASE, dyeDissipation: 0.92, curl: 22, inkGain: 1.12 };
    case 'breath':
      return { ...BASE, dyeDissipation: 1.1, curl: 14, grain: 0.024, vignette: 0.6, inkGain: 1.05, simResolution: 150 };
    case 'bloom':
    default:
      // calm + centred (heavy velocity damping → slow bleed, not flung to edges),
      // but enough curl that the drop opens into organic ink fingers rather than a
      // perfect circle. The 飛白 edge fracture in the shader does the rest.
      return { ...BASE, velocityDissipation: 0.3, dyeDissipation: 0.74, curl: 26, inkGain: 1.06, vignette: 0.6 };
  }
}
