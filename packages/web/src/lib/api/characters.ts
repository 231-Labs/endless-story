import type { Character } from '@endless-story/shared';
import { characters, getCharacterById, listCharactersBySaga } from '@/mocks/characters.js';

export async function listCharacters(): Promise<Character[]> {
  return characters;
}

export async function getCharacter(id: string): Promise<Character | null> {
  return getCharacterById(id) ?? null;
}

export async function listSagaCharacters(sagaId: string): Promise<Character[]> {
  return listCharactersBySaga(sagaId);
}

export async function listOwnedCharacters(wallet: string): Promise<Character[]> {
  return characters.filter((c) => c.nftOwner === wallet);
}
