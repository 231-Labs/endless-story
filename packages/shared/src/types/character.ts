import type { BlobRef, CharacterRole, Wallet } from './common';

export type SurvivalLevel = 'critical' | 'low' | 'stable' | 'healthy';

export type Gender = 'female' | 'male' | 'other';

export interface SurvivalStatus {
  funds: number;
  dailyCost: number;
  salary: number;
  daysLeft: number;
  level: SurvivalLevel;
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

export interface Character {
  id: string;
  nftOwner: Wallet;
  sagaId: string | null;
  name: string;
  description: string;
  role: CharacterRole;
  gender: Gender;
  age: number;
  physicalFacts: string;
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
