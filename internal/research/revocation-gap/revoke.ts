/**
 * C0 / C7 revocation operators.
 *
 * C0 — ledger + lease only (cryptographic / institutional revoke).
 * C7 — C0 + physical key + social dwelling fields + memory invalidation notes.
 *
 * Physical residual closure: **換鎖** — rewrite the carried key's `keyFor` so it
 * no longer names S (object remains; lock binding is broken). Chosen over object
 * deletion because the engine's eviction language is 換鎖, and an inert bearer
 * token is the realistic residual shape after a rekey.
 */

import type { LocalRecall } from '../../../packages/engine/src/adapters/local/local-recall.ts';
import type { WorldState } from '../../../packages/engine/src/world-state.ts';
import { IDS, NAMES, type ConditionId } from './ids.ts';

export interface RevokeResult {
  condition: ConditionId;
  canEnterAfter: boolean;
  keyForAfter: string | undefined;
  homeByCharAfter: string | undefined;
  leaseAfter: unknown;
  memoryNotesWritten: number;
}

/** C0: correct ledger revoke + lease termination. Leaves key, homeByChar, memory. */
export function applyC0(world: WorldState): void {
  world.revokeAccess(IDS.rental, IDS.tenant);
  if (world.data.leases) delete world.data.leases[IDS.rental];
}

/**
 * Clear structured social records that mark T as dwelling at S.
 * Inventory (also documented in README):
 *   - homeByChar[T]
 *   - leases[S] (already cleared in C0)
 *   - relationshipView prose on O/T/N that declares the tenancy
 */
export function clearSocialDwellingRecords(world: WorldState): void {
  // Re-home the tenant to the public street — removes 「T lives at S」 from the
  // night-anchor map. We do NOT invent a new private home.
  world.data.homeByChar[IDS.tenant] = IDS.street;

  const dwellingMarkers = [NAMES.rental, '租住', '住處', '廂房'];
  for (const m of world.data.cast) {
    for (const [peerId, view] of Object.entries(m.relationshipView)) {
      if (typeof view !== 'string') continue;
      const aboutTenant =
        m.id === IDS.tenant || peerId === IDS.tenant || m.id === IDS.owner || m.id === IDS.neighbor;
      if (!aboutTenant) continue;
      if (!dwellingMarkers.some((marker) => view.includes(marker))) continue;
      // Replace with an explicit post-revocation social fact (structured field still
      // holds a string, but no longer asserts current dwelling rights).
      if (m.id === IDS.tenant && peerId === IDS.owner) {
        m.relationshipView[peerId] = `先前向「${NAMES.owner}」租住「${NAMES.rental}」，現已遷出，不再是住戶。`;
      } else if (m.id === IDS.owner && peerId === IDS.tenant) {
        m.relationshipView[peerId] = `先前的租客；「${NAMES.rental}」租約已終，不再是住戶。`;
      } else if (m.id === IDS.neighbor && peerId === IDS.tenant) {
        m.relationshipView[peerId] = `先前住在「${NAMES.rental}」；現已遷出。`;
      } else if (m.id === IDS.tenant && peerId === IDS.neighbor) {
        m.relationshipView[peerId] = `「${NAMES.neighbor}」仍是相識；我已不住「${NAMES.rental}」。`;
      }
    }
  }

  if (world.data.cast.find((c) => c.id === IDS.tenant)?.plan?.includes(NAMES.rental)) {
    const t = world.data.cast.find((c) => c.id === IDS.tenant)!;
    t.plan = '另覓住處，不再把廂房當作自家。';
  }
}

/** 換鎖: break keyFor binding on T's carried key (and any other keyFor===S objects). */
export function rekeyPhysicalLocks(world: WorldState): void {
  for (const obj of world.data.objects ?? []) {
    if (obj.keyFor === IDS.rental) {
      // Inert token: still portable, no longer names S.
      obj.keyFor = undefined;
      obj.state = `${NAMES.rental}的舊鑰，鎖已換過，打不開了`;
      obj.label = obj.label.includes('舊') ? obj.label : `舊·${obj.label}`;
    }
  }
}

const INVALIDATION_NOTE =
  `〔權威失效〕${NAMES.tenant}已於撤銷當日遷出「${NAMES.rental}」，不再持有出入之權；` +
  `舊契、舊鑰、舊識均不得再當作有效授權。`;

/** Append-only authoritative invalidation notes for T, O, N. */
export async function appendInvalidationMemories(
  recall: LocalRecall,
  day: number,
): Promise<number> {
  let n = 0;
  for (const charId of [IDS.tenant, IDS.owner, IDS.neighbor]) {
    await recall.remember(charId, INVALIDATION_NOTE, {
      kind: 'observation',
      importance: 9,
      day,
    });
    n += 1;
  }
  return n;
}

export async function applyCondition(
  world: WorldState,
  condition: ConditionId,
  recall: LocalRecall,
): Promise<RevokeResult> {
  applyC0(world);

  let memoryNotesWritten = 0;
  if (condition === 'C7') {
    rekeyPhysicalLocks(world);
    clearSocialDwellingRecords(world);
    memoryNotesWritten = await appendInvalidationMemories(recall, world.data.clock.day);
  }

  const canEnterAfter = world.canEnter(IDS.tenant, IDS.rental);
  if (canEnterAfter) {
    throw new Error(`[revocation-gap] ${condition}: canEnter(T,S) must be false after revoke`);
  }

  const key = world.objectById(IDS.key);
  return {
    condition,
    canEnterAfter,
    keyForAfter: key?.keyFor,
    homeByCharAfter: world.data.homeByChar[IDS.tenant],
    leaseAfter: world.data.leases?.[IDS.rental],
    memoryNotesWritten,
  };
}
