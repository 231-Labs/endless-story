/**
 * Pagination-contract tests. The load-bearing property is that threading
 * `nextCursor` walks the ENTIRE matching set once: no duplicates, no gaps.
 * That is exactly the invariant the live RPC read path keeps getting wrong
 * under load (a fixed window buries rare feed items; a 429 truncates a
 * scan), and the reason settlement reads went dry. The store must not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { compareEvents, pageEvents } from '../src/page.ts';
import { MemoryEventStore } from '../src/memory-store.ts';
import type { EventCursor, EventQuery, StoredEvent } from '../src/types.ts';

const PKG = '0xpkg';
const ev = (type: string, ts: number, tx: string, seq = '0'): StoredEvent => ({
  txDigest: tx,
  eventSeq: seq,
  type: `${PKG}::event::${type}`,
  parsedJson: { tx, ts },
  timestampMs: ts,
});

/** Drain a query by following nextCursor until the store says stop. */
async function drain(store: MemoryEventStore, query: EventQuery): Promise<StoredEvent['txDigest'][]> {
  const ids: string[] = [];
  let cursor: EventCursor | null = query.cursor ?? null;
  for (;;) {
    const page = await store.queryEvents({ ...query, cursor });
    for (const row of page.data) ids.push(`${row.id.txDigest}:${row.id.eventSeq}`);
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return ids;
}

test('filters by moveEventType, leaving other types untouched', async () => {
  const store = new MemoryEventStore([
    ev('Pushed', 1, 'a'),
    ev('Joined', 2, 'b'),
    ev('Pushed', 3, 'c'),
    ev('Resolved', 4, 'd'),
  ]);
  const page = await store.queryEvents({ moveEventType: `${PKG}::event::Pushed` });
  assert.deepEqual(
    page.data.map((r) => r.id.txDigest),
    ['c', 'a'],
    'only Pushed, newest-first',
  );
});

test('default order is descending (newest-first), matching the RPC call sites', async () => {
  const store = new MemoryEventStore([ev('E', 10, 'a'), ev('E', 30, 'c'), ev('E', 20, 'b')]);
  const page = await store.queryEvents({});
  assert.deepEqual(page.data.map((r) => r.id.txDigest), ['c', 'b', 'a']);
});

test('ascending order is supported and is the exact reverse', async () => {
  const rows = [ev('E', 10, 'a'), ev('E', 30, 'c'), ev('E', 20, 'b')];
  const store = new MemoryEventStore(rows);
  const asc = await store.queryEvents({ order: 'ascending' });
  assert.deepEqual(asc.data.map((r) => r.id.txDigest), ['a', 'b', 'c']);
});

test('cursor paging walks the entire set once — no duplicates, no gaps', async () => {
  // 50 events, awkward limit so pages do not divide evenly.
  const rows = Array.from({ length: 50 }, (_, i) =>
    ev('E', 1000 + i, `tx${String(i).padStart(2, '0')}`),
  );
  const store = new MemoryEventStore(rows);

  const walked = await drain(store, { moveEventType: `${PKG}::event::E`, limit: 7 });

  assert.equal(walked.length, 50, 'every event surfaced exactly once');
  assert.equal(new Set(walked).size, 50, 'no duplicates across pages');

  // Must equal the full canonical descending order.
  const expected = [...rows]
    .sort(compareEvents)
    .reverse()
    .map((e) => `${e.txDigest}:${e.eventSeq}`);
  assert.deepEqual(walked, expected, 'continuous descending walk, no reordering at page seams');
});

test('a rare type is never buried by a flood of a frequent type', async () => {
  // Reproduces the read-window regression: rare items (e.g. a folio) drown
  // among frequent ones (e.g. a daily gazette) under a fixed window. With a
  // per-type filter + cursor paging, every rare row must still be reachable.
  const rows: StoredEvent[] = [];
  let ts = 0;
  for (let i = 0; i < 200; i++) {
    rows.push(ev('Gazette', ts++, `g${i}`));
    if (i % 50 === 0) rows.push(ev('Folio', ts++, `f${i}`)); // 4 rare rows, oldest first
  }
  const store = new MemoryEventStore(rows);

  const folios = await drain(store, { moveEventType: `${PKG}::event::Folio`, limit: 2 });
  assert.deepEqual(
    folios.sort(),
    ['f0:0', 'f100:0', 'f150:0', 'f50:0'],
    'all four folios reachable despite 200 interleaved gazettes',
  );
});

test('hasNextPage is false exactly when the last page is reached', async () => {
  const store = new MemoryEventStore(Array.from({ length: 10 }, (_, i) => ev('E', i, `t${i}`)));
  const first = await store.queryEvents({ limit: 10 });
  assert.equal(first.hasNextPage, false, 'a full single page has no next page');

  const partial = await store.queryEvents({ limit: 4 });
  assert.equal(partial.hasNextPage, true);
});

test('an unknown cursor yields an empty tail, not a silent restart', async () => {
  const store = new MemoryEventStore([ev('E', 1, 'a'), ev('E', 2, 'b')]);
  const page = await store.queryEvents({ cursor: { txDigest: 'ghost', eventSeq: '9' } });
  assert.equal(page.data.length, 0);
  assert.equal(page.hasNextPage, false);
  assert.equal(page.nextCursor, null);
});

test('insert is idempotent on (txDigest, eventSeq)', async () => {
  const store = new MemoryEventStore();
  store.insert(ev('E', 1, 'a'));
  store.insert(ev('E', 1, 'a')); // replay
  store.insert({ ...ev('E', 1, 'a'), parsedJson: { revised: true } }); // re-emit, same id
  assert.equal(store.size, 1, 'same id never duplicates');
  const page = await store.queryEvents({});
  assert.deepEqual(page.data[0].parsedJson, { revised: true }, 'last write wins');
});
