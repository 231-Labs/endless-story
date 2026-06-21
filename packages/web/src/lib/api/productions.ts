import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import {
    fetchProduction,
    fetchProductionsForSaga,
    type ProductionDetail,
    type ProductionEntry,
} from '@/lib/chain/production-read';

/**
 * Production (排戲/劇目) API — facade for the 戲折 (whole-production collectible).
 *
 * Chain-first only (like gazettes/cuts): pre-pipeline deployments simply have no
 * productions and the facade returns empty arrays the UI renders as an empty
 * state. See docs/narrative/PRODUCTION_ENGINE.md §10.
 */

function isDeployed(): boolean {
    return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}

export async function listProductions(sagaId: string): Promise<ProductionEntry[]> {
    if (!isDeployed()) return [];
    return fetchProductionsForSaga(sagaId, { limit: 20 });
}

/** One production with its full 戲折 — the /feed/production/[id] reading page. */
export async function getProduction(commitmentId: string): Promise<ProductionDetail | null> {
    if (!isDeployed()) return null;
    return fetchProduction(commitmentId);
}

export type { ProductionDetail, ProductionEntry } from '@/lib/chain/production-read';
