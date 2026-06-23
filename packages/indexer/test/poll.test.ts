/**
 * Poller-core tests. The contract: poll newest-first, ingest only what is
 * newer than the per-type high-water mark, stop at the mark, and be idempotent
 * on re-run. This is the self-hosted replacement for the Surflux feed, so it
 * must not double-count and must not silently skip.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { compareEvents } from '../src/page.ts';
import { MemoryEventStore } from '../src/memory-store.ts';
import { pollType, pollAllOnce, jsonRpcFetchPage } from '../src/poll.ts';
import type { FetchPage } from '../src/poll.ts';
import type { CapturedEvent } from '../src/types.ts';

const ev = (type: string, ts: number, tx: string, seq = '0'): CapturedEvent => ({
  txDigest: tx,
  eventSeq: seq,
  type,
  parsedJson: {},
  timestampMs: ts,
});

/** A fake descending-cursor source over a fixed event set, for one type. */
function fakeSource(all: CapturedEvent[], pageSize = 2): FetchPage {
  const sorted = [...all].sort(compareEvents).reverse();
  return async (type, cursor) => {
    const ofType = sorted.filter((e) => e.type === type);
    let start = 0;
    if (cursor) {
      const i = ofType.findIndex((e) => e.txDigest === cursor.txDigest && e.eventSeq === cursor.eventSeq);
      start = i >= 0 ? i + 1 : ofType.length;
    }
    const slice = ofType.slice(start, start + pageSize);
    const last = slice[slice.length - 1];
    return {
      events: slice,
      nextCursor: last ? { txDigest: last.txDigest, eventSeq: last.eventSeq } : null,
      hasNextPage: start + pageSize < ofType.length,
    };
  };
}

const sink = (store: MemoryEventStore) => (e: CapturedEvent) => {
  store.insert(e);
  return Promise.resolve();
};

test('pollType ingests every new event and reports the newest as the mark', async () => {
  const all = [ev('T', 1, 'a'), ev('T', 2, 'b'), ev('T', 3, 'c'), ev('T', 4, 'd'), ev('T', 5, 'e')];
  const store = new MemoryEventStore();
  const { newHwm, ingested } = await pollType(fakeSource(all), sink(store), 'T', null);
  assert.equal(ingested, 5);
  assert.equal(store.size, 5);
  assert.deepEqual(newHwm, { txDigest: 'e', eventSeq: '0', timestampMs: 5 });
});

test('pollType is idempotent: re-polling with the mark ingests nothing', async () => {
  const all = [ev('T', 1, 'a'), ev('T', 2, 'b'), ev('T', 3, 'c')];
  const store = new MemoryEventStore();
  const fp = fakeSource(all);
  const first = await pollType(fp, sink(store), 'T', null);
  const second = await pollType(fp, sink(store), 'T', first.newHwm);
  assert.equal(second.ingested, 0);
  assert.equal(store.size, 3);
});

test('pollType ingests only events strictly newer than the mark', async () => {
  const all = [ev('T', 1, 'a'), ev('T', 2, 'b'), ev('T', 3, 'c'), ev('T', 4, 'd')];
  const store = new MemoryEventStore();
  const hwm = { txDigest: 'b', eventSeq: '0', timestampMs: 2 };
  const { ingested } = await pollType(fakeSource(all), sink(store), 'T', hwm);
  assert.equal(ingested, 2);
  const ids = (await store.queryEvents({})).data.map((r) => r.id.txDigest).sort();
  assert.deepEqual(ids, ['c', 'd']);
});

test('pollAllOnce threads an independent mark per event type', async () => {
  const all = [ev('A', 1, 'a'), ev('B', 2, 'b'), ev('A', 3, 'c')];
  const store = new MemoryEventStore();
  const marks = new Map();
  const total = await pollAllOnce(fakeSource(all), sink(store), ['A', 'B'], marks);
  assert.equal(total, 3);
  assert.equal(marks.get('A')?.txDigest, 'c');
  assert.equal(marks.get('B')?.txDigest, 'b');
});

test('jsonRpcFetchPage maps SuiEvent rows to CapturedEvents', async () => {
  const client = {
    queryEvents: async () => ({
      data: [
        {
          id: { txDigest: 'tx', eventSeq: '2' },
          type: '0xp::event::E',
          parsedJson: { saga_id: '0xs' },
          timestampMs: '123',
          sender: '0xz',
        },
      ],
      hasNextPage: false,
      nextCursor: null,
    }),
  };
  const [event] = (await jsonRpcFetchPage(client)('0xp::event::E', null)).events;
  assert.deepEqual(event, {
    txDigest: 'tx',
    eventSeq: '2',
    type: '0xp::event::E',
    parsedJson: { saga_id: '0xs' },
    timestampMs: 123,
    sender: '0xz',
    sagaId: '0xs',
    sceneId: undefined,
  });
});
