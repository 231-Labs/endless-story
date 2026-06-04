import type { BlobRef, CharacterMembership, CharacterRole, Wallet } from './common';

export type SurvivalLevel = 'critical' | 'low' | 'stable' | 'healthy';

/** 氣血 bucket for the vitality bar / life-cycle state machine. */
export type VitalityState = 'healthy' | 'strained' | 'failing' | 'dead';

/** Coarse life-cycle stage (character economy). */
export type LifeStage = 'birth' | 'growth' | 'golden' | 'aging' | 'decline';

export type Gender = 'female' | 'male' | 'other';

export interface SurvivalStatus {
  funds: number;
  dailyCost: number;
  salary: number;
  daysLeft: number;
  level: SurvivalLevel;
  // ── character-economy fields (optional: mock fixtures pre-date them;
  //    renderers treat undefined as "not available") ──
  /** real memory total (age proxy now, relayer count later) — drives storage rent. */
  memoryCount?: number;
  /** ENDLESS/day memory storage-rent component of dailyCost (C_mem × memoryCount). */
  memoryRent?: number;
  /** 設定集 image count (gallery assets) — grows with event moments / evolve-portrait. */
  imageCount?: number;
  /** ENDLESS/day 設定集 image storage-rent component of dailyCost (C_img × imageCount). */
  imageRent?: number;
  /** 氣血 0..100. */
  vitality?: number;
  vitalityState?: VitalityState;
  lifeStage?: LifeStage;
}

export interface CharacterDerivativeGallery {
  anchor: BlobRef;
  /** Full on-chain setting gallery (`Character.media_assets`) when available. */
  variants?: BlobRef[];
  costume?: BlobRef;
  makeup?: BlobRef;
  eventMoments: BlobRef[];
}

export interface CharacterAttributes {
  constitution: number;
  disposition: number;
  acuity: number;
  appearance: number;
}

export interface CharacterTag {
  label: string;
  sourceEventId?: string | null;
  affirmedAtMs?: string;
}

export interface Character {
  id: string;
  nftOwner: Wallet;
  sagaId: string | null;
  /**
   * Public roster bucket for the saga UI. Unlike `sagaId`, this comes from
   * the originating recruitment and distinguishes troupe members from guest
   * / outside-world characters who still participate in the same saga.
   */
  membership?: CharacterMembership;
  name: string;
  description: string;
  role: CharacterRole;
  gender: Gender;
  age: number;
  physicalFacts: string;
  /** Public on-chain social labels, e.g. `role:小生`, `status:二太太`. */
  publicTags?: CharacterTag[];
  attributes: CharacterAttributes;
  gallery: CharacterDerivativeGallery;
  survival: SurvivalStatus;
  /**
   * On-chain subscriber count for this character. Gates runner's POV
   * worker (no subscribers → no chapter generated). Optional because
   * mock fixtures pre-date the field; renderers should treat
   * undefined as 0.
   */
  subscriberCount?: number;
  /**
   * Sui object id of the current Scene this character is in (chain:
   * `Character.state.current_scene_id`). `null` for wild characters
   * (between sagas). Used by EventPanel to gate `deal_participant_hand`
   * by scene match, and by dossier header to surface where they are.
   */
  currentSceneId?: string | null;
  createdAt: string;
}
