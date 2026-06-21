import type { Saga } from '@endless-story/shared';
import { getDemoSaga, sagas } from '@/mocks/sagas';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { USE_MOCK, isDeployed } from './config';
import { httpGet } from './http';
import { fetchOnChainSaga } from '@/lib/chain/saga-read';

/**
 * Sagas API — facade for the chain `saga` module + mock fallback.
 *
 * Chain-first when packageId set:
 *   - `getSaga(idOrSlug)` resolves slug (`spring-snow`) via contract-ids
 *     storyId, then fetches the on-chain Saga object.
 *
 * Mock-only for now:
 *   - `listSagas()` — needs a chain Saga registry walk; defer until
 *     bootstrap seeds more than one saga.
 *
 * `getCurrentSaga()` — chain-first via contract-ids.storyId. Returns
 * the on-chain Saga object so consumers (gazette, feed, etc.) get the
 * real Sui sagaId instead of the mock slug. Mock fallback only when
 * chain unreachable or no deployment.
 *
 * Backend HTTP endpoints (legacy, USE_MOCK=false path):
 *   GET  /sagas / /sagas/{id} / /sagas/current
 */

export async function listSagas(): Promise<Saga[]> {
  if (USE_MOCK) return sagas;
  return httpGet<Saga[]>('/sagas');
}

export async function getSaga(id: string): Promise<Saga | null> {
  if (isDeployed()) {
    // Chain path: handle both slug (spring-snow) and raw Sui id.
    const onChain = await fetchOnChainSaga(id);
    if (onChain) return onChain;
    // Fall through if slug doesn't match this deployment (rare, but
    // lets mock saga URLs still render during local dev).
  }
  if (USE_MOCK) return sagas.find((s) => s.id === id) ?? null;
  try {
    return await httpGet<Saga>(`/sagas/${id}`);
  } catch {
    return null;
  }
}

export async function getCurrentSaga(): Promise<Saga> {
  if (isDeployed()) {
    // Resolve via storyId slug → on-chain Saga. This is what `/feed`,
    // saga handscroll, etc. consume — they need the REAL chain
    // sagaId so subsequent event-log queries (gazette, POV) hit
    // matching events.
    const storyId = ENDLESS_STORY_DEPLOYMENT.storyId;
    if (storyId) {
      const onChain = await fetchOnChainSaga(storyId);
      if (onChain) return onChain;
    }
  }
  if (USE_MOCK) return getDemoSaga();
  return httpGet<Saga>('/sagas/current');
}
