/**
 * Offline skill derivation for the harness — reuses main's PURE, zero-dependency
 * derivation (`packages/web/src/lib/chain/saga-skills-core.ts`) directly, so the
 * harness and the chain agree on exactly one source of truth. (That file imports
 * nothing, so this cross-package path import is node-clean under tsx/node.)
 *
 * In production troupe reads `character_skills_for_saga` off-chain; here we derive
 * the same values from 行當 so the autonomy test isn't driven by hand-set fixtures.
 */

import { deriveAllSkills, type WorldAttrs } from '../../web/src/lib/chain/saga-skills-core.ts';
import type { Skill } from './types.ts';

const LABEL: Record<string, string> = {
  vocal: '唱腔',
  movement: '身段',
  stage_presence: '台緣',
  martial: '武場',
  literati: '文墨',
  networking: '交際',
  playwriting: '編劇',
  composing: '作曲',
  lyricism: '填詞',
};

/** Derive a character's full skill set (6 perf + 3 craft) from a 行當/應工 keyword. */
export function derivedSkills(role: string, world: WorldAttrs = {}): Skill[] {
  const all = deriveAllSkills(role, world);
  return Object.entries(all).map(([key, value]) => ({ key, label: LABEL[key] ?? key, value }));
}

export type { WorldAttrs };
