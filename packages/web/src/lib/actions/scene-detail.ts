'use server';

/**
 * Scene detail — the events that have happened in one scene (for the
 * focused-scene view on the saga handscroll).
 *
 * The chain Scene object doesn't carry an event history in a UI shape, so
 * the focused view's "past" section was always empty. This reads the BudgetEvents
 * anchored to the scene (the dramatic happenings) + the recent action lines,
 * so a scene that has hosted events actually shows them.
 *
 * Read-only chain reads; returns empty on any failure.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from '@/lib/chain/network';
import { getLatestSceneLine } from '@/lib/chain/scene-lines';

export interface SceneEventSummary {
    eventId: string;
    title: string;
    summary?: string;
    status: 'open' | 'resolved';
    participantIds: string[];
    actedCount: number;
    total: number;
    /** Per-character card labels played in this event. */
    plays: { characterId: string; label: string }[];
}

export interface SceneDetailSnapshot {
    events: SceneEventSummary[];
    /** Ghost-quote lines for the focused view (first-person line + card plays). */
    ghostQuotes: { characterId: string; text: string }[];
}

export async function getSceneDetail(sceneId: string): Promise<SceneDetailSnapshot> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    const pkg = d.packageId;
    if (!pkg || !d.sagaId || !sceneId) return { events: [], ghostQuotes: [] };
    const client = makeSuiClient({ network: resolveNetwork() });

    const summaries = await read.event
        .listBudgetEvents(client, pkg, { sagaId: d.sagaId, sceneId, maxEvents: 30 })
        .catch(() => []);

    const events: SceneEventSummary[] = [];
    const ghostQuotes: { characterId: string; text: string }[] = [];

    for (const ev of summaries) {
        let parsed;
        try {
            const res = await read.event.getBudgetEvent(client, ev.eventId);
            parsed = res.json as unknown as {
                meta?: {
                    status?: number | string;
                    scene_id?: string;
                    title?: string;
                    summary?: string;
                };
                deck?: { catalog?: Array<{ label?: string }>; participants?: string[] };
                resolution?: {
                    submitted_actions?: Array<{
                        character_id?: string;
                        card_index?: number | string;
                    }>;
                };
            };
        } catch {
            continue;
        }
        // Guard: the event filter is on the pushed scene_id; double-check.
        if ((parsed.meta?.scene_id ?? ev.sceneId) !== sceneId) continue;

        const participants = parsed.deck?.participants ?? [];
        const catalog = parsed.deck?.catalog ?? [];
        const actions = parsed.resolution?.submitted_actions ?? [];
        const plays = actions
            .map((a) => ({
                characterId: a.character_id ?? '',
                label: catalog[Number(a.card_index ?? -1)]?.label ?? '',
            }))
            .filter((p) => p.characterId && p.label);

        events.push({
            eventId: ev.eventId,
            title: parsed.meta?.title || '一場戲',
            summary: parsed.meta?.summary || undefined,
            status: Number(parsed.meta?.status ?? 0) === 0 ? 'open' : 'resolved',
            participantIds: participants,
            actedCount: actions.length,
            total: participants.length,
            plays,
        });

        // NOTE: a card play only stores a card *index* on chain (斬/攻/敘/觀 — a
        // game-mechanism token, not prose). It must never be floated as a ghost
        // quote: a lone「攻」reads as broken mock text where a first-person
        // thought is expected. Real first-person lines live only in the
        // scene-line cache (see below); the events list keeps `plays` for the
        // 過往 section, which renders them as tokens on purpose.
    }

    // The only believable ghost quote is the cached first-person line the
    // acting agent generated. No cache → leave ghostQuotes empty so the UI
    // falls back to the saga's curated static quotes (or「還未積累成文」).
    const cached = getLatestSceneLine(sceneId);
    if (cached) ghostQuotes.push(cached);

    return { events, ghostQuotes };
}
