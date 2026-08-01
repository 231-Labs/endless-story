/**
 * Deterministic unit tests for C0 / C7 revocation ops + shared warm-up checkpoint.
 * Zero credentials. Run: `pnpm --filter revocation-gap test` or
 * `node --test --import tsx internal/research/revocation-gap/revoke.test.ts`
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { FakeSceneAgent } from '../../../packages/engine/src/adapters/local/fake-scene-agent.ts';
import { LocalClock } from '../../../packages/engine/src/adapters/local/clock.ts';
import { LocalEconomy } from '../../../packages/engine/src/adapters/local/local-economy.ts';
import { LocalRecall } from '../../../packages/engine/src/adapters/local/local-recall.ts';
import { auditSeasonEconomy } from '../../../packages/engine/src/core/season-economy.ts';
import { runTick } from '../../../packages/engine/src/tick.ts';
import type { ArchivePort } from '../../../packages/engine/src/ports.ts';

import { cloneCheckpoint, restoreCheckpoint } from './checkpoint.ts';
import { IDS } from './ids.ts';
import { applyC0, applyCondition, clearSocialDwellingRecords, rekeyPhysicalLocks } from './revoke.ts';
import { buildScenarioWorld, cloneWorld } from './scenario.ts';

const nullArchive: ArchivePort = { commit: async () => {} };

test('seed: housing layers + N canEnter + economy conserves', () => {
  const world = buildScenarioWorld();
  assert.equal(world.canEnter(IDS.tenant, IDS.rental), true);
  assert.equal(world.canEnter(IDS.neighbor, IDS.rental), true);
  assert.equal(world.canEnter(IDS.owner, IDS.rental), true);
  assert.equal(world.data.homeByChar[IDS.tenant], IDS.rental);
  assert.equal(world.data.leases?.[IDS.rental]?.tenantId, IDS.tenant);
  assert.equal(world.objectById(IDS.key)?.keyFor, IDS.rental);
  assert.equal(world.objectById(IDS.key)?.carriedBy, IDS.tenant);
  assert.equal(world.data.strictStructured, true);
  assert.deepEqual(auditSeasonEconomy(world), []);
});

test('C0: canEnter false, key + homeByChar + relationship prose remain', () => {
  const world = buildScenarioWorld();
  applyC0(world);
  assert.equal(world.canEnter(IDS.tenant, IDS.rental), false, 'cryptographic revoke holds');
  assert.equal(world.data.leases?.[IDS.rental], undefined);
  assert.equal(world.objectById(IDS.key)?.keyFor, IDS.rental, 'physical key residual');
  assert.equal(world.data.homeByChar[IDS.tenant], IDS.rental, 'social home residual');
  const ownerView = world.data.cast.find((c) => c.id === IDS.owner)!.relationshipView[IDS.tenant];
  assert.match(ownerView, /租/);
  assert.deepEqual(auditSeasonEconomy(world), []);
});

test('C7: key rekeyed, social dwelling cleared, memory notes appended', async () => {
  const world = buildScenarioWorld();
  const recall = new LocalRecall(undefined, { embeddings: 'deterministic' });
  // Seed a pre-existing memory so invalidation is append-only.
  await recall.remember(IDS.tenant, '我住在廂房。', { kind: 'genesis', importance: 5, day: 1 });

  const result = await applyCondition(world, 'C7', recall);
  assert.equal(result.canEnterAfter, false);
  assert.equal(world.objectById(IDS.key)?.keyFor, undefined, '換鎖: keyFor cleared');
  assert.equal(world.data.homeByChar[IDS.tenant], IDS.street, 'homeByChar cleared off S');
  assert.equal(world.data.leases?.[IDS.rental], undefined);
  assert.equal(result.memoryNotesWritten, 3);

  const mems = await recall.listMemories(IDS.tenant);
  assert.ok(mems.some((m) => m.content.includes('我住在廂房')), 'old memory kept');
  assert.ok(mems.some((m) => m.content.includes('權威失效')), 'invalidation appended');
  assert.deepEqual(auditSeasonEconomy(world), []);
});

test('C0 vs C7 share identical warm-up checkpoint bytes', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'revgap-'));
  const warmup = path.join(tmp, 'warmup');
  fs.mkdirSync(warmup);

  const world = buildScenarioWorld();
  const recall = new LocalRecall(warmup, { embeddings: 'deterministic' });
  const deps = {
    agent: new FakeSceneAgent(),
    recall,
    archive: nullArchive,
    clock: new LocalClock(),
    economy: new LocalEconomy(),
  };
  // Short warm-up (2 ticks) — enough to prove shared checkpoint, not the pilot W=20.
  for (let i = 0; i < 2; i++) {
    await runTick(world, deps, { snapshotDir: warmup, log: () => {} });
  }
  world.snapshot(warmup);

  const c0Dir = path.join(tmp, 'C0');
  const c7Dir = path.join(tmp, 'C7');
  cloneCheckpoint(warmup, c0Dir);
  cloneCheckpoint(warmup, c7Dir);

  const warmBytes = fs.readFileSync(path.join(warmup, 'world.json'));
  assert.deepEqual(fs.readFileSync(path.join(c0Dir, 'world.json')), warmBytes);
  assert.deepEqual(fs.readFileSync(path.join(c7Dir, 'world.json')), warmBytes);
  assert.deepEqual(
    fs.readFileSync(path.join(c0Dir, 'recall.json')),
    fs.readFileSync(path.join(c7Dir, 'recall.json')),
  );

  const c0 = restoreCheckpoint(c0Dir);
  const c7 = restoreCheckpoint(c7Dir);
  await applyCondition(c0.world, 'C0', c0.recall);
  await applyCondition(c7.world, 'C7', c7.recall);

  // Divergence only after condition ops.
  assert.notEqual(c0.world.objectById(IDS.key)?.keyFor, c7.world.objectById(IDS.key)?.keyFor);
  assert.equal(c0.world.data.homeByChar[IDS.tenant], IDS.rental);
  assert.equal(c7.world.data.homeByChar[IDS.tenant], IDS.street);
  assert.deepEqual(auditSeasonEconomy(c0.world), []);
  assert.deepEqual(auditSeasonEconomy(c7.world), []);
});

test('rekey + clearSocial are idempotent-safe helpers', () => {
  const world = buildScenarioWorld();
  applyC0(world);
  rekeyPhysicalLocks(world);
  rekeyPhysicalLocks(world);
  clearSocialDwellingRecords(world);
  clearSocialDwellingRecords(world);
  assert.equal(world.objectById(IDS.key)?.keyFor, undefined);
  assert.equal(world.data.homeByChar[IDS.tenant], IDS.street);
});

test('cloneWorld deep-copies so C0 mutation cannot bleed into sibling', () => {
  const a = buildScenarioWorld();
  const b = cloneWorld(a);
  applyC0(b);
  assert.equal(a.canEnter(IDS.tenant, IDS.rental), true);
  assert.equal(b.canEnter(IDS.tenant, IDS.rental), false);
});
