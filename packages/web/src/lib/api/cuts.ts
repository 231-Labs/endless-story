import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { fetchEventCutsForSaga, type EventCutEntry } from '@/lib/chain/cut-read';

/**
 * Event-cut API — facade for the canonical "回" (woven multi-POV chapters).
 *
 * Chain-first only (like gazettes): pre-pipeline deployments simply have no
 * cuts and the facade returns empty arrays the UI renders as an empty state.
 * See docs/CONTENT_PIPELINE.md §2/§8.1.
 */

function isDeployed(): boolean {
    return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}

export async function listEventCuts(sagaId: string): Promise<EventCutEntry[]> {
    if (!isDeployed()) return [];
    return fetchEventCutsForSaga(sagaId, { limit: 20 });
}

export type { EventCutEntry } from '@/lib/chain/cut-read';
