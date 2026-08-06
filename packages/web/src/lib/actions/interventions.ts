'use server';

import { revalidatePath } from 'next/cache';
import type { InterventionKind } from '@endless-story/shared';
import { interventionsApi } from '@/lib/api/index';
import { enqueueWakeStimulus } from '@/lib/chain/wake-store';

/**
 * Owner send-dream / whisper server action — called by the Composer form action.
 *
 * Backend: interventionsApi.submitIntervention (POST /interventions)
 *
 * Behaviour:
 *   1. verify ownerWallet is the character.nftOwner (backend endpoint also verifies)
 *   2. write to mock / real backend
 *   3. revalidatePath('/dossier') — the owner-view "past" section shows it immediately
 *
 * Failure modes:
 *   - missing fields → return { error }
 *   - non-owner → backend rejects, UI shows a "no permission" message
 */
export interface InterventionFormResult {
  ok: boolean;
  error?: string;
}

export async function submitInterventionAction(
  _prev: InterventionFormResult,
  formData: FormData
): Promise<InterventionFormResult> {
  const characterId = formData.get('characterId');
  const ownerWallet = formData.get('ownerWallet');
  const kind = formData.get('kind');
  const text = formData.get('text');

  if (
    typeof characterId !== 'string' ||
    typeof ownerWallet !== 'string' ||
    (kind !== 'inject_dream' && kind !== 'whisper') ||
    typeof text !== 'string' ||
    !text.trim()
  ) {
    return { ok: false, error: '欄位不全。' };
  }

  try {
    await interventionsApi.submitIntervention({
      characterId,
      ownerWallet,
      kind: kind as InterventionKind,
      text: text.trim(),
    });
    // 東家留言 → 喚醒層的一則捎話（AGENT_WAKE_LAYER.md 附錄 C4）：「下一個 tick
    // 才會聽見」自此變成「幾分鐘內」。**注夢刻意不映射**——夢的本義是深宵入枕
    // （dream.ts 自有通道與時序），即時喚醒違背夢的設計。
    // 入佇列失手不影響留言本身：留言已經寄到，那一句最遲仍會在下一個大拍被聽見。
    if (kind === 'whisper') {
      try {
        enqueueWakeStimulus({ characterId, kind: 'note', text: text.trim() });
      } catch (e) {
        console.warn('[interventions] wake enqueue failed:', e instanceof Error ? e.message : e);
      }
    }
    revalidatePath('/dossier');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '寄出失敗。',
    };
  }
}
