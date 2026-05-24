import type { SoulSong } from '@endless-story/shared';
import { listSoulSongsForCharacter } from '@/mocks/soulSongs';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Soul Songs API（角色心曲）
 *
 * 後端對應 endpoints：
 *   GET  /soul-songs?characterId={id}    → SoulSong[]
 *
 * 後端應該：
 *   - 心曲池由 LLM 在 saga arc / 情緒事件後生成
 *   - revealed 狀態（解鎖了哪幾首）由前端 localStorage 維護、未來可上鏈
 *   - 7 日 cooldown 是 client-side 限制
 */

export async function listSoulSongs(characterId: string): Promise<SoulSong[]> {
  if (USE_MOCK) return listSoulSongsForCharacter(characterId);
  return httpGet<SoulSong[]>('/soul-songs', { query: { characterId } });
}
