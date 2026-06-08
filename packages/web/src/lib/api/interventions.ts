import type { InterventionKind, OwnerIntervention } from '@endless-story/shared';
import { interventions, listInterventionsForCharacter } from '@/mocks/interventions';
import { USE_MOCK } from './config';
import { httpGet, httpPost } from './http';

/**
 * Interventions API (owner send-dream / whisper)
 *
 * Backend endpoints:
 *   GET   /interventions?characterId={id}                  → OwnerIntervention[]
 *   POST  /interventions                                   → OwnerIntervention  body: { characterId, ownerWallet, kind, text }
 *
 * Backend should:
 *   - on write, verify ownerWallet is the character.nftOwner
 *   - Seal-encrypt the content; onlookers see only "dream/word · sensed", not the body
 *   - project the dream into the perception bundle on the character's next perceive
 *   - acknowledgedAt is written by the saga server after the character accepts / rejects
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
