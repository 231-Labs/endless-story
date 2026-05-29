/**
 * Chain-side fetcher for BudgetEvents (event.move 1.6).
 *
 * Two passes:
 *   - `BudgetEventPushed` events give us the canonical "this event
 *     exists" list. Cheap, paginated.
 *   - `BudgetEventResolved` events tell us which of the pushed events
 *     have closed. We join these client-side so the admin UI can show
 *     open vs resolved badges.
 *
 * Per-event full detail (participants, hands, outcomes) comes from
 * `getBudgetEvent` which reads the actual shared object.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';

export interface BudgetEventEntry {
    eventId: string;
    sagaId: string;
    sceneId: string;
    participantCount: number;
    cardCount: number;
    createdAtMs: string;
    /** Set once we've also seen a BudgetEventResolved for this event. */
    resolvedAtMs: string | null;
}

export interface FetchBudgetEventsOptions {
    sagaId?: string;
    sceneId?: string;
    /** Max entries returned (newest first). Default 30. */
    limit?: number;
}

export async function fetchBudgetEvents(
    opts: FetchBudgetEventsOptions = {},
): Promise<BudgetEventEntry[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const limit = opts.limit ?? 30;
    const client = makeSuiClient({ network: resolveNetwork() });

    // `participantCount` in BudgetEventPushed is always 0 — participants
    // are added via deal_participant_hand AFTER push. So we also tally
    // CharacterJoinedEvent and join on event_id for the real count.
    const [pushed, resolved, joins] = await Promise.all([
        read.event
            .listBudgetEvents(client, pkg, {
                sagaId: opts.sagaId,
                sceneId: opts.sceneId,
                maxEvents: limit,
            })
            .catch((err) => {
                console.warn('[event-read] listBudgetEvents failed:', err);
                return [];
            }),
        read.event
            .listResolvedBudgetEvents(client, pkg, limit)
            .catch((err) => {
                console.warn('[event-read] listResolvedBudgetEvents failed:', err);
                return [];
            }),
        read.event.tallyJoins(client, pkg).catch((err) => {
            console.warn('[event-read] tallyJoins failed:', err);
            return new Map<string, number>();
        }),
    ]);

    const resolvedMap = new Map<string, string>();
    for (const r of resolved) resolvedMap.set(r.eventId, r.resolvedAtMs);

    return pushed.map((p) => ({
        eventId: p.eventId,
        sagaId: p.sagaId,
        sceneId: p.sceneId,
        participantCount: joins.get(p.eventId) ?? 0,
        cardCount: p.cardCount,
        createdAtMs: p.createdAtMs,
        resolvedAtMs: resolvedMap.get(p.eventId) ?? null,
    }));
}

export interface BudgetEventDetail {
    eventId: string;
    sagaId: string;
    sceneId: string;
    title: string;
    summary: string;
    scale: number;
    status: 'open' | 'resolved';
    createdAtMs: string;
    resolvedAtMs: string;
    handSize: number;
    cardCount: number;
    /** Character ids ordered by join time. `hands[i]` belongs to `participants[i]`. */
    participants: string[];
    /** Each inner vector is card indices into the catalog (length = handSize). */
    hands: number[][];
    submittedActionCount: number;
}

/**
 * Fetch the full BudgetEvent shared object — needed for participant +
 * outcome detail beyond what the event log carries.
 */
export async function fetchBudgetEventDetail(
    eventId: string,
): Promise<BudgetEventDetail | null> {
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        const res = await read.event.getBudgetEvent(client, eventId);
        const json = res.json as unknown as {
            meta?: {
                saga_id?: string;
                scene_id?: string;
                title?: string;
                summary?: string;
                scale?: number | string;
                status?: number | string;
                created_at_ms?: string | number;
                resolved_at_ms?: string | number;
            };
            deck?: {
                participants?: string[];
                catalog?: unknown[];
                hand_size?: number | string;
                hands?: Array<Array<number | string>>;
            };
            resolution?: {
                submitted_actions?: unknown[];
            };
        };
        const meta = json.meta ?? {};
        const deck = json.deck ?? {};
        const resolution = json.resolution ?? {};
        const status = Number(meta.status ?? 0) === 1 ? 'resolved' : 'open';
        return {
            eventId,
            sagaId: meta.saga_id ?? '',
            sceneId: meta.scene_id ?? '',
            title: meta.title ?? '',
            summary: meta.summary ?? '',
            scale: Number(meta.scale ?? 0),
            status,
            createdAtMs: String(meta.created_at_ms ?? '0'),
            resolvedAtMs: String(meta.resolved_at_ms ?? '0'),
            handSize: Number(deck.hand_size ?? 0),
            cardCount: Array.isArray(deck.catalog) ? deck.catalog.length : 0,
            participants: Array.isArray(deck.participants) ? deck.participants : [],
            hands: Array.isArray(deck.hands)
                ? deck.hands.map((h) => h.map((c) => Number(c)))
                : [],
            submittedActionCount: Array.isArray(resolution.submitted_actions)
                ? resolution.submitted_actions.length
                : 0,
        };
    } catch (err) {
        console.warn('[event-read] fetchBudgetEventDetail failed:', err);
        return null;
    }
}
