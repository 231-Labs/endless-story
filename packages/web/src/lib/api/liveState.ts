import type { CharacterLiveState } from '@endless-story/shared';
import { liveStatesByCharacterId } from '@/mocks/liveStates';
import { getCharacter } from './characters';
import { getScene } from './scenes';
import { USE_MOCK } from './config';
import { httpGet } from './http';
import { isMemoryConfigured, recallCurrentPlanText } from '@/lib/chain/memory';

/**
 * Live State API（角色當下狀態）
 *
 * Three fields, all now real when the world is running:
 *   - location  ← chain `Character.state.current_scene_id` → Scene name
 *   - intent    ← the character's CURRENT PLAN「眼下打算」(N6, MemWal)
 *   - nextPlan  ← the character's CURRENT PLAN「長期目標」(N6, MemWal)
 *
 * The plan is written each tick by the PLAN step (runPlanAction) and recalled
 * here, so the dossier header「此刻心境 / 將往何方」reflects what she's actually
 * striving for, not a placeholder. Falls back to the old placeholders when
 * MemWal isn't configured or the character has no plan yet.
 *
 * Note: this surfaces the plan's goal/intent publicly (the live-state bar is
 * not owner-gated). The plan body itself stays SEAL-encrypted; this is just
 * the one-line outward intent. Owner-gate here if you'd rather keep goals
 * hidden from non-owners.
 */

/** Pull「眼下打算」+「長期目標」out of the stored plan text (formatPlanText). */
function parsePlanFields(planText: string): {
  longTermGoal?: string;
  dailyPlanHint?: string;
} {
  const lt = planText.match(/\[長期目標\]\s*(.+)/);
  const dp = planText.match(/\[眼下打算\]\s*(.+)/);
  return {
    longTermGoal: lt?.[1]?.trim() || undefined,
    dailyPlanHint: dp?.[1]?.trim() || undefined,
  };
}

export async function getLiveState(characterId: string): Promise<CharacterLiveState> {
  // Look up the character — try the facade (chain-first, mock fallback)
  // so we always get a Character shape with `currentSceneId` if the
  // chain mapper populated it.
  const character = await getCharacter(characterId).catch(() => null);

  // Resolve the on-chain Scene name when we have a real scene id.
  let locationLabel = '後台 · 夜色未散';
  if (character?.currentSceneId) {
    const scene = await getScene(character.currentSceneId).catch(() => null);
    locationLabel = scene?.name ?? '未知場景';
  }

  // N6: intent + nextPlan from the character's CURRENT plan (real MemWal).
  let planIntent: string | undefined;
  let planNext: string | undefined;
  if (isMemoryConfigured()) {
    const planText = await recallCurrentPlanText(characterId).catch(() => null);
    if (planText) {
      const f = parsePlanFields(planText);
      planIntent = f.dailyPlanHint; // 此刻心境 = 眼下打算
      planNext = f.longTermGoal; //   將往何方 = 長期目標
    }
  }

  if (USE_MOCK) {
    const direct = liveStatesByCharacterId[characterId];
    const base: CharacterLiveState = direct
      ? { ...direct }
      : character
        ? {
            intent: `整理下一場${character.role}身段，等班主點名。`,
            location: locationLabel,
            nextPlan: '先把今日記憶寫下，等下一章回引用。',
          }
        : { intent: '靜默。', location: '無蹤', nextPlan: '待章回引用。' };
    return {
      intent: planIntent ?? base.intent,
      location: character || direct ? locationLabel : base.location,
      nextPlan: planNext ?? base.nextPlan,
    };
  }

  const remote = await httpGet<CharacterLiveState>(
    `/characters/${characterId}/live-state`,
  ).catch(() => null);
  return {
    intent: planIntent ?? remote?.intent ?? '—',
    location: locationLabel,
    nextPlan: planNext ?? remote?.nextPlan ?? '—',
  };
}
