/**
 * Skill layer — the in-harness simulation of the on-chain per-saga skill system
 * (SagaSkillsKey DOF: named 0..100 scores). Here they're plain numbers; chain
 * wiring (port the old-repo set_character_skill PTB) is gate-after.
 *
 * Two jobs, exactly as planned:
 *   - GATE   "who can author what" (need craft skill >= threshold, OR an
 *            emergent emotional override — 有感而發 doesn't need a licence).
 *   - DIAL   "how good the output is" (a quality band fed into the prompt).
 */

import type { TroupeMember } from './types.ts';

/**
 * Skill keys, ALIGNED to main's on-chain saga-skills keys (English key, 中文 label)
 * so the harness reads `character_skills_for_saga` by the same names when wired.
 *   craft (production-engine axis): playwriting/composing/lyricism — NOT in card rules.
 *   perf  (main's event-card axis): vocal/movement/literati/martial — read for casting.
 * Property names stay 中文 so role code reads `CRAFT.編劇`; values are the canonical keys.
 */
export const CRAFT = {
  編劇: 'playwriting',
  作曲: 'composing',
  填詞: 'lyricism',
  唱腔: 'vocal',
  身段: 'movement',
  文墨: 'literati',
  武場: 'martial',
} as const;

export function skill(member: TroupeMember, key: string): number {
  return member.skills.find((s) => s.key === key)?.value ?? 0;
}

/** Can this member author work gated by `key`? */
export function canCraft(member: TroupeMember, key: string, threshold = 50): boolean {
  return skill(member, key) >= threshold;
}

/** Pick the most skilled member for a craft (gated); null if nobody qualifies. */
export function bestFor(troupe: TroupeMember[], key: string, threshold = 50): TroupeMember | null {
  const eligible = troupe
    .filter((m) => skill(m, key) >= threshold)
    .sort((a, b) => skill(b, key) - skill(a, key));
  return eligible[0] ?? null;
}

/** Quality band fed into the craft prompt / shown in the artifact header. */
export function qualityBand(value: number): '拙' | '通' | '精' | '絕' {
  if (value >= 90) return '絕';
  if (value >= 75) return '精';
  if (value >= 55) return '通';
  return '拙';
}

/**
 * Emotional override for emergent craft: a strong relationship/memory can move a
 * character to create even below the craft threshold (the 花旦 who writes a poem
 * "有感而發", not because she's the assigned 詞作者). Returns whether she's moved.
 */
export function movedToCreate(member: TroupeMember, craftKey: string): boolean {
  const peakBond = Math.max(0, ...member.relationships.map((r) => r.intensity));
  const competence = skill(member, craftKey);
  // moved if either she's competent, or the bond is strong enough to spill over.
  return competence >= 50 || peakBond >= 75;
}
