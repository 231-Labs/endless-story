// Pure unit tests for the production service's anchor header (es:production).
//
// Node-clean import graph: only ./prompt.ts (pure, no chain/llm/sdk), so this
// runs under `node --test` with zero workspace deps — same pattern as
// event-chapter-compiler.test.ts (which tests weave.ts, not index.ts).
// The full runOnce orchestration reuses @endless-story/troupe (verified there)
// + sign-and-anchor; it runs under the web bundler / tsx, not node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  embedProductionHeader,
  parseProductionHeader,
  type ProductionHeader,
} from '../src/services/production/prompt.ts';

const HEADER: ProductionHeader = {
  v: 1,
  kind: 'production',
  productionId: 'prod_baishe_full',
  classicKey: 'baishe_full',
  classicSource: '白蛇傳',
  title: '白蛇傳·全本',
  castIds: ['huadan', 'kunsheng', 'wudan', 'jing_pei'],
  day: 7,
};

test('embed → parse round-trips the production header', () => {
  const doc = '# 春雪社 · 戲折\n班底…';
  const blob = embedProductionHeader(doc, HEADER);
  const { header, body } = parseProductionHeader(blob);
  assert.deepEqual(header, HEADER);
  assert.equal(body, doc); // body recovered without the header
});

test('cast ids (co-authors) survive the round-trip — shared-IP provenance', () => {
  const { header } = parseProductionHeader(embedProductionHeader('x', HEADER));
  assert.deepEqual(header?.castIds, ['huadan', 'kunsheng', 'wudan', 'jing_pei']);
  assert.equal(header?.kind, 'production');
});

test('no header → body unchanged, header undefined', () => {
  const { header, body } = parseProductionHeader('plain 戲折, no header');
  assert.equal(header, undefined);
  assert.equal(body, 'plain 戲折, no header');
});

test('malformed header → graceful (no throw), body kept', () => {
  const { header, body } = parseProductionHeader('<!--es:production {bad json} -->\nbody');
  assert.equal(header, undefined);
  assert.match(body, /es:production/); // unparseable header left in place, never throws
});
