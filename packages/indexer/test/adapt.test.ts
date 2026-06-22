/**
 * Adapter tests: the RPC<->store translation that lets the sdk seam swap its
 * event source without touching callers. Pin the MoveEventType mapping, the
 * null fall-through for filters the store cannot serve, and the page shape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { rpcParamsToQuery, eventPageToRpc } from '../src/adapt.ts';

test('rpcParamsToQuery maps a MoveEventType filter to an EventQuery', () => {
  const q = rpcParamsToQuery({
    query: { MoveEventType: '0xp::event::E' },
    cursor: { txDigest: 'tx', eventSeq: '3' },
    limit: 20,
    order: 'descending',
  });
  assert.deepEqual(q, {
    moveEventType: '0xp::event::E',
    cursor: { txDigest: 'tx', eventSeq: '3' },
    limit: 20,
    order: 'descending',
  });
});

test('rpcParamsToQuery returns null for filters the store cannot serve', () => {
  assert.equal(rpcParamsToQuery({ query: { MoveModule: { package: '0xp', module: 'event' } } }), null);
  assert.equal(rpcParamsToQuery({ query: { All: [] } }), null);
  assert.equal(rpcParamsToQuery({ query: { MoveEventType: 123 } }), null, 'non-string type');
});

test('rpcParamsToQuery coerces null cursor/limit/order through cleanly', () => {
  const q = rpcParamsToQuery({ query: { MoveEventType: 'T' }, cursor: null, limit: null, order: null });
  assert.deepEqual(q, { moveEventType: 'T', cursor: null, limit: undefined, order: undefined });
});

test('eventPageToRpc shapes a store page like PaginatedEvents', () => {
  const rpc = eventPageToRpc({
    data: [{ id: { txDigest: 'a', eventSeq: '0' }, type: 'T', parsedJson: { x: 1 }, timestampMs: '5' }],
    hasNextPage: true,
    nextCursor: { txDigest: 'a', eventSeq: '0' },
  });
  assert.equal(rpc.hasNextPage, true);
  assert.deepEqual(rpc.data[0], {
    id: { txDigest: 'a', eventSeq: '0' },
    type: 'T',
    parsedJson: { x: 1 },
    timestampMs: '5',
  });
  assert.deepEqual(rpc.nextCursor, { txDigest: 'a', eventSeq: '0' });
});
