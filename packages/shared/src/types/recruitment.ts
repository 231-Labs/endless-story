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
  basePrice: number; // ENDLESS (世界貨幣) — 單抽價
  /**
   * 必應（包骰到符合四維門檻）的價格。未設則沿用 `basePrice`。通常設得比
   * `basePrice` 高，作為「保證達標」的溢價。
   */
  bulkPrice?: number;
  expiresAt: string; // ISO date
  createdAt: string;
  minAttributes?: Partial<CharacterAttributes>;
  /** 戲曲多半不限性別（乾旦坤生最迷人）。少數工種會限制：武生（男）、搬箱（男）、特定民國身分等。 */
  genderRequirement?: Gender;
}
