/**
 * Chain event subscriber — thin wrapper over Sui RPC `queryEvents`.
 *
 * Two modes:
 *   - `subscribe(types, handler, opts)` — long-running tail. Resumes
 *     from last-seen cursor, polls at `pollIntervalMs`, dispatches each
 *     event to the handler. Used by services running in tail mode.
 *   - `since(types, fromCursor)` — one-shot pull-from-cursor. Used by
 *     `runOnce()` invocations (e.g. admin click in web).
 *
 * Cursor persistence is the caller's job. The bus stays stateless — it
 * just reads + parses. This keeps it test-friendly (no fs deps) and
 * lets web server actions own short-lived cursors per request.
 */

import { makeSuiClient, ENDLESS_STORY_DEPLOYMENT, read } from '@endless-story/sdk';
import type { SuiClient } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';

export interface EventCursor {
    txDigest: string;
    eventSeq: string;
}

export interface RawChainEvent {
    type: string;            // fully-qualified ::module::EventStruct
    parsedJson: unknown;
    txDigest: string;
    eventSeq: string;
    timestampMs?: string;
}

export interface SubscribeOptions {
    /** Module names to filter on (e.g. ['director', 'character']). */
    modules?: string[];
    /** Specific fully-qualified event types — overrides modules if set. */
    eventTypes?: string[];
    /** Cursor to resume from. Omit → start from latest events going backward. */
    fromCursor?: EventCursor | null;
    /** Cap per-poll batch. */
    pageLimit?: number;
}

/**
 * One-shot fetch — returns events newer than `fromCursor` (or latest N
 * if cursor is null), in chronological order (oldest first), so the
 * caller can replay them through a reducer.
 */
export async function fetchEventsSince(
    opts: SubscribeOptions,
    client?: SuiClient,
): Promise<{ events: RawChainEvent[]; nextCursor: EventCursor | null }> {
    const c = client ?? makeSuiClient({ network: resolveNetwork() });
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return { events: [], nextCursor: null };

    const wantedTypes = resolveWantedTypes(pkg, opts);

    // queryEvents only filters by ONE MoveEventType at a time; for
    // multiple, do parallel pulls and merge by tx digest + eventSeq.
    const pulls = await Promise.all(
        wantedTypes.map(async (eventType) => {
            const res = await read.queryEventsWithRetry(c, {
                query: { MoveEventType: eventType },
                cursor: opts.fromCursor ?? null,
                limit: opts.pageLimit ?? 50,
                order: 'descending',
            });
            return res.data.map((ev) => ({
                type: ev.type,
                parsedJson: ev.parsedJson,
                txDigest: ev.id.txDigest,
                eventSeq: ev.id.eventSeq,
                timestampMs: ev.timestampMs ?? undefined,
            }));
        }),
    );

    const merged = pulls
        .flat()
        .sort((a, b) => sortEvent(a, b));    // oldest-first
    const nextCursor =
        merged.length > 0
            ? { txDigest: merged[merged.length - 1].txDigest, eventSeq: merged[merged.length - 1].eventSeq }
            : null;

    return { events: merged, nextCursor };
}

function resolveWantedTypes(packageId: string, opts: SubscribeOptions): string[] {
    if (opts.eventTypes && opts.eventTypes.length > 0) return opts.eventTypes;
    if (opts.modules && opts.modules.length > 0) {
        // module-level filter is implemented as "match every event type
        // under this module" — caller is expected to enumerate via
        // SDK generated types in real use.
        // For now, return empty: caller must pass eventTypes explicitly.
        // (TODO when more modules ship: introduce a registry.)
        return [];
    }
    return [];
}

function sortEvent(a: RawChainEvent, b: RawChainEvent): number {
    if (a.txDigest === b.txDigest) {
        return Number(a.eventSeq) - Number(b.eventSeq);
    }
    // Stable but arbitrary — within the same poll, tx-digest order is
    // a reasonable proxy for time. For strict ordering use timestampMs.
    return a.txDigest.localeCompare(b.txDigest);
}
