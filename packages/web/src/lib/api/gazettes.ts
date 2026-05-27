import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import {
    fetchGazettesForSaga,
    fetchLatestGazetteForSaga,
    type GazetteEntry,
} from '@/lib/chain/gazette-read';

/**
 * Gazettes API — facade for saga-level 公報 commitments.
 *
 * Chain-first only. There's no mock fallback because gazette is a
 * post-MVP concept (added in R3); pre-R3 deployments simply have no
 * gazettes, and the facade returns empty arrays which the UI renders
 * as an empty state.
 */

function isDeployed(): boolean {
    return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}

export async function listGazettes(sagaId: string): Promise<GazetteEntry[]> {
    if (!isDeployed()) return [];
    return fetchGazettesForSaga(sagaId, { limit: 20 });
}

export async function getLatestGazette(sagaId: string): Promise<GazetteEntry | null> {
    if (!isDeployed()) return null;
    return fetchLatestGazetteForSaga(sagaId);
}

export type { GazetteEntry } from '@/lib/chain/gazette-read';
