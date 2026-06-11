import type {
  ChamberEnvironment,
  ChamberParams,
  RoomDims,
  Season,
  TimeOfDay,
  Weather,
} from './types.js';

/**
 * The parametric "math layer": turn a `ChamberEnvironment` into concrete
 * lighting / fog / palette / dust parameters. Pure + deterministic — same env
 * always yields the same look. No geometry is touched, only light + material
 * params, so this is cheap and never goes off-rails.
 */
export interface EnvPalette {
  bg: string;
  fogNear: number;
  fogFar: number;
  ambientColor: string;
  ambientIntensity: number;
  keyColor: string;
  keyIntensity: number;
  keyPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** dust / atmosphere motes. */
  sparkleColor: string;
  sparkleCount: number;
  /** subtle weathering tint applied to the platform / surfaces. */
  surfaceTint: string;
}

interface BasePalette {
  bg: string;
  ambientColor: string;
  ambientIntensity: number;
  keyColor: string;
  keyIntensity: number;
  keyPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
}

const TIME_BASE: Record<TimeOfDay, BasePalette> = {
  dawn: {
    bg: '#171622',
    ambientColor: '#8a86b0',
    ambientIntensity: 0.7,
    keyColor: '#ffd9b0',
    keyIntensity: 1.5,
    keyPos: [10, 16, 10],
    hemiSky: '#b8c6ff',
    hemiGround: '#4a4060',
  },
  day: {
    // bright, airy 青綠 daylight (the reference look)
    bg: '#c4ddd6',
    ambientColor: '#d6e6df',
    ambientIntensity: 1.05,
    keyColor: '#fff4e6',
    keyIntensity: 1.55,
    keyPos: [8, 20, 10],
    hemiSky: '#dcefe9',
    hemiGround: '#a8bcb2',
  },
  dusk: {
    bg: '#0e0c16',
    ambientColor: '#6a6a96',
    ambientIntensity: 0.62,
    keyColor: '#ffb066',
    keyIntensity: 1.35,
    keyPos: [9, 13, 6],
    hemiSky: '#7a86c8',
    hemiGround: '#3a3450',
  },
  night: {
    bg: '#080810',
    ambientColor: '#525a82',
    ambientIntensity: 0.4,
    keyColor: '#9fb6ff',
    keyIntensity: 0.7,
    keyPos: [6, 16, -6],
    hemiSky: '#5a6aa0',
    hemiGround: '#2a2840',
  },
};

/** Hue to nudge ambient toward, per season. */
const SEASON_TINT: Record<Season, string> = {
  spring: '#cfe8c0',
  summer: '#ffe8c0',
  autumn: '#e8c79a',
  winter: '#cdd8ff',
};

export function paletteForEnv(env: ChamberEnvironment): EnvPalette {
  const base = TIME_BASE[env.timeOfDay];
  const atmosphere = clamp01(env.atmosphere);
  const weathering = clamp01(env.weathering);

  // atmosphere lifts/dims the light; weathering pulls warmth + dust.
  const keyIntensity = base.keyIntensity * (0.7 + atmosphere * 0.5);
  const ambientIntensity = base.ambientIntensity * (0.7 + atmosphere * 0.4);

  // ambient leans toward the season tint; more so when calm.
  const ambientColor = lerpHex(base.ambientColor, SEASON_TINT[env.season], 0.18 + atmosphere * 0.12);

  // weather sets fog + dust.
  let bg = base.bg;
  let fogNear = 16;
  let fogFar = 48;
  let sparkleCount = Math.round(40 + weathering * 120);
  let sparkleColor = '#c9b48a';
  if (env.weather === 'mist') {
    bg = lerpHex(base.bg, '#1a1d28', 0.5);
    fogNear = 6;
    fogFar = 30;
    sparkleCount += 80;
    sparkleColor = '#aab4c8';
  } else if (env.weather === 'rain') {
    bg = lerpHex(base.bg, '#0c1018', 0.6);
    fogNear = 10;
    fogFar = 36;
    sparkleColor = '#9fb0c8';
  }

  // weathering: warm sepia surface tint, deeper with age.
  const surfaceTint = lerpHex('#1a1a24', '#3a2e22', weathering);

  return {
    bg,
    fogNear,
    fogFar,
    ambientColor,
    ambientIntensity,
    keyColor: base.keyColor,
    keyIntensity,
    keyPos: base.keyPos,
    hemiSky: base.hemiSky,
    hemiGround: base.hemiGround,
    hemiIntensity: 0.5 + atmosphere * 0.2,
    sparkleColor,
    sparkleCount,
    surfaceTint,
  };
}

/** Build an environment from chain params + optional overrides (世界節氣/日夜/天氣). */
export function deriveEnvironment(
  params: ChamberParams | null | undefined,
  overrides?: Partial<ChamberEnvironment>,
): ChamberEnvironment {
  const atmosphere = normaliseAtmosphere(params?.atmosphere);
  return {
    timeOfDay: 'dusk',
    season: 'autumn',
    weather: 'clear',
    atmosphere,
    weathering: 0.4,
    ...overrides,
  };
}

/**
 * Parametric room size. `grandeur` (0..1, from scene prosperity) scales a modest
 * room up to a tall hall. `scale` (default 1) is a manual multiplier.
 */
export function deriveRoomDims(
  params: ChamberParams | null | undefined,
  scale = 1,
): RoomDims {
  const grandeur = clamp01(normaliseAtmosphere(params?.prosperity ?? 0.5));
  return {
    width: (6.2 + grandeur * 5) * scale,
    depth: (5.4 + grandeur * 4) * scale,
    height: (3.6 + grandeur * 2.2) * scale,
  };
}

function normaliseAtmosphere(raw: number | undefined): number {
  if (raw == null || Number.isNaN(raw)) return 0.5;
  if (raw <= 1) return raw;
  return clamp01(raw / 100);
}

// ── tiny hex helpers (avoid a colour dependency) ─────────────────────

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpHex(a: string, b: string, t: number): string {
  const ta = clamp01(t);
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * ta, ag + (bg - ag) * ta, ab + (bb - ab) * ta);
}

export { normaliseAtmosphere };
