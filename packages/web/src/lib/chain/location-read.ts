/**
 * Chain-side fetcher + mapper for the Location module (World-scoped).
 *
 * Returns UI-shaped `SagaLocation` populated from chain. The UI shape
 * is minimal (id / name / description) so the mapping is trivial.
 *
 * Locations are owned by the World, not by any specific Saga — a
 * single Location id can be referenced by multiple sagas via their
 * `Saga.covered_location_ids`. This module knows nothing about Saga.
 */

import type { SagaLocation } from '@endless-story/shared';
import { makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';

const SUI_ID_RE = /^0x[0-9a-fA-F]{64}$/;

function isSuiObjectId(id: string | null | undefined): id is string {
    return typeof id === 'string' && SUI_ID_RE.test(id);
}

interface ChainLocationJson {
    info?: { index?: number | string; name?: string; description?: string; terrain?: string };
}

export async function fetchOnChainLocation(locationId: string): Promise<SagaLocation | null> {
    if (!isSuiObjectId(locationId)) return null;
    const client = makeSuiClient({ network: resolveNetwork() });
    let res;
    try {
        res = await read.world.getLocation(client, locationId);
    } catch (err) {
        console.warn('[location-read] fetchOnChainLocation failed:', err);
        return null;
    }
    const json = res.json as unknown as ChainLocationJson | undefined;
    if (!json) return null;
    return {
        id: locationId,
        name: json.info?.name ?? '無名之地',
        description: json.info?.description ?? '',
    };
}
