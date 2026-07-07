/**
 * Characterization tests for the event-log read layer.
 *
 * These pin the behavior of the `scanEvents`-paging readers — the cursor loop,
 * event-side filtering, field mapping, and the two different cap semantics
 * (RESULT count vs SCANNED count). They feed the live feed/ledger.
 *
 * Post gRPC-migration the readers no longer page a live `queryEvents` client;
 * they read the registered durable store (see `query-retry.ts`). So these seed a
 * `MemoryEventStore` — the reference `queryEvents` implementation — and register
 * it via `setEventStore`. No network. Events are listed newest-first; the store
 * orders by `timestampMs`, so each row gets a descending synthetic timestamp.
 */
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { MemoryEventStore } from '@endless-story/indexer';
import { listCommitments, findLatestCommitment } from './commitment.js';
import { listBudgetEvents, tallyJoins } from './event.js';
import { setEventStore } from './event-store.js';
import type { SuiClient } from '../client.js';

const PKG = '0xpkg';
// Reads go through the registered store, so the client arg is unused.
const client = {} as unknown as SuiClient;

const COMMIT = `${PKG}::commitment::CommitmentCreated`;
const JOIN = `${PKG}::event::CharacterJoinedEvent`;
const BUDGET = `${PKG}::event::BudgetEventPushed`;

interface Row {
  f: Record<string, unknown>;
  txDigest?: string;
  eventSeq?: string;
}

/** Register a fake store of `type` events. Rows are listed NEWEST-FIRST; each
 *  gets a descending synthetic `timestampMs` so store order == list order. */
function seed(type: string, rows: Row[]): void {
  setEventStore(
    new MemoryEventStore(
      rows.map((r, i) => ({
        txDigest: r.txDigest ?? `tx${i}`,
        eventSeq: r.eventSeq ?? String(i),
        type,
        parsedJson: r.f,
        timestampMs: rows.length - i,
      })),
    ),
  );
}

afterEach(() => setEventStore(null));

// ── listCommitments: the read-window-critical collector ──────────────────────

test('listCommitments reads every field and preserves newest-first order', async () => {
  seed(COMMIT, [
    { f: { commitment_id: 'c1', saga_id: 's1', subject_id: 'sub1', committer: '0xA', committed_at_ms: 100 }, txDigest: 'txA', eventSeq: '1' },
    { f: { commitment_id: 'c2', saga_id: 's1', subject_id: 'sub2', committer: '0xB', committed_at_ms: 200 }, txDigest: 'txB', eventSeq: '2' },
  ]);

  const out = await listCommitments(client, PKG);

  assert.equal(out.length, 2);
  // order preserved exactly as the store returns it (descending) — never reordered
  assert.deepEqual(out.map((c) => c.commitmentId), ['c1', 'c2']);
  assert.deepEqual(out[0], {
    commitmentId: 'c1', sagaId: 's1', subjectId: 'sub1', committer: '0xA',
    committedAtMs: '100', txDigest: 'txA', eventSeq: '1',
  });
});

test('listCommitments filters event-side by subjectId', async () => {
  seed(COMMIT, [
    { f: { commitment_id: 'c1', subject_id: 'sub1', saga_id: 's1' } },
    { f: { commitment_id: 'c2', subject_id: 'sub2', saga_id: 's1' } },
    { f: { commitment_id: 'c3', subject_id: 'sub1', saga_id: 's2' } },
  ]);

  const out = await listCommitments(client, PKG, { subjectId: 'sub1' });
  assert.deepEqual(out.map((c) => c.commitmentId), ['c1', 'c3']);
});

test('listCommitments maxEvents caps the RESULT count (read-window semantics)', async () => {
  seed(COMMIT, [
    { f: { commitment_id: 'c1' } }, { f: { commitment_id: 'c2' } },
    { f: { commitment_id: 'c3' } }, { f: { commitment_id: 'c4' } },
  ]);

  const out = await listCommitments(client, PKG, { maxEvents: 2 });
  assert.deepEqual(out.map((c) => c.commitmentId), ['c1', 'c2']);
});

test('listCommitments skips events missing commitment_id', async () => {
  seed(COMMIT, [{ f: { saga_id: 's1' } }, { f: { commitment_id: 'c2' } }]);
  const out = await listCommitments(client, PKG);
  assert.deepEqual(out.map((c) => c.commitmentId), ['c2']);
});

test('findLatestCommitment returns the newest match (maxEvents=1)', async () => {
  seed(COMMIT, [{ f: { commitment_id: 'c1' } }, { f: { commitment_id: 'c2' } }]);
  const latest = await findLatestCommitment(client, PKG);
  assert.equal(latest?.commitmentId, 'c1');
});

// ── tallyJoins: the OTHER cap semantics (scanned, not matched) ────────────────

test('tallyJoins counts joins per event_id and caps on SCANNED events, not matches', async () => {
  // newest-first: e1, e1, e2 — maxEvents=2 scans only the first two (both 'e1')
  seed(JOIN, [{ f: { event_id: 'e1' } }, { f: { event_id: 'e1' } }, { f: { event_id: 'e2' } }]);

  const map = await tallyJoins(client, PKG, 2);
  assert.equal(map.get('e1'), 2);
  assert.equal(map.get('e2'), undefined);
});

// ── a second module, to show the filter/map pattern generalizes ──────────────

test('listBudgetEvents filters by saga + scene and maps counts', async () => {
  seed(BUDGET, [
    { f: { event_id: 'b1', saga_id: 's1', scene_id: 'sc1', participant_count: 3, card_count: 5, created_at_ms: 10 } },
    { f: { event_id: 'b2', saga_id: 's1', scene_id: 'sc2', participant_count: 1, card_count: 2, created_at_ms: 20 } },
  ]);

  const out = await listBudgetEvents(client, PKG, { sagaId: 's1', sceneId: 'sc1' });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    eventId: 'b1', sagaId: 's1', sceneId: 'sc1', participantCount: 3, cardCount: 5, createdAtMs: '10',
  });
});
