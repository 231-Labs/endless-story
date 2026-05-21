import type { SoulSong } from '@endless-story/shared';
import { listSoulSongsForCharacter } from '@/mocks/soulSongs';

export async function listSoulSongs(characterId: string): Promise<SoulSong[]> {
  return listSoulSongsForCharacter(characterId);
}
