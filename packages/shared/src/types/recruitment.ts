import type { CharacterRole } from './common';
import type { CharacterAttributes, Gender } from './character';

export type RecruitmentMembership = 'internal' | 'external';

export interface Recruitment {
  id: string;
  sagaId: string;
  sagaName: string;
  specialty: CharacterRole | string;
  roleIntent: string;
  membership: RecruitmentMembership;
  slots: number;
  basePrice: number; // ENDLESS — single-roll price
  // Guaranteed-threshold price (re-rolls until the four attributes pass). Falls back
  // to basePrice when unset; usually higher, as a "guaranteed" premium.
  bulkPrice?: number;
  expiresAt: string; // ISO date
  createdAt: string;
  minAttributes?: Partial<CharacterAttributes>;
  // Most roles are gender-open; only set this for the few that require one.
  genderRequirement?: Gender;
}
