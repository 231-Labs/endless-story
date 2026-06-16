// 水墨 palette + the 墨綻 (bloom) emitter. Palette is read live from the CSS theme
// tokens: day ink = Beer-Lambert absorption −ln(token/paper); night = additive
// glow token−paper.

export type RGB = [number, number, number];

export interface InkColorSet {
  paper: RGB;
  ink: RGB;
  cinnabar: RGB;
  jade: RGB;
  dark: boolean;
}

// Minimal sim surface an emitter needs (also breaks the import cycle with fluidSim).
// x,y in [0,1] (y up); dvx,dvy = velocity force; color = ink added to dye; radius = softness.
export interface InkSplatTarget {
  splat(x: number, y: number, dvx: number, dvy: number, color: RGB, radius: number): void;
}

export interface InkEmitter {
  seed(sim: InkSplatTarget, palette: InkColorSet): void;
  update(sim: InkSplatTarget, palette: InkColorSet, dt: number, t: number): void;
}

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

// Night ink is a cool moonlit white, not the warm beige text token (too yellow as a glow).
const NIGHT_INK: RGB = [231, 235, 242];

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

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

// 墨綻 — a drop that slowly bleeds open. Night = one moonlit drop; day = two
// smaller drops of different inks that drift together and mingle.
export function createInkEmitter(): InkEmitter {
  let next = 2.8;
  return {
    seed(sim, p) {
      if (p.dark) {
        sim.splat(0.5, 0.52, 0, rand(15, 45), scale(p.ink, 0.78), 0.022);
        sim.splat(0.5, 0.52, 0, -30, scale(p.cinnabar, 0.5), 0.006);
        const a = rand(0, TAU);
        sim.splat(0.5 + Math.cos(a) * 0.05, 0.52 + Math.sin(a) * 0.05, Math.cos(a) * 110, Math.sin(a) * 110, scale(p.ink, 0.4), 0.015);
      } else {
        const second = Math.random() < 0.5 ? p.cinnabar : p.jade;
        sim.splat(0.42, 0.54, rand(45, 95), rand(0, 35), scale(p.ink, 0.6), 0.014);
        sim.splat(0.6, 0.48, rand(-95, -45), rand(5, 40), scale(second, 0.55), 0.013);
      }
    },
    update(sim, p, _dt, t) {
      if (t < next) return;
      next = t + rand(2.6, 4.2);
      const a = rand(0, TAU);
      const r = rand(0.04, 0.14);
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

export interface InkTuning {
  velocityDissipation: number;
  dyeDissipation: number;
  curl: number;
  pressureIterations: number;
  inkGain: number;
  vignette: number;
  grain: number;
  fiber: number;
  simResolution: number;
}

export const INK_TUNING: InkTuning = {
  velocityDissipation: 0.3,
  dyeDissipation: 0.74,
  curl: 26,
  pressureIterations: 24,
  inkGain: 1.06,
  vignette: 0.6,
  grain: 0.035,
  fiber: 1.0,
  simResolution: 180,
};
