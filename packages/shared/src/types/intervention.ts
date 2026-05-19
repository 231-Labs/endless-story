import type { Wallet } from './common';

export type InterventionKind = 'whisper' | 'inject_dream';

export interface OwnerIntervention {
  id: string;
  characterId: string;
  ownerWallet: Wallet;
  kind: InterventionKind;
  text: string;
  createdAt: string;
  acknowledgedAt?: string;
}
