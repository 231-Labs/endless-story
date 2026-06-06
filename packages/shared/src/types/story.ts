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
  /** Optional override for world.move WorldTimeConfig. Omit to use contract defaults. */
  time_config?: {
    /** basis points: 1670 ~= 1/6 day per tick. */
    days_per_tick_bp: number;
    tick_interval_ms: number;
  };
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
  /** Optional graph edges by location index. Omit for no explicit adjacency. */
  adjacent_indices?: number[];
}

export interface StorySaga {
  name: string;
  description: string;
  metadata_uri?: string;
  owner_bps: number;
  storyteller_bps: number;
  treasury_bps: number;
  /**
   * 本 saga 認領（有敘事權）的 location，以 `locations[]` 的索引表示。
   * 這就是鏈上 `Saga.covered_location_ids`，也是手卷橫軸畫哪些地點的依據。
   * 不必每個都已安排 scene（暫時沒戲的地點仍算覆蓋、畫成空院落）。
   * 省略 = 覆蓋世界裡全部 location（向後相容；單一 saga 的舊行為）。
   */
  covered_location_indices?: number[];
  departure_policy: string;
  /** 事件氣質 — per-saga narrative DNA (F). Layered onto the genre baseline
   *  so each戲班 reads in a distinct voice. Optional; '' when unset. */
  nature_prompt?: string;
  /** 自然節律 — dawn warm-up / dusk curtain cues (F). Optional; '' when unset. */
  rhythm_hints?: string;
  /** 畫風 — per-saga portrait art direction (F). Optional; '' when unset. */
  portrait_tone?: string;
}

export interface StoryScene {
  name: string;
  description: string;
  /** Optional Display image / metadata URI persisted on SceneInfo. */
  metadata_uri?: string;
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

export interface StorySagaAttribute {
  key: string;
  label: string;
  min: number;
  max: number;
}

export interface StoryCardWeightRule {
  /** event.move CardTemplate.intent: 0 KILL, 1 ATTACK, 2 DEFEND, 3 HEAL, 4 SOCIAL, 5 FLEE, 6 WITNESS, 7 INTIMATE, 8 CUSTOM. */
  intent: number;
  attribute_key: string;
  bonus_per_point: number;
}

export interface StoryDramaResource {
  archetype: string;
  label: string;
  capacity: number;
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
  /** Per-saga skill definitions stored on saga.move dynamic fields. */
  saga_attributes?: StorySagaAttribute[];
  /** Optional card draw bias rules. Requires saga_attributes/world attributes keyed by attribute_key. */
  card_weight_rules?: StoryCardWeightRule[];
  /** Contested resources that activate the drama engine. */
  drama_resources?: StoryDramaResource[];
  scenes: StoryScene[];
  recruitments: StoryRecruitmentSeed[];
}
