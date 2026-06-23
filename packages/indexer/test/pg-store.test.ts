/**
 * SQL-builder tests for the Postgres store. These pin the keyset-pagination
 * SQL and bind values without a database; the page.ts tests already prove
 * the semantics that this SQL is meant to reproduce. A live-database smoke
 * test is added once DATABASE_URL is wired.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPageQuery, splitType } from '../src/pg.ts';

test('default page: descending, no filter, limit+1 probe', () => {
  const { text, values } = buildPageQuery({});
  assert.deepEqual(values, [51], '50 default + 1 probe row');
  assert.doesNotMatch(text, /WHERE/, 'no filter, no cursor -> no WHERE');
  assert.match(text, /ORDER BY e\.timestamp_ms DESC, e\.tx_digest DESC, e\.event_seq::bigint DESC/);
  assert.match(text, /LIMIT \$1/);
});

test('moveEventType binds as the first parameter', () => {
  const { text, values } = buildPageQuery({ moveEventType: '0xp::event::Pushed', limit: 10 });
  assert.deepEqual(values, ['0xp::event::Pushed', 11]);
  assert.match(text, /WHERE e\.event_type = \$1/);
  assert.match(text, /LIMIT \$2/);
});

test('ascending order flips both the sort and the comparator', () => {
  const { text } = buildPageQuery({ cursor: { txDigest: 'a', eventSeq: '1' }, order: 'ascending' });
  assert.match(text, /ORDER BY e\.timestamp_ms ASC/);
  assert.match(text, /\) > \(SELECT/, 'ascending walks forward');
});

test('cursor adds a keyset predicate resolved by PK subquery', () => {
  const { text, values } = buildPageQuery({
    moveEventType: 'T',
    cursor: { txDigest: 'tx9', eventSeq: '3' },
    limit: 5,
  });
  assert.deepEqual(values, ['T', 'tx9', '3', 6]);
  assert.match(
    text,
    /\(e\.timestamp_ms, e\.tx_digest, e\.event_seq::bigint\) < \(SELECT/,
    'descending keyset compares the canonical tuple',
  );
  assert.match(text, /WHERE c\.tx_digest = \$2 AND c\.event_seq = \$3/);
});

test('splitType peels package and module off a fully-qualified type', () => {
  assert.deepEqual(splitType('0xabc::event::BudgetEventPushed'), ['0xabc', 'event']);
  assert.deepEqual(splitType('weird'), ['weird', '']);
});
