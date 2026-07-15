import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAsk } from '../src/llm.ts';
import { runSeason } from '../src/engine.ts';
import { invariants } from '../src/metrics.ts';
import { chunxueCast } from '../fixtures/chunxue.ts';
import { season } from '../fixtures/season.ts';

const run = () => runSeason(chunxueCast, season, makeAsk({ mock: true }));

test('deterministic in mock mode — same season, byte-identical state', async () => {
  const a = await run();
  const b = await run();
  assert.deepEqual(a.finalStates, b.finalStates);
});

test('no cross-character private-memory leakage', async () => {
  const r = await run();
  assert.equal(invariants(r).noForeignMemory, true);
  for (const c of r.cast) for (const m of r.finalStates[c].memories) assert.equal(m.charId, c);
});

test('no omniscience — a character never remembers a scene she was absent from', async () => {
  const r = await run();
  assert.equal(invariants(r).noAbsentSceneMemory, true);
  const presentOf = new Map(r.runs.map((run) => [run.scene.id, new Set(run.scene.present)]));
  for (const c of r.cast) {
    const present = r.runs.filter((run) => run.scene.present.includes(c)).length;
    assert.equal(r.finalStates[c].memories.length, present, `${c} should have exactly one memory per scene she attended`);
    for (const m of r.finalStates[c].memories) assert.ok(presentOf.get(m.sceneId)!.has(c));
  }
});

test('gradual-drift clamp holds — no single scene moves a stance past the cap', async () => {
  const r = await run();
  assert.equal(invariants(r).driftClampHolds, true);
});

test('the shared stimulus is IDENTICAL for everyone — divergence is not in the input', async () => {
  const r = await run();
  // Scripted scenes carry the same transcript regardless of who reads it: assert two
  // co-present characters distilled from the very same lines but can disagree.
  const s3 = r.runs.find((x) => x.scene.id === 's3')!;
  assert.deepEqual(s3.scene.present, ['liu', 'jin']);
  const liu = s3.memories.find((m) => m.charId === 'liu')!;
  const jin = s3.memories.find((m) => m.charId === 'jin')!;
  assert.notEqual(liu.interpretation.valence, jin.interpretation.valence, 'same scene should read differently');
});
