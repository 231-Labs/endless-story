import type { CharacterAppearance } from '@endless-story/shared';
import { isSuiObjectId } from '@/lib/chain/character-read';
import { fetchOnChainAppearance } from '@/lib/chain/appearance-read';

/**
 * Appearance API (形貌 — the distilled, evolving look description).
 *
 * Chain-first: a real on-chain character (Sui object id) reads its 形貌 from the
 * content road (Walrus blob + `commitment::commit`, see `lib/chain/appearance-read`).
 * A real character with no 形貌 anchored yet → null (the 形貌 caption falls back to
 * the structured facts line). Demo slugs have no anchored 形貌 → null (their
 * `physicalFacts` mock string already reads as prose). Generated + anchored at mint
 * (`generate-appearance` from redeemVoucher's `after()`).
 */
export async function getAppearance(characterId: string): Promise<CharacterAppearance | null> {
  if (isSuiObjectId(characterId)) {
    return (await fetchOnChainAppearance(characterId)) ?? null;
  }
  return null;
}
