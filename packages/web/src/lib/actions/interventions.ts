'use server';

import { revalidatePath } from 'next/cache';
import type { InterventionKind } from '@endless-story/shared';
import { interventionsApi } from '@/lib/api/index';

/**
 * Owner 寄夢 / 耳語 server action — Composer 用 form action 呼叫此函式。
 *
 * 後端對應：interventionsApi.submitIntervention (POST /interventions)
 *
 * 行為：
 *   1. 驗 ownerWallet 是該 character.nftOwner（後端 endpoint 內也要驗）
 *   2. 寫入 mock / 真實後端
 *   3. revalidatePath('/dossier') — owner 視角下「過往」區會立即出現
 *
 * 失敗模式：
 *   - 缺欄位 → return { error }
 *   - 非 owner → 後端會拒、UI 顯示「無權」訊息
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
