/** Stable ids for the revocation-gap pilot seed. */
export const IDS = {
  owner: 'O',
  tenant: 'T',
  neighbor: 'N',
  street: 'P',
  rental: 'S',
  ownerHome: 'H',
  key: 'key-S',
} as const;

export const NAMES = {
  owner: '屋主',
  tenant: '租客',
  neighbor: '親人',
  street: '街口',
  rental: '廂房',
  ownerHome: '主宅',
} as const;

export type ConditionId = 'C0' | 'C7';

export const WARMUP_TICKS = 20;
export const MEASURE_TICKS = 20;
export const DEFAULT_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Social / dwelling fields that carry 「T 住在 S」 semantics (inventory for C7). */
export const SOCIAL_DWELLING_FIELDS = [
  'WorldStateData.homeByChar[T]',
  'WorldStateData.leases[S].tenantId',
  'CastMember.relationshipView[peer] prose that names T as S-dweller (seeded + cleared)',
  'WorldStateData.accessGrants[S].standing (cleared by C0 revokeAccess)',
  'WorldObject.keyFor === S carried by T (physical residual; closed in C7)',
] as const;
