import type { CharacterLiveState } from '@endless-story/shared';
import { liveStatesByCharacterId } from '@/mocks/liveStates';
import { getCharacter } from './characters';

/**
 * 取得角色當下狀態（intent / location / nextPlan）。
 *
 * Backend 接通後改成 fetch runner perception endpoint，UI 不動。
 * 找不到 character 或無 mock → 回 fallback。
 */
export async function getLiveState(characterId: string): Promise<CharacterLiveState> {
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
