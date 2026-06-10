import type { CharacterMemory } from '@endless-story/shared';
import { listMemoriesByCharacter } from '@/mocks/memories';
import { getCharacter } from './characters';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Memories API（owner-only journal）— mock / http fallback ONLY.
 *
 * The real (MemWal-configured) path no longer goes through here: it was a
 * server-side SEAL decrypt gated by a spoofable `viewerWallet` string (the
 * `?as=` URL param, defaulting to a demo owner), which let anyone — wallet
 * or not — read any character's decrypted memories. Real memories now flow
 * through `/api/memories/encrypted` (ciphertext only) and are decrypted in
 * the browser with the viewer's wallet + OwnerCap
 * (`MemoriesTabClient` → `decryptWithOwnerCap` → `seal_approve_owner`),
 * so holding the cap is what unlocks the plaintext.
 *
 * The mock gate below still string-compares `viewerWallet` — acceptable
 * only because mock memories are demo fixtures, not private data.
 */
export async function listMemories(
  characterId: string,
  viewerWallet: string | null,
): Promise<CharacterMemory[]> {
  if (!viewerWallet) return [];

  if (USE_MOCK) {
    const character = await getCharacter(characterId);
    if (!character) return [];
    if (character.nftOwner !== viewerWallet) return [];
    return listMemoriesByCharacter(characterId);
  }

  return httpGet<CharacterMemory[]>('/memories', {
    query: { characterId, viewer: viewerWallet },
  });
}
