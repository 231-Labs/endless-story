import type { Character, CharacterMagnetism } from '@endless-story/shared';
import { characters, getCharacterById, listCharactersBySaga } from '@/mocks/characters';
import { magnetismByCharacterId } from '@/mocks/magnetism';
import { USE_MOCK } from './config';
import { httpGet } from './http';
import { fetchOnChainCharacter, isSuiObjectId } from '@/lib/chain/character-read';

/**
 * Characters API
 *
 * 後端對應 endpoints（NEXT_PUBLIC_DATA_SOURCE=api 時走這條）：
 *
 *   GET  /characters                       → Character[]
 *   GET  /characters/{id}                  → Character | 404
 *   GET  /characters?sagaId={id}           → Character[]
 *   GET  /characters?ownedBy={wallet}      → Character[]
 *   GET  /characters/{id}/magnetism        → CharacterMagnetism
 *
 * Phase 2.6d: getCharacter additionally tries on-chain read for ids that
 * look like Sui object ids — so freshly minted characters (from the
 * wizard) render at /dossier?id=0x... without backend hops.
 */

export async function listCharacters(): Promise<Character[]> {
  if (USE_MOCK) return characters;
  return httpGet<Character[]>('/characters');
}

export async function getCharacter(id: string): Promise<Character | null> {
  // 1. If it's a Sui object id, prefer the live chain read.
  if (isSuiObjectId(id)) {
    const onChain = await fetchOnChainCharacter(id);
    if (onChain) return onChain;
    // Fall through — mock lookup will return null too, but staying graceful.
  }
  // 2. Demo / static id → mock or http.
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
