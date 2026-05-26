/**
 * Story preset — a single JSON file that drives the entire bootstrap
 * (world + saga + locations + scenes + recruitments) for one saga.
 *
 * Files live at `packages/cli/scripts/stories/<id>.json`. Both cli's
 * bootstrap.ts and web's seed-recruitments action load them.
 *
 * Shape rules:
 *  - Numbers are inclusive bounds; cli converts to bigint at PTB time.
 *  - `attributes` keys MUST match `web/lib/chain/schema.ts`
 *    DEFAULT_ATTRIBUTE_SCHEMA — server-side roll relies on it.
 *  - scene.location_index is the position in the locations[] array.
 *  - recruitments expire `ttl_days` from the moment the seed action
 *    runs (so a static JSON doesn't go stale).
 */

import type { Recruitment } from './recruitment';

export interface StoryWorld {
  name: string;
  description: string;
  currency: { name: string; symbol: string };
}

export interface StoryAttributeDef {
  key: string;
  label: string;
  min: number;
  max: number;
}

export interface StoryWorldRules {
  species: string[];
  attributes: StoryAttributeDef[];
}

export interface StoryLocation {
  name: string;
  description: string;
  terrain: string;
  x: number;
  y: number;
}

export interface StorySaga {
  name: string;
  description: string;
  metadata_uri?: string;
  owner_bps: number;
  storyteller_bps: number;
  treasury_bps: number;
  departure_policy: string;
}

export interface StoryScene {
  name: string;
  description: string;
  /** Index into `locations[]`. */
  location_index: number;
  /** u8: privacy level. 0 = public, higher = more private. */
  privacy: number;
  atmosphere: number;
  danger: number;
  prosperity: number;
  /**
   * UI map coordinates (% of the handscroll canvas, 0–100).
   * Written to chain as `Scene.placement.pos_x` / `pos_y`.
   *
   * Convention for the spring-snow scroll layout:
   *   - x: 0–33  → 戲樓 zone (theater)
   *   - x: 33–50 → 月洞門 gap (transitional)
   *   - x: 50–95 → 院落 zone (compound)
   *   - y: 30–80 → vertical band that reads natural on 100vh canvas
   *
   * Other story presets may use a different visual layout; the chain
   * doesn't care — these are just UI render hints persisted on chain so
   * the layout survives republish.
   */
  pos_x: number;
  pos_y: number;
}

export interface StoryRecruitmentSeed
  extends Omit<Recruitment, 'createdAt' | 'expiresAt' | 'sagaId' | 'sagaName'> {
  /** TTL applied when the seed action runs. Default 14. */
  ttl_days?: number;
}

export interface StoryPreset {
  /** Slug — matches filename `<id>.json`. */
  id: string;
  /** Short human label for the admin dropdown. */
  label: string;
  world: StoryWorld;
  world_rules: StoryWorldRules;
  locations: StoryLocation[];
  saga: StorySaga;
  scenes: StoryScene[];
  recruitments: StoryRecruitmentSeed[];
}
