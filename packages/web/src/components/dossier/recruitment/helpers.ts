import type { Recruitment } from '@endless-story/shared';
import type { CharacterCandidate, RolledAttribute } from '@endless-story/llm/prompts';

export type Stage = 'closed' | 'minting' | 'rejected' | 'prompt' | 'generating' | 'pick' | 'done';

export const ATTR_LABEL: Record<string, string> = {
  appearance: '外貌',
  constitution: '筋骨',
  acuity: '機敏',
  disposition: '心性',
};

export const GENDER_LABEL: Record<string, string> = {
  male: '男性',
  female: '女性',
  other: '不限性別',
};

export const STEPS: { key: Exclude<Stage, 'closed' | 'rejected'>; label: string }[] = [
  { key: 'minting', label: '擲牌' },
  { key: 'prompt', label: '描述' },
  { key: 'generating', label: '凝形' },
  { key: 'pick', label: '揭曉' },
  { key: 'done', label: '入班' },
];

export const VOUCHER_TTL_MS = 24n * 60n * 60n * 1000n;
export { ENDLESS_DECIMALS } from '@endless-story/shared';

/**
 * Off-chain `Recruitment.genderRequirement` uses English (`male`/`female`/`other`)
 * but the on-chain `Character.profile.physical_facts.gender` is whatever the
 * LLM emits — currently a Chinese label (male/female/neutral, see
 * `packages/llm/src/prompts/character.ts`). VoucherRequirements does an exact
 * string match on redeem, so we have to convert here.
 *
 * **`'other'` semantics**: the seed data + admin form + display cards have
 * always used `'other'` (and `undefined`) interchangeably to mean "any
 * gender". So the chain-side requirement for `'other'` is an *empty* allow
 * list (no check), NOT the literal "neutral" character gender. If we ever
 * want to enforce non-binary specifically, that needs a new requirement
 * value distinct from `'other'`.
 */
export const GENDER_CHAIN: Record<'male' | 'female', string> = {
  male: '男',
  female: '女',
};

/** True when the recruitment imposes no gender filter (`undefined` or 'other'). */
export function isGenderUnrestricted(g: Recruitment['genderRequirement']): boolean {
  return g === undefined || g === 'other';
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build the parallel-vector inputs the contract's `new_voucher_requirements`
 * expects, from a Recruitment's `genderRequirement` + `minAttributes`.
 */
export function recruitmentRequirements(recruitment: Recruitment): {
  allowedGenders: string[];
  requiredAttributeKeys: string[];
  requiredAttributeMins: bigint[];
} {
  const allowedGenders = isGenderUnrestricted(recruitment.genderRequirement)
    ? []
    : [GENDER_CHAIN[recruitment.genderRequirement as 'male' | 'female']];
  const requiredAttributeKeys: string[] = [];
  const requiredAttributeMins: bigint[] = [];
  if (recruitment.minAttributes) {
    for (const [key, min] of Object.entries(recruitment.minAttributes)) {
      if (typeof min === 'number') {
        requiredAttributeKeys.push(key);
        requiredAttributeMins.push(BigInt(min));
      }
    }
  }
  return { allowedGenders, requiredAttributeKeys, requiredAttributeMins };
}

/**
 * Mirrors the contract's `check_voucher_requirements` so the wizard can warn
 * the user *before* paying for the portrait / redeem if the rolled candidate
 * won't satisfy the recruitment. Chain still enforces — this is UX only.
 */
export function candidateMeetsRequirements(
  recruitment: Recruitment,
  candidate: CharacterCandidate | null,
  rolledValues: RolledAttribute[],
): { ok: true } | { ok: false; reason: string } {
  if (candidate && !isGenderUnrestricted(recruitment.genderRequirement)) {
    const wanted = GENDER_CHAIN[recruitment.genderRequirement as 'male' | 'female'];
    if (candidate.physicalFacts.gender !== wanted) {
      return { ok: false, reason: `性別要求：${wanted}，擲出：${candidate.physicalFacts.gender}` };
    }
  }
  if (recruitment.minAttributes) {
    for (const [key, min] of Object.entries(recruitment.minAttributes)) {
      if (typeof min !== 'number') continue;
      const got = rolledValues.find((r) => r.key === key)?.value ?? 0;
      if (got < min) {
        const label = ATTR_LABEL[key] ?? key;
        return { ok: false, reason: `${label} 須 ≥ ${min}，擲出：${got}` };
      }
    }
  }
  return { ok: true };
}

export function stepKeyForStage(stage: Stage): Exclude<Stage, 'closed' | 'rejected'> {
  if (stage === 'rejected') return 'minting';
  return stage as Exclude<Stage, 'closed' | 'rejected'>;
}

export function daysLeft(expiresAt: string): number {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  return Math.max(0, Math.floor((exp - now) / (1000 * 60 * 60 * 24)));
}
