/**
 * Characterization tests for the read-layer event-scan loop.
 *
 * The SDK read layer has no other unit coverage, yet it feeds the live
 * feed/ledger and past regressions here were read-window bugs (wrong page
 * order, cursor not followed, a cap that stopped one event too early). These
 * tests pin the CURRENT observable behavior of two representative scanners —
 * a *collector* (`listReflectionEvents`, capped by `out.length`) and a
 * *tally* (`tallyJoins`, capped by total events `scanned`) — so the
 * `scanEvents` refactor is gated: same canned RPC pages must yield the same
 * output AND the same `queryEvents` call sequence (MoveEventType / limit 50 /
 * descending / cursor follows `nextCursor`).
 *
 * The SuiClient is faked: `queryEvents` replays canned pages in order and
 * records the params it was called with. Runs under `node --test` via the
 * `.js`→`.ts` resolve hook (see `ts-extension-resolve.mjs`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { listReflectionEvents } from '../src/read/reflection.ts';
import { tallyJoins } from '../src/read/event.ts';
import type { SuiClient } from '../src/client.ts';

const PKG = '0xpkg';

type Cursor = { txDigest: string; eventSeq: string } | null;

interface CannedPage {
    data: { id: { txDigest: string; eventSeq: string }; parsedJson: Record<string, unknown> }[];
    hasNextPage: boolean;
    nextCursor: Cursor;
}

interface RecordedCall {
    query: unknown;
    cursor: unknown;
    limit: unknown;
    order: unknown;
}

/** Fake SuiClient: `queryEvents` replays `pages` in order and records calls. */
function fakeClient(pages: CannedPage[]): { client: SuiClient; calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];
    let i = 0;
    const client = {
        queryEvents: async (params: RecordedCall) => {
            calls.push({
                query: params.query,
                cursor: params.cursor,
                limit: params.limit,
                order: params.order,
            });
            const page = pages[i] ?? { data: [], hasNextPage: false, nextCursor: null };
            i += 1;
            return page;
        },
    } as unknown as SuiClient;
    return { client, calls };
}

const ev = (parsedJson: Record<string, unknown>, txDigest = 'tx', eventSeq = '0') => ({
    id: { txDigest, eventSeq },
    parsedJson,
});

/* ── listReflectionEvents (collector, cap = out.length >= cap) ─────────── */

function reflectionPages(): CannedPage[] {
    return [
        {
            data: [
                ev({
                    reflection_id: '0xr1',
                    saga_id: '0xS1',
                    character_id: '0xC1',
                    mode: 'active',
                    question: 'Why?',
                    importance: 5,
                    committed_at_ms: '1000',
                }),
                ev({ /* no reflection_id → skipped */ }),
                ev({
                    reflection_id: '0xr2',
                    saga_id: '0xS1',
                    character_id: '0xC2',
                    mode: 'passive',
                    question: 'Who?',
                    importance: '3', // string → Number()
                    committed_at_ms: 900, // number → String()
                }),
            ],
            hasNextPage: true,
            nextCursor: { txDigest: 'tx0', eventSeq: '0' },
        },
        {
            data: [
                ev({
                    reflection_id: '0xr3',
                    saga_id: '0xS2',
                    character_id: '0xC1',
                    mode: 'weird', // not active|passive → coerced to 'passive'
                    // question missing → ''
                    importance: 7,
                    committed_at_ms: '800',
                }),
            ],
            hasNextPage: false,
            nextCursor: null,
        },
    ];
}

test('listReflectionEvents: maps + paginates newest-first, skips id-less events', async () => {
    const { client, calls } = fakeClient(reflectionPages());
    const out = await listReflectionEvents(client, PKG);

    assert.deepEqual(out, [
        {
            reflectionId: '0xr1',
            sagaId: '0xS1',
            characterId: '0xC1',
            mode: 'active',
            question: 'Why?',
            importance: 5,
            committedAtMs: '1000',
        },
        {
            reflectionId: '0xr2',
            sagaId: '0xS1',
            characterId: '0xC2',
            mode: 'passive',
            question: 'Who?',
            importance: 3,
            committedAtMs: '900',
        },
        {
            reflectionId: '0xr3',
            sagaId: '0xS2',
            characterId: '0xC1',
            mode: 'passive',
            question: '',
            importance: 7,
            committedAtMs: '800',
        },
    ]);

    // RPC contract: two pages, MoveEventType / limit 50 / descending, cursor follows nextCursor.
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
        query: { MoveEventType: `${PKG}::reflection::ReflectionCommitted` },
        cursor: null,
        limit: 50,
        order: 'descending',
    });
    assert.deepEqual(calls[1].query, { MoveEventType: `${PKG}::reflection::ReflectionCommitted` });
    assert.deepEqual(calls[1].cursor, { txDigest: 'tx0', eventSeq: '0' });
});

test('listReflectionEvents: event-side characterId filter matches across pages', async () => {
    const { client } = fakeClient(reflectionPages());
    const out = await listReflectionEvents(client, PKG, { characterId: '0xC1' });
    assert.deepEqual(
        out.map((r) => r.reflectionId),
        ['0xr1', '0xr3'],
    );
});

test('listReflectionEvents: maxEvents caps mid-page and stops paging', async () => {
    const { client, calls } = fakeClient(reflectionPages());
    const out = await listReflectionEvents(client, PKG, { maxEvents: 2 });
    assert.deepEqual(
        out.map((r) => r.reflectionId),
        ['0xr1', '0xr2'],
    );
    // Cap hit inside the first page → second page never fetched.
    assert.equal(calls.length, 1);
});

/* ── tallyJoins (tally, cap = scanned >= maxEvents) ────────────────────── */

function joinPages(): CannedPage[] {
    return [
        {
            data: [
                ev({ event_id: '0xE1' }),
                ev({ event_id: '0xE2' }),
                ev({ /* no event_id → not counted, but still scanned */ }),
            ],
            hasNextPage: true,
            nextCursor: { txDigest: 'tj0', eventSeq: '0' },
        },
        {
            data: [ev({ event_id: '0xE1' }), ev({ event_id: '0xE3' })],
            hasNextPage: false,
            nextCursor: null,
        },
    ];
}

test('tallyJoins: aggregates counts across pages', async () => {
    const { client, calls } = fakeClient(joinPages());
    const out = await tallyJoins(client, PKG);

    assert.equal(out.size, 3);
    assert.deepEqual(Object.fromEntries(out), { '0xE1': 2, '0xE2': 1, '0xE3': 1 });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
        query: { MoveEventType: `${PKG}::event::CharacterJoinedEvent` },
        cursor: null,
        limit: 50,
        order: 'descending',
    });
    assert.deepEqual(calls[1].cursor, { txDigest: 'tj0', eventSeq: '0' });
});

test('tallyJoins: maxEvents counts every scanned event (incl. id-less) and stops paging', async () => {
    const { client, calls } = fakeClient(joinPages());
    // scanned counts the id-less event too: E1(1), E2(2), id-less(3) → cap, return inside page 1.
    const out = await tallyJoins(client, PKG, 3);
    assert.deepEqual(Object.fromEntries(out), { '0xE1': 1, '0xE2': 1 });
    assert.equal(calls.length, 1);
});
