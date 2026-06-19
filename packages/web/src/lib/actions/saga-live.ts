'use server';

/**
 * Saga live snapshot — the read side of the live handscroll.
 *
 * Returns the volatile, per-scene state the handscroll wants to surface in
 * (near) real time: who's standing where, which scenes have a live event
 * (curtain-up), and the latest action line as a ghost quote. All derived from
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
import {
    getLatestSceneLine,
    getRecentSceneLines,
    getRecentSceneLinesAcross,
    type SceneLineKind,
} from '@/lib/chain/scene-lines';

/** A ghost-quote line for the handscroll: who, what, in which register. */
export interface SceneLine {
    characterId: string;
    text: string;
    kind: SceneLineKind;
}

export interface SceneLiveStatus {
    sceneId: string;
    /** Characters currently standing in this scene (chain current_character_ids). */
    presentCharacterIds: string[];
    /** True when an unresolved BudgetEvent is open in this scene. */
    hasOpenEvent: boolean;
    eventTitle?: string;
    /** Latest line for a ghost quote (act / move / warmth / …). */
    latestLine?: SceneLine;
    /** Recent living stream for this scene, newest first (act/move/warmth/…). */
    recentLines: SceneLine[];
}

export interface OpenEventStatus {
    eventId: string;
    title: string;
    sceneId: string;
    /** Participant character ids — caller resolves names from its cast map. */
    participantIds: string[];
    /** How many have acted vs total — e.g. "2/3 have played their card". */
    actedCount: number;
    /** On-chain push time (ms). Lets the audit tell a normal spine linger (recently
     *  opened, the spine will resolve it) from a genuinely-hung event. */
    openedAtMs?: number;
}

export interface SagaLiveSnapshot {
    scenes: SceneLiveStatus[];
    /** Currently-open events in the saga (the live drama). Newest-first. */
    openEvents: OpenEventStatus[];
    /** Saga-wide pulse: newest lines across all scenes, newest first — the
     *  "world is moving NOW" ticker, alive even when no event is open. */
    pulse: Array<SceneLine & { sceneId: string }>;
    day?: number;
    partOfDay?: string;
}

/** How many recent events to scan for per-scene open/latest-line status. */
const EVENT_SCAN = 10;

export async function getSagaLiveSnapshot(sagaId: string): Promise<SagaLiveSnapshot> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg || !sagaId) return { scenes: [], openEvents: [], pulse: [] };
    const client = makeSuiClient({ network: resolveNetwork() });
    const openEvents: OpenEventStatus[] = [];

    // 1. Scenes → presence (fresh read of current_character_ids).
    const scenes = await fetchOnChainScenesForSaga(sagaId).catch(() => []);
    const byScene = new Map<string, SceneLiveStatus>();
    for (const s of scenes) {
        // Handscroll Step 3: prefer the latest first-person line (decide intent /
        // move reason) recorded by the tick loop. Falls through to the card
        // label below only when no fresh line exists for this scene.
        const cached = getLatestSceneLine(s.id);
        byScene.set(s.id, {
            sceneId: s.id,
            presentCharacterIds: s.currentCharacterIds ?? [],
            hasOpenEvent: false,
            latestLine: cached ?? undefined,
            recentLines: getRecentSceneLines(s.id, 4),
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
                deck?: { catalog?: Array<{ label?: string }>; participants?: string[] };
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
        const isOpen = Number(parsed.meta?.status ?? 0) === 0;

        if (isOpen) {
            // Top-level open-events list (the live drama) — even for scenes
            // not on the handscroll (e.g. unplaced scenes).
            openEvents.push({
                eventId: ev.eventId,
                title: parsed.meta?.title || '一場戲',
                sceneId,
                participantIds: parsed.deck?.participants ?? [],
                actedCount: (parsed.resolution?.submitted_actions ?? []).length,
                openedAtMs: Number(ev.createdAtMs) || undefined,
            });
        }

        const st = byScene.get(sceneId);
        if (!st) continue;

        if (isOpen) {
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
                    st.latestLine = { characterId: last.character_id, text: label, kind: 'act' };
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

    return {
        scenes: [...byScene.values()],
        openEvents,
        pulse: getRecentSceneLinesAcross(8),
        day,
        partOfDay,
    };
}
