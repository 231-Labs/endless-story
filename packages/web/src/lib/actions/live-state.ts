'use server';

import { liveStateApi } from '@/lib/api/index';

/** 人物誌「此刻心境」— 來自 MemWal CURRENT PLAN 的 [眼下打算]。 */
export async function getCharacterLiveIntent(characterId: string): Promise<string | null> {
  try {
    const state = await liveStateApi.getLiveState(characterId, { withPlan: true });
    const intent = state.intent?.trim();
    if (!intent || intent === '—' || intent === '無') return null;
    return intent;
  } catch (err) {
    console.warn('[live-state] getCharacterLiveIntent failed:', err);
    return null;
  }
}
