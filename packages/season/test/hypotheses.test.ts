import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAsk } from '../src/llm.ts';
import { runSeason } from '../src/engine.ts';
import { analyze } from '../src/metrics.ts';
import { chunxueCast } from '../fixtures/chunxue.ts';
import { season, seasonWithoutPivotal, PIVOTAL_SCENE_ID } from '../fixtures/season.ts';

const ask = makeAsk({ mock: true });
const full = await runSeason(chunxueCast, season, ask);
const ablated = await runSeason(chunxueCast, seasonWithoutPivotal, ask);
const a = analyze(full, ablated, { pivotalId: PIVOTAL_SCENE_ID, pivotalDay: 3, focus: 'jin', probeSceneId: 's5' });

test('M1 — one shared event forms mutually-inconsistent memories', () => {
  assert.ok(a.divergence.rate >= 0.6, `divergence rate ${a.divergence.rate}`);
  // the pivotal affair: 柳生春 testing / 金鳳 evasive / 蘇映雪 threatening — three readings.
  const valences = new Set(a.divergence.affair.map((x) => x.valence));
  assert.ok(valences.size >= 3, `affair should be read ≥3 ways, got ${[...valences].join(',')}`);
});

test('M2 — anonymous actions are re-identifiable to their author', () => {
  assert.ok(a.reId.accuracy >= 0.8, `re-id accuracy ${a.reId.accuracy}`);
  assert.ok(a.reId.accuracy > a.reId.chance);
});

test('M3 — past experience causally changes the later choice (ablation)', () => {
  assert.equal(a.causal.changed, true);
  assert.equal(a.causal.withPivotal?.move, 'confront');
  assert.equal(a.causal.withoutPivotal?.move, 'observe');
});

test('M4 — misunderstanding + cognitive gap is preserved, not reconciled', () => {
  assert.equal(a.misunderstanding.distinctAtPivot, true);
  assert.equal(a.misunderstanding.gapPersists, true);
  assert.equal(a.misunderstanding.opposedStances, true);
});

test('M5 — personality drifts gradually, never flips on one scene', () => {
  assert.equal(a.drift.clampHolds, true);
  assert.ok(a.drift.perSceneMaxStep <= full.config.maxStanceStep + 1e-6);
  assert.equal(a.drift.gradual, true);
  assert.ok(a.drift.topDrift.steps >= 2, 'the biggest drift must accrue over ≥2 scenes');
});

test('M6 — the season leaves future-redeemable promises/grudges/questions/risks', () => {
  assert.ok(a.ledger.opened >= 3);
  assert.ok(a.ledger.redeemed >= 1);
  // 金鳳's open question from the pivotal scene is what her later confrontation pays off.
  assert.ok(a.ledger.redemptions.some((x) => x.charId === 'jin'));
});

test('the whole gate is green in deterministic mode', () => {
  assert.equal(a.allPass, true, a.checks.filter((c) => !c.pass).map((c) => c.id).join('; '));
});
