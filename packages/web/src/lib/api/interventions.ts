import type { InterventionKind, OwnerIntervention } from '@endless-story/shared';
import { interventions, listInterventionsForCharacter } from '@/mocks/interventions.js';

export async function listInterventions(characterId: string): Promise<OwnerIntervention[]> {
  return listInterventionsForCharacter(characterId);
}

export async function submitIntervention(input: {
  characterId: string;
  ownerWallet: string;
  kind: InterventionKind;
  text: string;
}): Promise<OwnerIntervention> {
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
