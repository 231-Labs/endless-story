'use server';

import { revalidatePath } from 'next/cache';
import type { InterventionKind } from '@endless-story/shared';
import { interventionsApi } from '@/lib/api/index';

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
    revalidatePath('/dossier');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '寄出失敗。',
    };
  }
}
