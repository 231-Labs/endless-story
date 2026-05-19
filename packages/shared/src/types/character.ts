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
  createdAt: string;
}
