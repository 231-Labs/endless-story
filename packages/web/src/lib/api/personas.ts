import type { CharacterPersona } from '@endless-story/shared';
import { getPersonaByCharacter } from '@/mocks/personas';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Personas API（本色卡 — 半永久人格藍圖）
 *
 * 後端對應 endpoints：
 *   GET  /characters/{id}/persona        → CharacterPersona | 404
 *
 * 後端應該：
 *   - persona 由 saga server 在角色首次成卷時 LLM 生成
 *   - 累積 reflections / saga arc 結束時偶發重蒸（version++）
 *   - lastRegenChapterId 紀錄觸發此版的章回
 */

export async function getPersona(characterId: string): Promise<CharacterPersona | null> {
  if (USE_MOCK) return getPersonaByCharacter(characterId) ?? null;
  try {
    return await httpGet<CharacterPersona>(`/characters/${characterId}/persona`);
  } catch {
    return null;
  }
}
