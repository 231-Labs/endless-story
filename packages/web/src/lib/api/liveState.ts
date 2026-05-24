import type { CharacterLiveState } from '@endless-story/shared';
import { liveStatesByCharacterId } from '@/mocks/liveStates';
import { getCharacter } from './characters';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Live State API（角色當下狀態）
 *
 * 後端對應 endpoints：
 *   GET  /characters/{id}/live-state     → CharacterLiveState
 *
 * 後端應該：
 *   - 每 tick 由 saga server runner 推送
 *   - intent / location / nextPlan 來自 character LLM 最後一次 perception output
 *   - 不在 character 表內快取 — 隨 tick 變動快、每次拉
 */

export async function getLiveState(characterId: string): Promise<CharacterLiveState> {
  if (USE_MOCK) {
    const direct = liveStatesByCharacterId[characterId];
    if (direct) return direct;
    const character = await getCharacter(characterId);
    if (!character) {
      return {
        intent: '靜默。',
        location: '無蹤',
        nextPlan: '待章回引用。',
      };
    }
    return {
      intent: `整理下一場${character.role}身段，等班主點名。`,
      location: '後台 · 夜色未散',
      nextPlan: '先把今日記憶寫下，等下一章回引用。',
    };
  }

  return httpGet<CharacterLiveState>(`/characters/${characterId}/live-state`);
}
