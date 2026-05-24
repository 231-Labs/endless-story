import type { InterventionKind, OwnerIntervention } from '@endless-story/shared';
import { interventions, listInterventionsForCharacter } from '@/mocks/interventions';
import { USE_MOCK } from './config';
import { httpGet, httpPost } from './http';

/**
 * Interventions API（owner 寄夢 / 耳語）
 *
 * 後端對應 endpoints：
 *   GET   /interventions?characterId={id}                  → OwnerIntervention[]
 *   POST  /interventions                                   → OwnerIntervention  body: { characterId, ownerWallet, kind, text }
 *
 * 後端應該：
 *   - 寫入時驗證 ownerWallet 是該 character.nftOwner
 *   - 內容 Seal 加密、看客視角只看到「夢/語 · 已感應」、看不到 body
 *   - 角色下次 perceive 時把 dream 投影進 perception bundle
 *   - acknowledgedAt 由 saga server 在角色採納 / 拒絕後寫
 */

export async function listInterventions(characterId: string): Promise<OwnerIntervention[]> {
  if (USE_MOCK) return listInterventionsForCharacter(characterId);
  return httpGet<OwnerIntervention[]>('/interventions', { query: { characterId } });
}

export async function submitIntervention(input: {
  characterId: string;
  ownerWallet: string;
  kind: InterventionKind;
  text: string;
}): Promise<OwnerIntervention> {
  if (USE_MOCK) {
    const created: OwnerIntervention = {
      id: `intv_${Date.now()}`,
      characterId: input.characterId,
      ownerWallet: input.ownerWallet,
      kind: input.kind,
      text: input.text,
      createdAt: new Date().toISOString(),
    };
    interventions.unshift(created);
    return created;
  }
  return httpPost<OwnerIntervention>('/interventions', input);
}
