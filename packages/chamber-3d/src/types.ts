/**
 * Frontend mirror of the on-chain `endless_story::chamber::ObjectPlacement`.
 *
 * On-chain, coordinates are stored as offset-encoded millimetres because Move
 * has no signed integers: `actual_mm = stored_mm - ORIGIN_MM`. The decode
 * helpers here turn a placement read from chain into Three.js-friendly metres
 * + radians. Kept dependency-free so both the renderer and the (future)
 * room-gen agent can share it.
 */

/** Must match `ORIGIN_MM` in `contracts/endless_story/sources/chamber.move`. */
export const ORIGIN_MM = 100_000;

/** kind discriminant on `ObjectPlacement.kind`. */
export const PLACEMENT_KIND = {
  /** glb prop — static kit OR parametric hero. */
  GLB: 0,
  /** 2D 掛軸 / still — rendered as a textured quad. */
  SCROLL: 1,
} as const;

export type PlacementKind = (typeof PLACEMENT_KIND)[keyof typeof PLACEMENT_KIND];

/**
 * A placement as the frontend consumes it. `assetBlobId` is the Walrus blob id
 * (decoded from the on-chain `vector<u8>`); `sourceObject` is the optional NFT
 * object id this placement depicts.
 */
export interface ChamberPlacement {
  kind: PlacementKind;
  /** Walrus blob id as stored on chain (decoded from `vector<u8>`). */
  assetBlobId: string;
  /**
   * Resolved, loadable URL for the asset — a `.glb`/`.gltf` for kind 0 or an
   * image for kind 1. Derived from `assetBlobId` (Walrus aggregator) by the
   * loader; fixtures may set it directly. When absent for a kind-0 prop, the
   * renderer falls back to a catalog primitive keyed by `tag`.
   */
  assetUrl?: string;
  /** Catalog hint for primitive fallback / styling, e.g. 'desk' | 'lamp'. */
  tag?: string;
  /** Target height in metres for a GLB prop (auto-scale normalisation). */
  fitHeight?: number;
  /** Human-readable label (hover / future 點物件看章回). */
  label?: string;
  sourceObject?: string | null;
  /** offset-encoded millimetres as stored on chain. */
  xMm: number;
  yMm: number;
  zMm: number;
  /** 0..359 */
  yawDeg: number;
  /** 100 = 1.0x */
  scalePct: number;
}

/** Scene mood, read from chain `Scene.params` (drives lighting). */
export interface ChamberParams {
  atmosphere: number;
  danger: number;
  prosperity: number;
}

/** One character present in the chamber's scene. */
export interface ChamberAvatar {
  id: string;
  name?: string;
  /** the chamber's owning character (rendered at centre). */
  isSelf?: boolean;
  /** portrait image (Walrus) → rendered as a 2D standee. */
  portraitUrl?: string;
  /** resolved glb url (later, Meshy); capsule stand-in until then. */
  glbUrl?: string;
}

/**
 * Parametric environment — the "math layer" of the chamber. Drives lighting /
 * fog / palette / weathering from the living world state (季節 / 日夜 / 天氣 /
 * `Scene.params` / 存活天數). No geometry: only light + material parameters, so
 * it's deterministic and cheap. This is where parameterisation lives now —
 * objects are kit / 2D, the *room's mood* is parametric.
 */
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'mist' | 'rain' | 'snow';

export interface ChamberEnvironment {
  timeOfDay: TimeOfDay;
  season: Season;
  weather: Weather;
  /** 0..1 — calm/bright (1) vs dim/tense (0); from Scene.params.atmosphere. */
  atmosphere: number;
  /** 0..1 — patina / dust / fade from age. */
  weathering: number;
}

/**
 * Parametric room size (metres). Grandeur scales with the character's standing
 * (scene prosperity) — a 頭牌's chamber is a tall hall, a 龍套's a modest room.
 */
export interface RoomDims {
  width: number;
  depth: number;
  height: number;
}

/**
 * Everything the renderer needs to draw one chamber. Assembled by the loader
 * from a character → its home `Scene` (current_character_ids / params) + the
 * `chamber::Furnishing` layout (or a fixture until the chamber is enabled).
 */
export interface ChamberLayout {
  characterId: string;
  sceneId?: string | null;
  avatars: ChamberAvatar[];
  params?: ChamberParams | null;
  /** parametric environment; renderer derives a default from `params` if absent. */
  env?: ChamberEnvironment | null;
  placements: ChamberPlacement[];
}

/** Decode one offset-encoded millimetre axis to metres. */
export function mmToMeters(storedMm: number): number {
  return (storedMm - ORIGIN_MM) / 1000;
}

export interface PlacementTransform {
  position: [number, number, number];
  /** rotation about Y, in radians. */
  rotationY: number;
  scale: number;
}

/** Turn an on-chain placement into a Three.js transform (metres + radians). */
export function placementToTransform(p: ChamberPlacement): PlacementTransform {
  return {
    position: [mmToMeters(p.xMm), mmToMeters(p.yMm), mmToMeters(p.zMm)],
    rotationY: (p.yawDeg * Math.PI) / 180,
    scale: p.scalePct / 100,
  };
}
