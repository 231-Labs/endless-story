'use server';

/**
 * Saga live snapshot — the read side of the live handscroll.
 *
 * Returns the volatile, per-scene state the handscroll wants to surface in
 * (near) real time: who's standing where, which scenes have a live event
 * ("開鑼"), and the latest action line as a ghost quote. All derived from
 * chain reads — no websockets. The client polls this every few seconds.
 *
 * Why polling, not push: the world only mutates on discrete admin ticks,
 * and Sui public-node event subscriptions are deprecated/unreliable. A
 * lightweight poll of fresh chain state is the right altitude (see the
 * handscroll assessment).
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from '@/lib/chain/network';
import { fetchOnChainScenesForSaga } from '@/lib/chain/scene-read';

export interface SceneLiveStatus {
    sceneId: string;
    /** Characters currently standing in this scene (chain current_character_ids). */
    presentCharacterIds: string[];
    /** True when an unresolved BudgetEvent is open in this scene. */
    hasOpenEvent: boolean;
    eventTitle?: string;
    /** Latest action line for a ghost quote: who played which card. */
    latestLine?: { characterId: string; text: string };
}

export interface SagaLiveSnapshot {
    scenes: SceneLiveStatus[];
    day?: number;
    partOfDay?: string;
}

/** How many recent events to scan for per-scene open/latest-line status. */
const EVENT_SCAN = 10;

export async function getSagaLiveSnapshot(sagaId: string): Promise<SagaLiveSnapshot> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg || !sagaId) return { scenes: [] };
    const client = makeSuiClient({ network: resolveNetwork() });

    // 1. Scenes → presence (fresh read of current_character_ids).
    const scenes = await fetchOnChainScenesForSaga(sagaId).catch(() => []);
    const byScene = new Map<string, SceneLiveStatus>();
    for (const s of scenes) {
        byScene.set(s.id, {
            sceneId: s.id,
            presentCharacterIds: s.currentCharacterIds ?? [],
            hasOpenEvent: false,
        });
    }

    // 2. Recent events → per-scene open flag + latest action line.
    const summaries = await read.event
        .listBudgetEvents(client, pkg, { sagaId, maxEvents: EVENT_SCAN })
        .catch(() => []);
    for (const ev of summaries) {
        let parsed;
        try {
            const res = await read.event.getBudgetEvent(client, ev.eventId);
            parsed = res.json as unknown as {
                meta?: { status?: number | string; scene_id?: string; title?: string };
                deck?: { catalog?: Array<{ label?: string }> };
                resolution?: {
                    submitted_actions?: Array<{
                        character_id?: string;
                        card_index?: number | string;
                        submitted_at_ms?: number | string;
                    }>;
                };
            };
        } catch {
            continue;
        }
        const sceneId = parsed.meta?.scene_id ?? ev.sceneId;
        const st = byScene.get(sceneId);
        if (!st) continue;

        if (Number(parsed.meta?.status ?? 0) === 0) {
            st.hasOpenEvent = true;
            st.eventTitle = parsed.meta?.title || st.eventTitle;
        }

        // Latest action line for this scene. listBudgetEvents is newest-
        // first, so the first event we see touching a scene is the most
        // recent — take its newest action and don't overwrite.
        if (!st.latestLine) {
            const catalog = parsed.deck?.catalog ?? [];
            const actions = parsed.resolution?.submitted_actions ?? [];
            if (actions.length > 0) {
                const last = actions.reduce((a, b) =>
                    Number(b.submitted_at_ms ?? 0) >= Number(a.submitted_at_ms ?? 0) ? b : a,
                );
                const label = catalog[Number(last.card_index ?? -1)]?.label;
                if (label && last.character_id) {
                    st.latestLine = { characterId: last.character_id, text: label };
                }
            }
        }
    }

    // 3. World time.
    let day: number | undefined;
    let partOfDay: string | undefined;
    const worldId = ENDLESS_STORY_DEPLOYMENT.worldId;
    if (worldId) {
        try {
            const w = await read.world.getWorld(client, worldId);
            const json = w.json as unknown as {
                state?: { current_tick?: number | string };
                time_config?: { days_per_tick_bp?: number | string };
            };
            const tick = Number(json.state?.current_tick ?? 0);
            const bp = Number(json.time_config?.days_per_tick_bp ?? 1670) || 1670;
            day = Math.floor((tick * bp) / 10_000) + 1;
        } catch {
            /* leave undefined */
        }
    }

    return { scenes: [...byScene.values()], day, partOfDay };
}
