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
  // Locations this saga claims (has narrative rights over), as indices into
  // `locations[]` — on-chain `Saga.covered_location_ids`, and what the handscroll
  // draws. A claimed location needs no scene yet (drawn as an empty courtyard).
  // Omit = cover every location in the world (back-compat single-saga behavior).
  covered_location_indices?: number[];
  departure_policy: string;
  // Per-saga narrative DNA, layered onto the genre baseline so each troupe reads in
  // a distinct voice. '' when unset.
  nature_prompt?: string;
  // Natural rhythm: dawn warm-up / dusk curtain cues. '' when unset.
  rhythm_hints?: string;
  // Per-saga portrait art direction. '' when unset.
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
   *   - x: 0–33  → theater zone
   *   - x: 33–50 → moon-gate gap (transitional)
   *   - x: 50–95 → compound zone
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

/**
 * A founding-cast member — the saga's initial, pre-acquainted troupe. Created
 * directly (no voucher) via the admin 創世入口 panel, then woven together by a
 * batch founding induction. NOT a gacha slot: roles uniquely filled here should
 * be dropped from `recruitments` so users can't mint a duplicate (e.g. a 2nd 班主).
 */
export interface StoryFoundingMember {
  name: string;
  ageYears: number;
  /** '男' | '女' | '中性'. */
  gender: string;
  /** 行當 / specialty (also the public role tag). */
  role: string;
  /** Public description (on-chain / displayed; must not reveal `secret`). */
  description: string;
  /** Private secret — only seeds this member's private memories. */
  secret?: string;
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
  /** Optional initial cast for the 創世入口 (admin direct-mint + batch induction). */
  founding_cast?: StoryFoundingMember[];
}
