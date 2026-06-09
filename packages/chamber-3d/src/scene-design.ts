import type { Season, TimeOfDay, Weather } from './types.js';

/**
 * SceneDesign — a full, renderer-agnostic description of a chamber scene that
 * an LLM (vision) designs from a reference image. The renderer (`SceneRenderer`)
 * assembles the 3D scene from a fixed vocabulary of blocks; the LLM only
 * *chooses, parameterises and places* them (it cannot emit geometry). This is
 * what makes "GLM designs the whole scene" reliable + 3D + cheap.
 */

export type BackdropStyle = '青綠山水' | '水墨遠山' | '暮山' | '夜空' | '雪山' | '素白';
export type FloorType = 'water' | 'wood' | 'stone' | 'void';

/** The placeable block vocabulary. */
export type ElementKind =
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
  floor: { type: FloorType; color?: string };
  mood: { timeOfDay: TimeOfDay; season?: Season; weather: Weather; atmosphere?: number };
  elements: SceneElement[];
}

/**
 * Deterministic default — the curated 青綠山水 water-stage as a SceneDesign, so
 * the renderer always has a coherent scene (no LLM key, parse failure, etc.).
 * The GLM path replaces this with its own design.
 */
export function deterministicDesign(): SceneDesign {
  return {
    backdrop: { style: '青綠山水' },
    floor: { type: 'water' },
    mood: { timeOfDay: 'day', season: 'spring', weather: 'clear' },
    elements: [
      { kind: 'moon_gate', pos: [0, 0, -2.2], scale: 1 },
      { kind: 'bamboo', pos: [2.2, 0, -1.2], scale: 1 },
      { kind: 'scholar_rock', pos: [-2.1, 0, -0.8], scale: 1.1 },
      { kind: 'guqin', pos: [-0.9, 0, 0.3], yaw: 10 },
      { kind: 'incense', pos: [1.2, 0, 0.4] },
      { kind: 'character', pos: [0, 0, 0.7], characterIndex: 0 },
      { kind: 'character', pos: [-1.6, 0, 0.2], characterIndex: 1 },
      { kind: 'character', pos: [1.6, 0, 0.2], characterIndex: 2 },
      { kind: 'scroll', pos: [-1.9, 1.2, -1.6], yaw: 60, assetUrl: '/hero/saga-day.webp', label: '掛軸' },
    ],
  };
}
