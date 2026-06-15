/**
 * BudgetEvent view queries — get object + scan event log.
 *
 * Four event types are emitted by event.move:
 *   - `BudgetEventPushed`    — new event opened
 *   - `CharacterJoinedEvent` — participant added + hand dealt
 *   - `EventActionSubmitted` — a card was played
 *   - `BudgetEventResolved`  — outcomes validated, status → RESOLVED
 *
 * We expose a unified `listBudgetEvents` that scans `BudgetEventPushed`
 * (the canonical "this event exists" signal) — runner / admin then
 * fetches the full BudgetEvent object via `getBudgetEvent` to inspect
 * deck, resolution, outcomes.
 */
import * as gen from '../generated/endless_story/event.js';
import type { SuiClient } from '../client.js';
import { queryEventsWithRetry } from './query-retry.js';

export { gen as raw };

export const getBudgetEvent = (client: SuiClient, eventId: string) =>
    gen.BudgetEvent.get({ client, objectId: eventId });

/** One row of the `BudgetEventPushed` event log. */
export interface BudgetEventSummary {
    eventId: string;
    sagaId: string;
    sceneId: string;
    participantCount: number;
    cardCount: number;
    createdAtMs: string;
}

export interface ListBudgetEventsOptions {
    sagaId?: string;
    sceneId?: string;
    /** Max entries returned (newest-first). Default 50. */
    maxEvents?: number;
}

/**
 * Scan `BudgetEventPushed` events. Newest-first. Filter by saga + scene
 * is event-side (cheaper than per-object fetch).
 */
export async function listBudgetEvents(
    client: SuiClient,
    packageId: string,
    opts: ListBudgetEventsOptions = {},
): Promise<BudgetEventSummary[]> {
    const eventType = `${packageId}::event::BudgetEventPushed`;
    const out: BudgetEventSummary[] = [];
    const cap = opts.maxEvents ?? 50;
    let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
    for (;;) {
        const page = await queryEventsWithRetry(client, {
            query: { MoveEventType: eventType },
            cursor,
            limit: 50,
            order: 'descending',
        });
        for (const ev of page.data) {
            const parsed = ev.parsedJson as Partial<{
                event_id: string;
                saga_id: string;
                scene_id: string;
                participant_count: number | string;
                card_count: number | string;
                created_at_ms: number | string;
            }>;
            if (!parsed.event_id) continue;
            const sagaId = parsed.saga_id ?? '';
            const sceneId = parsed.scene_id ?? '';
            if (opts.sagaId && sagaId !== opts.sagaId) continue;
            if (opts.sceneId && sceneId !== opts.sceneId) continue;
            out.push({
                eventId: parsed.event_id,
                sagaId,
                sceneId,
                participantCount: Number(parsed.participant_count ?? 0),
                cardCount: Number(parsed.card_count ?? 0),
                createdAtMs: String(parsed.created_at_ms ?? '0'),
            });
            if (out.length >= cap) return out;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}

/**
 * Scan `CharacterJoinedEvent` and return a map of `eventId → join count`.
 * Used by the admin UI to show the real participant count — the count
 * in `BudgetEventPushed` is always 0 because participants are added one
 * at a time via `deal_participant_hand` *after* push.
 *
 * Newest-first traversal but result is just a count map, so order
 * doesn't matter. Bounded by `maxEvents` (across all CharacterJoined
 * events, not per event-id).
 */
export async function tallyJoins(
    client: SuiClient,
    packageId: string,
    maxEvents = 500,
): Promise<Map<string, number>> {
    const eventType = `${packageId}::event::CharacterJoinedEvent`;
    const out = new Map<string, number>();
    let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
    let scanned = 0;
    for (;;) {
        const page = await queryEventsWithRetry(client, {
            query: { MoveEventType: eventType },
            cursor,
            limit: 50,
            order: 'descending',
        });
        for (const ev of page.data) {
            const parsed = ev.parsedJson as Partial<{ event_id: string }>;
            if (parsed.event_id) {
                out.set(parsed.event_id, (out.get(parsed.event_id) ?? 0) + 1);
            }
            scanned += 1;
            if (scanned >= maxEvents) return out;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}

/** One row of the `BudgetEventResolved` event log. */
export interface BudgetEventResolvedSummary {
    eventId: string;
    resolvedAtMs: string;
}

/**
 * Scan `BudgetEventResolved`. Useful for the admin UI to mark which
 * pushed events have been closed. Newest-first.
 */
export async function listResolvedBudgetEvents(
    client: SuiClient,
    packageId: string,
    maxEvents = 50,
): Promise<BudgetEventResolvedSummary[]> {
    const eventType = `${packageId}::event::BudgetEventResolved`;
    const out: BudgetEventResolvedSummary[] = [];
    let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
    for (;;) {
        const page = await queryEventsWithRetry(client, {
            query: { MoveEventType: eventType },
            cursor,
            limit: 50,
            order: 'descending',
        });
        for (const ev of page.data) {
            const parsed = ev.parsedJson as Partial<{
                event_id: string;
                resolved_at_ms: number | string;
            }>;
            if (!parsed.event_id) continue;
            out.push({
                eventId: parsed.event_id,
                resolvedAtMs: String(parsed.resolved_at_ms ?? '0'),
            });
            if (out.length >= maxEvents) return out;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}
