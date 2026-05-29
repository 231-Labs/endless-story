import type { CharacterLiveState } from '@endless-story/shared';
import { liveStatesByCharacterId } from '@/mocks/liveStates';
import { getCharacter } from './characters';
import { getScene } from './scenes';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Live State API（角色當下狀態）
 *
 * Until the runner's perception-loop ships, `intent` / `nextPlan` are
 * still placeholder strings (no LLM output to surface). What IS real
 * now: `location` — we resolve it from the chain `Character.state.
 * current_scene_id` → on-chain Scene name. That's the field EventPanel
 * needs cross-referencing for `deal_participant_hand`.
 *
 * Future (runner Phase 4):
 *   - intent / nextPlan come from character LLM perception output
 *   - delivered via `/characters/{id}/live-state` (httpGet branch)
 */

export async function getLiveState(characterId: string): Promise<CharacterLiveState> {
  // Look up the character — try the facade (chain-first, mock fallback)
  // so we always get a Character shape with `currentSceneId` if the
  // chain mapper populated it.
  const character = await getCharacter(characterId).catch(() => null);

  // Resolve the on-chain Scene name when we have a real scene id.
  // UI shows scene name only — object id stays internal (it's still
  // available via character.currentSceneId for facades that need it,
  // like EventPanel's scene-match gate).
  let locationLabel = '後台 · 夜色未散';
  if (character?.currentSceneId) {
    const scene = await getScene(character.currentSceneId).catch(() => null);
    locationLabel = scene?.name ?? '未知場景';
  }

  if (USE_MOCK) {
    const direct = liveStatesByCharacterId[characterId];
    if (direct) return { ...direct, location: locationLabel };
    if (!character) {
      return {
        intent: '靜默。',
        location: '無蹤',
        nextPlan: '待章回引用。',
      };
    }
    return {
      intent: `整理下一場${character.role}身段，等班主點名。`,
      location: locationLabel,
      nextPlan: '先把今日記憶寫下，等下一章回引用。',
    };
  }

  return httpGet<CharacterLiveState>(`/characters/${characterId}/live-state`);
}
