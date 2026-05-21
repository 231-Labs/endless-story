import type { CharacterMemory } from '@endless-story/shared';
import { listMemoriesByCharacter } from '@/mocks/memories';
import { getCharacter } from './characters';

/**
 * Owner-only journal. 看客直接拿到空陣列 — Seal 加密層在實際接通前先用 facade gate。
 */
export async function listMemories(
  characterId: string,
  viewerWallet: string | null
): Promise<CharacterMemory[]> {
  if (!viewerWallet) return [];
  const character = await getCharacter(characterId);
  if (!character) return [];
  if (character.nftOwner !== viewerWallet) return [];
  return listMemoriesByCharacter(characterId);
}
