import type { BlobRef, CharacterRole, Wallet } from './common.js';

export type SurvivalLevel = 'critical' | 'low' | 'stable' | 'healthy';

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

export interface Character {
  id: string;
  nftOwner: Wallet;
  sagaId: string | null;
  name: string;
  description: string;
  role: CharacterRole;
  physicalFacts: string;
  gallery: CharacterDerivativeGallery;
  survival: SurvivalStatus;
  createdAt: string;
}
