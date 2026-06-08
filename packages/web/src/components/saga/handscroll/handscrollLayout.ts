import type { SagaLocation, Scene } from '@endless-story/shared';

/**
 * Handscroll horizontal layout — data-driven, follows this saga's locations & scenes.
 *
 * The old version hard-coded three segments + one fixed drawing, which broke on
 * any other saga. Now:
 *   - each covered location gets an equal-width segment (left→right per coveredLocationIds order).
 *   - each segment has one location label plaque, centered.
 *   - that location's scenes are placed within its segment (spread horizontally, vertical from scene.pos_y).
 *   - locations with no scenes still keep an empty segment, preserving the "world is bigger than the drama" feel.
 *
 * Coordinates are percentages (0-100) of the full scroll width/height, matching SceneVignette's left/top%.
 */

export interface ScenePlacement {
  scene: Scene;
  /** Percent of full scroll width (0-100) */
  xPct: number;
  /** Percent of full scroll height (0-100) */
  yPct: number;
  /** For SceneVignette quote offset: top half of segment = 'theater', bottom = 'compound' */
  zone: 'theater' | 'compound';
}

export interface LocationSegment {
  location: SagaLocation;
  /** Segment index (0-based, left→right) */
  index: number;
  /** Segment's horizontal range on the full scroll (percent) */
  startPct: number;
  endPct: number;
  /** Location label position (segment center, percent) */
  labelXPct: number;
  scenes: ScenePlacement[];
}

export interface HandscrollLayout {
  segments: LocationSegment[];
  /** Number of locations (= segment count) */
  segmentCount: number;
}

// Usable horizontal band within a segment (keeps scenes off the segment edges / wall)
const INNER_START = 0.16;
const INNER_END = 0.84;
// Scenes' vertical position is clamped to this band — kept low near the ground so
// anchors don't float mid-air (courtyard silhouettes sit at ~45-70% of viewBox height).
const Y_MIN = 56;
const Y_MAX = 70;

function sceneSortKey(s: Scene): number {
  return s.posX ?? 50;
}

/** Spread scenes horizontally within a segment: 1 centered, many evenly across [INNER_START, INNER_END]. */
function spreadFraction(idx: number, count: number): number {
  if (count <= 1) return 0.5;
  return INNER_START + (INNER_END - INNER_START) * (idx / (count - 1));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeHandscrollLayout(
  locations: SagaLocation[],
  scenes: Scene[],
): HandscrollLayout {
  // Only keep scenes whose location is in this saga's covered set. Scenes at
  // uncovered (external) locations — also anchored on the saga, so read in too —
  // aren't drawn on the axis (left to the off-turf panel); scenes missing a
  // locationId (bad data) are skipped rather than forced into a segment by pos_x.
  const locIdSet = new Set(locations.map((l) => l.id));
  const scenesByLocId = new Map<string, Scene[]>();
  for (const sc of scenes) {
    if (sc.locationId && locIdSet.has(sc.locationId)) {
      const list = scenesByLocId.get(sc.locationId) ?? [];
      list.push(sc);
      scenesByLocId.set(sc.locationId, list);
    }
  }

  // Faithfully show this saga's narrative-rights set = `coveredLocationIds`
  // (caller already passes only these). Not filtered by "has scenes": a covered
  // location with no scenes yet still draws as an empty courtyard. Locations the
  // saga hasn't claimed aren't in coveredLocationIds, so they aren't drawn.
  const shown = locations;
  const segmentCount = Math.max(1, shown.length);
  const segWidth = 100 / segmentCount;

  // Each segment's scenes = those belonging to that location
  const byLocation: Scene[][] = shown.map((loc) => [...(scenesByLocId.get(loc.id) ?? [])]);

  const segments: LocationSegment[] = shown.map((location, index) => {
    const startPct = index * segWidth;
    const endPct = (index + 1) * segWidth;
    const labelXPct = startPct + segWidth / 2;

    const sorted = [...byLocation[index]].sort((a, b) => sceneSortKey(a) - sceneSortKey(b));
    const scenePlacements: ScenePlacement[] = sorted.map((scene, j) => {
      const frac = spreadFraction(j, sorted.length);
      const xPct = startPct + segWidth * frac;
      const baseY = scene.posY != null ? scene.posY : 50 + (j % 2 === 0 ? -6 : 6);
      const yPct = clamp(baseY, Y_MIN, Y_MAX);
      return { scene, xPct, yPct, zone: yPct < 54 ? 'theater' : 'compound' };
    });

    return { location, index, startPct, endPct, labelXPct, scenes: scenePlacements };
  });

  return { segments, segmentCount };
}
