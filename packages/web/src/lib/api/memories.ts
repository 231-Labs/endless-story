import type { CharacterMemory } from '@endless-story/shared';
import { listMemoriesByCharacter } from '@/mocks/memories';
import { getCharacter } from './characters';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Memories API（owner-only journal）
 *
 * 後端對應 endpoints：
 *   GET  /memories?characterId={id}&viewer={wallet}   → CharacterMemory[]
 *
 * 後端應該：
 *   - 在 endpoint 內 verify viewer === character.nftOwner，非 owner 回空陣列
 *   - 真實 backend memory store 是 8 種 type（不只 UI 展示的 3-5 種）
 *   - 看客視角永遠拿不到 — Seal 加密 + endpoint gate 雙保險
 */

export async function listMemories(
  characterId: string,
  viewerWallet: string | null
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
