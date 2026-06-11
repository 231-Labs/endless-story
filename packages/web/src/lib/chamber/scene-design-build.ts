import type {
  ChamberParams,
  ChamberPlacement,
  SceneDesign,
  SceneElement,
  TableItem,
} from '@endless-story/chamber-3d';
import { mmToMeters } from '@endless-story/chamber-3d';

/** Character standing spots on the stage (self front-centre). */
const FIGURE_SPOTS: [number, number, number][] = [
  [0, 0, 0.9],
  [-1.7, 0, 0.35],
  [1.7, 0, 0.35],
  [0, 0, 2.0],
];

/**
 * Fixed decor — the whole ground IS the lacquer stage; the 四面台 canopy
 * (飛簷 + 紅綢流蘇) stands on it with the opera convention itself (一桌二椅 +
 * incense); a distant moon gate and one rock breathe in the haze. The agent's
 * props are the character-specific 意象 on top; 留白 carries the rest.
 */
const DECOR: SceneElement[] = [
  { kind: 'stage', pos: [0, 0, 0] },
  { kind: 'incense', pos: [2.45, 0, 2.25], scale: 0.85 },
  { kind: 'moon_gate', pos: [0, 0, -6.2], scale: 1.8 },
  { kind: 'scholar_rock', pos: [-4.6, 0, -2.2] },
];

/**
 * Assemble a `SceneDesign` from agent prop placements + character count +
 * params. Decor is fixed; props + the 桌上點睛之物 (tableItem) come from the
 * GLM/vision agent; the mood from `params`.
 */
export function buildDesign(
  placements: ChamberPlacement[],
  avatarCount: number,
  params: ChamberParams | null,
  tableItem: TableItem = 'lamp',
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
  const tableChairs: SceneElement = {
    kind: 'table_chairs',
    pos: [0, 0, -1.35],
    params: { item: tableItem },
  };
  return {
    backdrop: { style: '青綠山水' },
    floor: { type: 'lacquer' },
    mood: { timeOfDay: 'day', season: 'spring', weather: 'clear', atmosphere: params?.atmosphere },
    elements: [...DECOR, tableChairs, ...props, ...chars],
  };
}
