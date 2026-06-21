import type { SagaLocation } from '@endless-story/shared';
import { locations } from '@/mocks/sagas';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { USE_MOCK, isDeployed } from './config';
import { httpGet } from './http';
import { fetchOnChainLocation } from '@/lib/chain/location-read';

/**
 * Locations API — facade for the chain `world::Location` reads + mock
 * fallback.
 *
 * Locations are World-scoped (not Saga-scoped) — a single Location id
 * can be referenced by multiple sagas. Sits in its own facade file
 * because it mirrors a distinct on-chain module, even though the UI
 * usually fetches them indirectly via `Saga.coveredLocationIds`.
 *
 * Chain-first when packageId set AND the id looks like a Sui object
 * id. Mock slugs fall through to fixture.
 *
 * Backend HTTP endpoints (legacy, USE_MOCK=false path):
 *   GET  /locations / /locations/{id}
 */

const SUI_ID_RE = /^0x[0-9a-fA-F]{64}$/;
function isSuiObjectId(id: string): boolean {
  return SUI_ID_RE.test(id);
}

export async function listLocations(): Promise<SagaLocation[]> {
  if (USE_MOCK) return locations;
  return httpGet<SagaLocation[]>('/locations');
}

export async function getLocation(id: string): Promise<SagaLocation | null> {
  if (isDeployed() && isSuiObjectId(id)) {
    const onChain = await fetchOnChainLocation(id);
    if (onChain) return onChain;
  }
  if (USE_MOCK) return locations.find((l) => l.id === id) ?? null;
  try {
    return await httpGet<SagaLocation>(`/locations/${id}`);
  } catch {
    return null;
  }
}
