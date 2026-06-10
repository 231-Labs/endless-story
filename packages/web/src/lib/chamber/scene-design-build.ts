import type { ChamberParams, ChamberPlacement, SceneDesign, SceneElement } from '@endless-story/chamber-3d';
import { mmToMeters } from '@endless-story/chamber-3d';

/** Character standing spots on the stage (self front-centre). */
const FIGURE_SPOTS: [number, number, number][] = [
  [0, 0, 0.9],
  [-1.7, 0, 0.35],
  [1.7, 0, 0.35],
  [0, 0, 2.0],
];

/**
 * Fixed decor — a 四面台 over the water dressed with the opera convention
 * itself (一桌二椅 + incense); a distant moon gate and one rock breathe at
 * water level. The agent's props are the character-specific 意象 on top;
 * 留白 carries the rest.
 */
const DECOR: SceneElement[] = [
  { kind: 'stage', pos: [0, 0, 0] },
  { kind: 'table_chairs', pos: [0, 0, -1.35] },
  { kind: 'incense', pos: [2.45, 0, 2.25], scale: 0.85 },
  { kind: 'moon_gate', pos: [0, -0.75, -6.2], scale: 1.8 },
  { kind: 'scholar_rock', pos: [-4.6, -0.75, -2.2] },
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
    floor: { type: 'water', y: -0.75 },
    mood: { timeOfDay: 'day', season: 'spring', weather: 'clear', atmosphere: params?.atmosphere },
    elements: [...DECOR, ...props, ...chars],
  };
}
