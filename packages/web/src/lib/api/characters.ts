import type { Character, CharacterMagnetism } from '@endless-story/shared';
import { characters, getCharacterById, listCharactersBySaga } from '@/mocks/characters';
import { magnetismByCharacterId } from '@/mocks/magnetism';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { USE_MOCK } from './config';
import { httpGet } from './http';
import {
  fetchOnChainCharacter,
  fetchOnChainCharacters,
  fetchOnChainCharactersByOwner,
  isSuiObjectId,
} from '@/lib/chain/character-read';

/**
 * Characters API
 *
 * Chain-first when the deployment is live (packageId set). Falls back to
 * mocks during local dev / before bootstrap. Magnetism / relationships
 * remain mock-only — they're off-chain enrichment, Phase 4 runner work.
 *
 * Backend HTTP endpoints (legacy, USE_MOCK=false path):
 *   GET  /characters[?sagaId=|ownedBy=]
 *   GET  /characters/{id}[/magnetism]
 */

function isDeployed(): boolean {
  return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}

export async function listCharacters(): Promise<Character[]> {
  // Chain query covers the deployed package's full minted set.
  if (isDeployed()) return fetchOnChainCharacters();
  if (USE_MOCK) return characters;
  return httpGet<Character[]>('/characters');
}

export async function getCharacter(id: string): Promise<Character | null> {
  // Sui object id → live chain read.
  if (isSuiObjectId(id)) {
    const onChain = await fetchOnChainCharacter(id);
    if (onChain) return onChain;
    // fall through if chain doesn't know it (might be a demo / burned id)
  }
  if (USE_MOCK) return getCharacterById(id) ?? null;
  try {
    return await httpGet<Character>(`/characters/${id}`);
  } catch {
    return null;
  }
}

export async function listSagaCharacters(sagaId: string): Promise<Character[]> {
  if (isDeployed()) {
    // sagaId here may be a chain saga object id OR a demo slug like
    // 'spring-snow'. For Phase 3 we only chain-filter by REAL saga ids
    // (since the chain event records the actual Saga object id, not a
    // human slug). Fall through to mock for demo slugs.
    if (isSuiObjectId(sagaId)) return fetchOnChainCharacters({ sagaId });
  }
  if (USE_MOCK) return listCharactersBySaga(sagaId);
  return httpGet<Character[]>('/characters', { query: { sagaId } });
}

export async function listOwnedCharacters(wallet: string): Promise<Character[]> {
  // Chain-first when caller passes a real Sui address.
  if (isSuiObjectId(wallet)) {
    return fetchOnChainCharactersByOwner(wallet);
  }
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
