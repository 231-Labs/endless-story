import type { CharacterPersona } from '@endless-story/shared';
import { getPersonaByCharacter } from '@/mocks/personas';
import { USE_MOCK } from './config';
import { isSuiObjectId } from '@/lib/chain/character-read';
import { fetchOnChainPersona } from '@/lib/chain/persona-read';

/**
 * Personas API (persona card — semi-permanent personality blueprint).
 *
 * Chain-first: a real on-chain character (Sui object id) reads its persona from the content road
 * (Walrus blob + `commitment::commit`, see `lib/chain/persona-read`). A real character with no
 * persona anchored yet → null (SoulSection hides). Demo slugs fall back to the static mock.
 * Persona is generated + anchored at mint (`generate-persona` from redeemVoucher's `after()`).
 */
export async function getPersona(characterId: string): Promise<CharacterPersona | null> {
  if (isSuiObjectId(characterId)) {
    return (await fetchOnChainPersona(characterId)) ?? null;
  }
  return USE_MOCK ? getPersonaByCharacter(characterId) ?? null : null;
}
