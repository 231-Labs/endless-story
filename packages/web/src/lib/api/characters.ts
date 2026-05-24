import type { Character, CharacterMagnetism } from '@endless-story/shared';
import { characters, getCharacterById, listCharactersBySaga } from '@/mocks/characters';
import { magnetismByCharacterId } from '@/mocks/magnetism';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Characters API
 *
 * 後端對應 endpoints（NEXT_PUBLIC_DATA_SOURCE=api 時走這條）：
 *
 *   GET  /characters                       → Character[]
 *   GET  /characters/{id}                  → Character | 404
 *   GET  /characters?sagaId={id}           → Character[]   (saga 內含 castIds 對應的所有角色)
 *   GET  /characters?ownedBy={wallet}      → Character[]
 *   GET  /characters/{id}/magnetism        → CharacterMagnetism
 *
 * 後端應該：
 *   - Character.id：可以是 Sui object id（生產）或 mock id（demo）
 *   - listSagaCharacters 回傳 sagaId 屬於 saga 的成員（不含 wild）
 *   - listOwnedCharacters 用 wallet 對 Character.nftOwner 比對
 *   - magnetism subscriberCount 從訂閱表 count(*)、signatureQuote / nextPovHint 由 saga server LLM 算
 */

export async function listCharacters(): Promise<Character[]> {
  if (USE_MOCK) return characters;
  return httpGet<Character[]>('/characters');
}

export async function getCharacter(id: string): Promise<Character | null> {
  if (USE_MOCK) return getCharacterById(id) ?? null;
  try {
    return await httpGet<Character>(`/characters/${id}`);
  } catch {
    return null;
  }
}

export async function listSagaCharacters(sagaId: string): Promise<Character[]> {
  if (USE_MOCK) return listCharactersBySaga(sagaId);
  return httpGet<Character[]>('/characters', { query: { sagaId } });
}

export async function listOwnedCharacters(wallet: string): Promise<Character[]> {
  if (USE_MOCK) return characters.filter((c) => c.nftOwner === wallet);
  return httpGet<Character[]>('/characters', { query: { ownedBy: wallet } });
}

export async function getMagnetism(characterId: string): Promise<CharacterMagnetism | null> {
  if (USE_MOCK) return magnetismByCharacterId[characterId] ?? null;
  try {
    return await httpGet<CharacterMagnetism>(`/characters/${characterId}/magnetism`);
  } catch {
    return null;
  }
}
