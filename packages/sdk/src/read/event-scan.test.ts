/**
 * Characterization tests for the event-log read layer.
 *
 * These pin the CURRENT behavior of the `queryEvents`-paging readers — the
 * cursor loop, event-side filtering, field mapping, and (most importantly) the
 * two different cap semantics. They feed the live feed/ledger and had no test
 * coverage; lock the behavior here so any future refactor (e.g. hoisting the
 * repeated paging loop into a shared `scanEvents`) is provably behavior-
 * preserving. No network: a fake client serves canned pages.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { listCommitments, findLatestCommitment } from './commitment.js';
import { listBudgetEvents, tallyJoins } from './event.js';
import type { SuiClient } from '../client.js';

type Ev = { parsedJson: Record<string, unknown>; id: { txDigest: string; eventSeq: string } };
type Page = { data: Ev[]; hasNextPage: boolean; nextCursor: { txDigest: string; eventSeq: string } | null };
type QueryParams = { query: { MoveEventType: string }; cursor: unknown; limit: number; order: string };

/** Fake SuiClient whose `queryEvents` returns `pages` in order; records each call's params. */
function mockClient(pages: Page[]): { client: SuiClient; calls: QueryParams[] } {
    let i = 0;
    const calls: QueryParams[] = [];
    const client = {
        queryEvents: async (params: QueryParams) => {
            calls.push(params);
            const page = pages[i] ?? { data: [], hasNextPage: false, nextCursor: null };
            i += 1;
            return page;
        },
    } as unknown as SuiClient;
    return { client, calls };
}

function ev(fields: Record<string, unknown>, txDigest = 'tx', eventSeq = '0'): Ev {
    return { parsedJson: fields, id: { txDigest, eventSeq } };
}

const PKG = '0xpkg';

// ── listCommitments: the read-window-critical collector ──────────────────────

test('listCommitments pages through nextCursor and maps every field (incl txDigest/eventSeq)', async () => {
    const { client, calls } = mockClient([
        {
            data: [ev({ commitment_id: 'c1', saga_id: 's1', subject_id: 'sub1', committer: '0xA', committed_at_ms: 100 }, 'txA', '1')],
            hasNextPage: true,
            nextCursor: { txDigest: 'txA', eventSeq: '1' },
        },
        {
            data: [ev({ commitment_id: 'c2', saga_id: 's1', subject_id: 'sub2', committer: '0xB', committed_at_ms: 200 }, 'txB', '2')],
            hasNextPage: false,
            nextCursor: null,
        },
    ]);

    const out = await listCommitments(client, PKG);

    assert.equal(out.length, 2);
    // order is preserved exactly as received (RPC descending) — never reordered
    assert.deepEqual(out.map((c) => c.commitmentId), ['c1', 'c2']);
    assert.deepEqual(out[0], {
        commitmentId: 'c1', sagaId: 's1', subjectId: 'sub1', committer: '0xA',
        committedAtMs: '100', txDigest: 'txA', eventSeq: '1',
    });
    // paged exactly twice, with the right event type / order / cursor threading
    assert.equal(calls.length, 2);
    assert.equal(calls[0].query.MoveEventType, `${PKG}::commitment::CommitmentCreated`);
    assert.equal(calls[0].order, 'descending');
    assert.equal(calls[0].limit, 50);
    assert.equal(calls[0].cursor, null);
    assert.deepEqual(calls[1].cursor, { txDigest: 'txA', eventSeq: '1' });
});

test('listCommitments filters event-side by subjectId', async () => {
    const { client } = mockClient([
        {
            data: [
                ev({ commitment_id: 'c1', subject_id: 'sub1', saga_id: 's1' }),
                ev({ commitment_id: 'c2', subject_id: 'sub2', saga_id: 's1' }),
                ev({ commitment_id: 'c3', subject_id: 'sub1', saga_id: 's2' }),
            ],
            hasNextPage: false,
            nextCursor: null,
        },
    ]);

    const out = await listCommitments(client, PKG, { subjectId: 'sub1' });
    assert.deepEqual(out.map((c) => c.commitmentId), ['c1', 'c3']);
});

test('listCommitments maxEvents caps RESULT count and stops scanning early (read-window semantics)', async () => {
    const { client, calls } = mockClient([
        // 3 matches on page 1; maxEvents=2 must return mid-page and never fetch page 2
        {
            data: [ev({ commitment_id: 'c1' }), ev({ commitment_id: 'c2' }), ev({ commitment_id: 'c3' })],
            hasNextPage: true,
            nextCursor: { txDigest: 't', eventSeq: '1' },
        },
        { data: [ev({ commitment_id: 'c4' })], hasNextPage: false, nextCursor: null },
    ]);

    const out = await listCommitments(client, PKG, { maxEvents: 2 });
    assert.deepEqual(out.map((c) => c.commitmentId), ['c1', 'c2']);
    assert.equal(calls.length, 1); // stopped within page 1; page 2 never requested
});

test('listCommitments skips events missing commitment_id', async () => {
    const { client } = mockClient([
        { data: [ev({ saga_id: 's1' }), ev({ commitment_id: 'c2' })], hasNextPage: false, nextCursor: null },
    ]);
    const out = await listCommitments(client, PKG);
    assert.deepEqual(out.map((c) => c.commitmentId), ['c2']);
});

test('findLatestCommitment returns the first match and stops at one (maxEvents=1)', async () => {
    const { client, calls } = mockClient([
        { data: [ev({ commitment_id: 'c1' }), ev({ commitment_id: 'c2' })], hasNextPage: true, nextCursor: { txDigest: 't', eventSeq: '1' } },
    ]);
    const latest = await findLatestCommitment(client, PKG);
    assert.equal(latest?.commitmentId, 'c1');
    assert.equal(calls.length, 1);
});

// ── tallyJoins: the OTHER cap semantics (scanned, not matched) ────────────────

test('tallyJoins counts joins per event_id and caps on SCANNED events, not matches', async () => {
    const { client, calls } = mockClient([
        { data: [ev({ event_id: 'e1' }), ev({ event_id: 'e1' }), ev({ event_id: 'e2' })], hasNextPage: true, nextCursor: { txDigest: 't', eventSeq: '1' } },
    ]);

    // maxEvents=2 scans only the first two events (both 'e1') → e1=2, e2 never reached
    const map = await tallyJoins(client, PKG, 2);
    assert.equal(map.get('e1'), 2);
    assert.equal(map.get('e2'), undefined);
    assert.equal(calls.length, 1);
});

// ── a second module, to show the filter/map pattern generalizes ──────────────

test('listBudgetEvents filters by saga + scene and maps counts', async () => {
    const { client } = mockClient([
        {
            data: [
                ev({ event_id: 'b1', saga_id: 's1', scene_id: 'sc1', participant_count: 3, card_count: 5, created_at_ms: 10 }),
                ev({ event_id: 'b2', saga_id: 's1', scene_id: 'sc2', participant_count: 1, card_count: 2, created_at_ms: 20 }),
            ],
            hasNextPage: false,
            nextCursor: null,
        },
    ]);

    const out = await listBudgetEvents(client, PKG, { sagaId: 's1', sceneId: 'sc1' });
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], {
        eventId: 'b1', sagaId: 's1', sceneId: 'sc1', participantCount: 3, cardCount: 5, createdAtMs: '10',
    });
});
