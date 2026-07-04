/**
 * Story preset: one JSON file (`packages/cli/scripts/stories/<id>.json`) that
 * drives the entire bootstrap (world + saga + locations + scenes + recruitments).
 * `attributes` keys MUST match `web/lib/chain/schema.ts` DEFAULT_ATTRIBUTE_SCHEMA;
 * numeric bounds are inclusive (cli converts to bigint at PTB time).
 */

import type { CharacterAttributes } from './character';
import type { Recruitment } from './recruitment';

export interface StoryWorld {
  name: string;
  description: string;
  currency: { name: string; symbol: string };
  /** Override for world.move WorldTimeConfig; omit for contract defaults. */
  time_config?: {
    /** Basis points: 1670 ~= 1/6 day per tick. */
    days_per_tick_bp: number;
    tick_interval_ms: number;
  };
  /** World-tier narrative content shared by every saga; engine craft rules stay in code. */
  narrative?: {
    /** Genre/style line for POV voice rules. Unset = engine default. */
    genre_base?: string;
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
  /** Graph edges by location index. Omit for no explicit adjacency. */
  adjacent_indices?: number[];
}

export interface StorySaga {
  name: string;
  description: string;
  metadata_uri?: string;
  owner_bps: number;
  storyteller_bps: number;
  treasury_bps: number;
  // Locations this saga claims, as indices into `locations[]` (on-chain
  // `Saga.covered_location_ids`). Omit = cover every location (back-compat).
  covered_location_indices?: number[];
  departure_policy: string;
  // Per-saga narrative DNA layered onto the genre baseline. '' when unset.
  nature_prompt?: string;
  // Natural rhythm cues. '' when unset.
  rhythm_hints?: string;
  // Per-saga portrait art direction. '' when unset.
  portrait_tone?: string;
  /** Saga-tier voice + capabilities; owner-editable content, never engine mechanics. */
  narrative?: {
    /** Prose tonal register (colour only; stance is a separate knob). */
    tone_register?: string;
    /** Emotional stance ceiling: restrained | tender | consummate. */
    emotional_stance?: string;
    /** Contention framing labels by kind (spotlight/recording/partnership/
     *  affection/generic); `{who}` interpolates the affection target. */
    framings?: Record<string, string>;
    /** Content-pipeline capabilities for this saga. */
    features?: {
      /** Multi-character event moment images. Default true. */
      event_image?: boolean;
      /** Beat stills. Default true. */
      stills?: boolean;
      /** Video derivatives. Default false. */
      video?: boolean;
    };
  };
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
   * UI map coordinates (% of the handscroll canvas, 0–100), written to chain
   * as `Scene.placement.pos_x` / `pos_y`. Render hints only — persisted so the
   * layout survives republish.
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
 * A founding-cast member: the saga's initial pre-acquainted troupe, minted
 * directly (no voucher) then woven together by a batch founding induction.
 * Roles uniquely filled here should be dropped from `recruitments` so users
 * can't mint a duplicate.
 */
export interface StoryFoundingMember {
  name: string;
  ageYears: number;
  /** '男' | '女' | '中性'. */
  gender: string;
  /** Role (行當) / specialty; also the public role tag. */
  role: string;
  /** Public description (on-chain / displayed; must not reveal `secret`). */
  description: string;
  /** Private secret — only seeds this member's private memories. */
  secret?: string;
  /**
   * Per-axis attribute floors. The genesis roll is clamped UP to these because
   * rolled stats drive the portrait + persona, so a low roll reads off-type.
   * Omit to let `roleAttributeFloors(role)` supply defaults.
   */
  minAttributes?: Partial<CharacterAttributes>;
  /**
   * Skip this member when seeding — a reversible "comment-out" for test runs
   * (JSON has no comments, so this is the toggle).
   */
  disabled?: boolean;
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
  /** Card draw bias rules; requires attributes keyed by attribute_key. */
  card_weight_rules?: StoryCardWeightRule[];
  /** Contested resources that activate the drama engine. */
  drama_resources?: StoryDramaResource[];
  scenes: StoryScene[];
  recruitments: StoryRecruitmentSeed[];
  /** Initial cast for admin direct-mint + batch induction. */
  founding_cast?: StoryFoundingMember[];
}
