/**
 * Flux wire-decoding tests. The SSE decoder must survive chunk-split frames
 * and heartbeats; the message parser must pin the documented payload mapping
 * and the eventSeq-from-id identity decision (the part that makes capture
 * idempotent under replay).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SseDecoder, parseFluxMessage, fluxSeqFromId } from '../src/flux.ts';

const PKG_EVT = {
  type: 'package_event',
  timestamp_ms: 1730565189365,
  checkpoint_id: 75542359,
  tx_hash: 'Fw7Hk5bjtiYLVeZc6N5ZAeHur9tvfgNN6KQThD2AwFUg',
  data: {
    event_type: '0xpkg::event::BudgetEventPushed',
    sender: '0xabc',
    contents: { event_id: '0xevt', saga_id: '0xsaga', scene_id: '0xscene' },
  },
};
const sse = (id: string, body: object): string => `id: ${id}\ndata: ${JSON.stringify(body)}\n\n`;

test('SseDecoder emits a frame at the blank-line boundary', () => {
  const frames = new SseDecoder().push(sse('1730565189365-0', PKG_EVT));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].id, '1730565189365-0');
});

test('SseDecoder reassembles a frame split across two chunks', () => {
  const d = new SseDecoder();
  const text = sse('99-1', PKG_EVT);
  const mid = Math.floor(text.length / 2);
  assert.equal(d.push(text.slice(0, mid)).length, 0, 'no frame until the blank line arrives');
  const frames = d.push(text.slice(mid));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].id, '99-1');
});

test('SseDecoder ignores heartbeat comment lines', () => {
  assert.equal(new SseDecoder().push(': keepalive\n\n').length, 0);
});

test('parseFluxMessage maps the payload, eventSeq from the id suffix', () => {
  const [frame] = new SseDecoder().push(sse('1730565189365-7', PKG_EVT));
  const parsed = parseFluxMessage(frame);
  assert.ok(parsed);
  assert.equal(parsed.fluxId, '1730565189365-7');
  assert.deepEqual(parsed.event, {
    txDigest: 'Fw7Hk5bjtiYLVeZc6N5ZAeHur9tvfgNN6KQThD2AwFUg',
    eventSeq: '7',
    type: '0xpkg::event::BudgetEventPushed',
    parsedJson: { event_id: '0xevt', saga_id: '0xsaga', scene_id: '0xscene' },
    timestampMs: 1730565189365,
    sender: '0xabc',
    checkpoint: 75542359,
    sagaId: '0xsaga',
    sceneId: '0xscene',
  });
});

test('two events of one tx get distinct, ordered eventSeq from consecutive ids', () => {
  const d = new SseDecoder();
  const a = parseFluxMessage(d.push(sse('1000-0', PKG_EVT))[0]);
  const b = parseFluxMessage(d.push(sse('1000-1', PKG_EVT))[0]);
  assert.equal(a?.event.eventSeq, '0');
  assert.equal(b?.event.eventSeq, '1');
});

test('a frame without an id is skipped, not keyed', () => {
  assert.equal(parseFluxMessage({ data: JSON.stringify(PKG_EVT) }), null);
});

test('fluxSeqFromId rejects a non-numeric suffix loudly', () => {
  assert.throws(() => fluxSeqFromId('deadbeef'), /numeric suffix/);
});
