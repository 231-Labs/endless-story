import type { Season, TimeOfDay, Weather } from './types.js';

/**
 * SceneDesign — a full, renderer-agnostic description of a chamber scene that
 * an LLM (vision) designs from a reference image. The renderer (`SceneRenderer`)
 * assembles the 3D scene from a fixed vocabulary of blocks; the LLM only
 * *chooses, parameterises and places* them (it cannot emit geometry). This is
 * what makes "GLM designs the whole scene" reliable + 3D + cheap.
 */

export type BackdropStyle = '青綠山水' | '水墨遠山' | '暮山' | '夜空' | '雪山' | '素白';
/** 'lacquer' = polished dark stage floor (reflective) — the whole ground IS the stage. */
export type FloorType = 'water' | 'lacquer' | 'wood' | 'stone' | 'void';

/** 桌上點睛之物 — the agent picks one symbolic item for the 一桌二椅. */
export type TableItem = 'lamp' | 'letter' | 'sword' | 'none';

/** The placeable block vocabulary. */
export type ElementKind =
  | 'stage' // 四面台 — raised opera stage (top at local y=0)
  | 'table_chairs' // 一桌二椅 — the opera convention
  | 'moon_gate' // 月洞門
  | 'screen' // 屏風
  | 'bamboo' // 竹
  | 'scholar_rock' // 太湖石
  | 'lantern' // 燈籠
  | 'guqin' // 古琴几
  | 'incense' // 香爐（青煙）
  | 'plum_branch' // 梅枝
  | 'prop' // a catalog furniture prop (kind-0 glb / primitive)
  | 'scroll' // 掛軸 (kind-1 image quad)
  | 'character'; // a slot filled by a real character standee

export interface SceneElement {
  kind: ElementKind;
  /** metres, origin = scene centre. */
  pos: [number, number, number];
  /** degrees. */
  yaw?: number;
  /** uniform scale multiplier (1 = default). */
  scale?: number;
  /** 'prop': catalog id; resolved to glb/primitive by the loader. */
  catalogId?: string;
  /** 'prop' glb url / 'scroll' image url (resolved). */
  assetUrl?: string;
  /** 'prop' target height for glb auto-scale. */
  fitHeight?: number;
  /** primitive/styling hint. */
  tag?: string;
  /** which avatar fills a 'character' slot (index into layout.avatars). */
  characterIndex?: number;
  /** display label / hover. */
  label?: string;
  /** kind-specific extras. */
  params?: Record<string, unknown>;
}

export interface SceneDesign {
  backdrop: { style: BackdropStyle; palette?: string[] };
  /** `y` lowers the floor plane (e.g. -0.75 puts the water below a stage). */
  floor: { type: FloorType; color?: string; y?: number };
  mood: { timeOfDay: TimeOfDay; season?: Season; weather: Weather; atmosphere?: number };
  elements: SceneElement[];
}

/**
 * Deterministic default — the whole ground IS the stage: a polished lacquer
 * floor stretching to the mist (reflections come from the floor, like a real
 * stage), a 四面台 canopy with 飛簷 standing on it, dressed only with the
 * opera convention itself (一桌二椅 + a thread of incense); a distant moon
 * gate and one rock breathe in the haze. Objects are 意象, not furniture.
 */
export function deterministicDesign(): SceneDesign {
  return {
    backdrop: { style: '青綠山水' },
    floor: { type: 'lacquer' },
    mood: { timeOfDay: 'day', season: 'spring', weather: 'clear' },
    elements: [
      { kind: 'stage', pos: [0, 0, 0] },
      { kind: 'table_chairs', pos: [0, 0, -1.35], params: { item: 'lamp' } },
      { kind: 'incense', pos: [2.45, 0, 2.25], scale: 0.85 },
      { kind: 'moon_gate', pos: [0, 0, -6.2], scale: 1.8 },
      { kind: 'scholar_rock', pos: [-4.6, 0, -2.2] },
      { kind: 'character', pos: [0, 0, 0.9], characterIndex: 0 },
      { kind: 'character', pos: [-1.7, 0, 0.35], characterIndex: 1 },
      { kind: 'character', pos: [1.7, 0, 0.35], characterIndex: 2 },
    ],
  };
}
