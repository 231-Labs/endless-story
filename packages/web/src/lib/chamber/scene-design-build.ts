import type { ChamberParams, ChamberPlacement, SceneDesign, SceneElement } from '@endless-story/chamber-3d';
import { mmToMeters } from '@endless-story/chamber-3d';

/** Character standing spots (self front-centre). */
const FIGURE_SPOTS: [number, number, number][] = [
  [0, 0, 0.7],
  [-1.6, 0, 0.2],
  [1.6, 0, 0.2],
  [0, 0, -0.9],
];

/**
 * Fixed decor — 詩意虛無: only the moon gate, a thread of incense and one
 * small rock anchor the stage; everything else (and the emptiness between)
 * is the agent's 一桌二椅 props. 留白 is deliberate.
 */
const DECOR: SceneElement[] = [
  { kind: 'moon_gate', pos: [0, 0, -2.4], scale: 1.15 },
  { kind: 'scholar_rock', pos: [-2.5, 0, -1.2], scale: 0.8 },
  { kind: 'incense', pos: [1.1, 0, -0.4], scale: 0.9 },
];

/**
 * Assemble a `SceneDesign` from agent prop placements + character count +
 * params. Step 1: decor is fixed, props come from the GLM/vision agent, the
 * mood from `params`. Step 2 lets GLM design the decor / backdrop / mood too.
 */
export function buildDesign(
  placements: ChamberPlacement[],
  avatarCount: number,
  params: ChamberParams | null,
): SceneDesign {
  const props: SceneElement[] = placements.map((p) => ({
    kind: p.kind === 1 ? ('scroll' as const) : ('prop' as const),
    pos: [mmToMeters(p.xMm), Math.max(0, mmToMeters(p.yMm)), mmToMeters(p.zMm)],
    yaw: p.yawDeg,
    scale: p.scalePct / 100,
    assetUrl: p.assetUrl,
    fitHeight: p.fitHeight,
    tag: p.tag,
    label: p.label,
  }));
  const chars: SceneElement[] = Array.from({ length: Math.min(avatarCount, 4) }, (_, i) => ({
    kind: 'character' as const,
    pos: FIGURE_SPOTS[i],
    characterIndex: i,
  }));
  return {
    backdrop: { style: '青綠山水' },
    floor: { type: 'water' },
    mood: { timeOfDay: 'day', season: 'spring', weather: 'clear', atmosphere: params?.atmosphere },
    elements: [...DECOR, ...props, ...chars],
  };
}
