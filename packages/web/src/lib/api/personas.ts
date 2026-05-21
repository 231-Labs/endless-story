import type { CharacterPersona } from '@endless-story/shared';
import { getPersonaByCharacter } from '@/mocks/personas';

export async function getPersona(characterId: string): Promise<CharacterPersona | null> {
  return getPersonaByCharacter(characterId) ?? null;
}
