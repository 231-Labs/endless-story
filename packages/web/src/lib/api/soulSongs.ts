import type { SoulSong } from '@endless-story/shared';
import { listSoulSongsForCharacter } from '@/mocks/soulSongs';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Soul Songs API (character soul songs)
 *
 * Backend endpoints:
 *   GET  /soul-songs?characterId={id}    → SoulSong[]
 *
 * Backend should:
 *   - the song pool is LLM-generated after a saga arc / emotional event
 *   - revealed state (which songs are unlocked) is kept in client localStorage, may go on-chain later
 *   - the 7-day cooldown is a client-side limit
 */

export async function listSoulSongs(characterId: string): Promise<SoulSong[]> {
  if (USE_MOCK) return listSoulSongsForCharacter(characterId);
  return httpGet<SoulSong[]>('/soul-songs', { query: { characterId } });
}
