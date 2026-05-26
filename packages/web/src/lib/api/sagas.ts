import type { Saga } from '@endless-story/shared';
import { getDemoSaga, sagas } from '@/mocks/sagas';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { USE_MOCK } from './config';
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
 *   - `getCurrentSaga()` — same; mock fixture is fine for demo.
 *
 * Backend HTTP endpoints (legacy, USE_MOCK=false path):
 *   GET  /sagas / /sagas/{id} / /sagas/current
 */

function isDeployed(): boolean {
  return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}

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
  if (USE_MOCK) return getDemoSaga();
  return httpGet<Saga>('/sagas/current');
}
