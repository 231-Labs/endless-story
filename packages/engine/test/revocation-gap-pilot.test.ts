/**
 * Engine-side deterministic coverage for the revocation-gap pilot operators.
 * Keeps CI green even when the gitignored internal/ tree is absent from a
 * checkout that only runs packages/engine tests — this file is self-contained.
 *
 * Mirrors C0 (ledger+lease) vs C7 (key rekey + homeByChar clear + memory note)
 * and asserts a shared warm-up checkpoint is byte-identical before branching.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { seedHousing } from '../src/core/housing.ts';
import { newWant } from '../src/core/want-core.ts';
import { auditSeasonEconomy, type SeasonEconomyData } from '../src/core/season-economy.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type CastMember, type WorldStateData } from '../src/world-state.ts';
import type { ArchivePort } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };

function member(id: string, name: string, over: Partial<CastMember> = {}): CastMember {
  return {
    id,
    name,
    persona: name,
    gender: '女',
    state: { fatigue: 0, hunger: 0, mood: 0 },
    coreIdentity: [],
    relationshipView: {},
    ...over,
  };
}

function acct(id: string, label: string, yuan: number, ownerType: 'character' | 'troupe' | 'business' = 'character') {
  return {
    id,
    ownerType,
    label,
    available: (BigInt(yuan) * 100n).toString(),
    reserved: '0',
    dailyFixedCost: '0',
    authorizedSpenderIds: [] as string[],
  };
}

function economy(): SeasonEconomyData {
  const accounts = [
    acct('market', '市面', 0, 'business'),
    acct('troupe', '班庫', 0, 'troupe'),
    acct('O', '屋主', 10),
    acct('T', '租客', 10),
    acct('N', '親人', 10),
  ];
  const map: Record<string, (typeof accounts)[number]> = {};
  let injected = 0n;
  for (const a of accounts) {
    map[a.id] = a;
    injected += BigInt(a.available);
  }
  return {
    unitLabel: '圓',
    subunitsPerUnit: 100,
    marketAccountId: 'market',
    troupeAccountId: 'troupe',
    noticeSceneName: '街',
    wages: [],
    catalog: [],
    contractObjectIds: {},
    state: { day: 1, accounts: map, ledger: [], injected: injected.toString(), settledDays: [] },
    contracts: {},
  };
}

function makePilotWorld(): WorldState {
  const base: WorldStateData = {
    sagaId: 'revocation-gap-engine-test',
    sagaPremise: 'engine mirror of revocation-gap pilot seed',
    cast: [
      member('O', '屋主', { relationshipView: { T: '向我租了廂房的住戶' } }),
      member('T', '租客', { gender: '男', relationshipView: { O: '我租住廂房' } }),
      member('N', '親人', { relationshipView: { T: '住在廂房的租客' } }),
    ],
    scenes: [
      { id: 'P', name: '街', privacyLevel: 1 },
      { id: 'S', name: '廂房', privacyLevel: 3 },
      { id: 'H', name: '主宅', privacyLevel: 3 },
    ],
    roster: { O: 'P', T: 'P', N: 'P' },
    homeByChar: { O: 'H', T: 'S', N: 'P' },
    workByChar: { O: 'P', T: 'P', N: 'P' },
    wants: [
      newWant({
        characterId: 'T',
        layer: '住處',
        desc: '守住我在廂房的日子',
        weight: 0.6,
        sat: 0.3,
        resistance: 2,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
      }),
    ],
    edges: {},
    bonds: [],
    establishedPairs: [],
    clock: makeClock(6, 0),
    lastMovedTickByChar: {},
    dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
    contestedResources: [],
    objects: [],
    economy: economy(),
    strictStructured: true,
    accessSeeded: true,
  };
  const world = new WorldState(base);
  seedHousing(world, [
    { sceneName: '主宅', ownerNames: ['屋主'] },
    { sceneName: '廂房', ownerNames: ['屋主'], lease: { tenantName: '租客', keyObjectId: 'key-S' } },
  ]);
  world.grantAccess('S', 'N', 'standing');
  return world;
}

function applyC0(world: WorldState): void {
  world.revokeAccess('S', 'T');
  if (world.data.leases) delete world.data.leases['S'];
}

function applyC7PhysicalSocial(world: WorldState): void {
  for (const obj of world.data.objects ?? []) {
    if (obj.keyFor === 'S') {
      obj.keyFor = undefined;
      obj.state = '舊鑰，鎖已換過';
    }
  }
  world.data.homeByChar['T'] = 'P';
  for (const m of world.data.cast) {
    for (const [peer, view] of Object.entries(m.relationshipView)) {
      if (typeof view === 'string' && (view.includes('廂房') || view.includes('租'))) {
        m.relationshipView[peer] = '租約已終，不再是住戶。';
      }
    }
  }
}

test('revocation-gap C0: canEnter false but key + home remain', () => {
  const world = makePilotWorld();
  assert.equal(world.canEnter('T', 'S'), true);
  applyC0(world);
  assert.equal(world.canEnter('T', 'S'), false);
  assert.equal(world.objectById('key-S')?.keyFor, 'S');
  assert.equal(world.data.homeByChar['T'], 'S');
  assert.equal(world.data.leases?.['S'], undefined);
  assert.deepEqual(auditSeasonEconomy(world), []);
});

test('revocation-gap C7: key rekeyed + social dwelling cleared + memory note', async () => {
  const world = makePilotWorld();
  const recall = new LocalRecall(undefined, { embeddings: 'deterministic' });
  await recall.remember('T', '舊識：我住廂房', { kind: 'genesis', importance: 5, day: 1 });
  applyC0(world);
  applyC7PhysicalSocial(world);
  await recall.remember('T', '〔權威失效〕租客已遷出廂房，不再持有出入之權', {
    kind: 'observation',
    importance: 9,
    day: world.data.clock.day,
  });
  await recall.remember('O', '〔權威失效〕租客已遷出廂房，不再持有出入之權', {
    kind: 'observation',
    importance: 9,
    day: world.data.clock.day,
  });
  await recall.remember('N', '〔權威失效〕租客已遷出廂房，不再持有出入之權', {
    kind: 'observation',
    importance: 9,
    day: world.data.clock.day,
  });

  assert.equal(world.canEnter('T', 'S'), false);
  assert.equal(world.objectById('key-S')?.keyFor, undefined);
  assert.equal(world.data.homeByChar['T'], 'P');
  const mems = await recall.listMemories('T');
  assert.ok(mems.some((m) => m.content.includes('舊識')));
  assert.ok(mems.some((m) => m.content.includes('權威失效')));
  assert.deepEqual(auditSeasonEconomy(world), []);
});

test('revocation-gap: C0 and C7 share the same warm-up checkpoint', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'revgap-engine-'));
  const warmup = path.join(tmp, 'warmup');
  fs.mkdirSync(warmup);
  const world = makePilotWorld();
  const recall = new LocalRecall(warmup, { embeddings: 'deterministic' });
  const deps = {
    agent: new FakeSceneAgent(),
    recall,
    archive: nullArchive,
    clock: new LocalClock(),
    economy: new LocalEconomy(),
  };
  await runTick(world, deps, { snapshotDir: warmup, log: () => {} });
  await runTick(world, deps, { snapshotDir: warmup, log: () => {} });
  world.snapshot(warmup);

  const c0 = path.join(tmp, 'C0');
  const c7 = path.join(tmp, 'C7');
  fs.mkdirSync(c0);
  fs.mkdirSync(c7);
  fs.copyFileSync(path.join(warmup, 'world.json'), path.join(c0, 'world.json'));
  fs.copyFileSync(path.join(warmup, 'world.json'), path.join(c7, 'world.json'));
  fs.copyFileSync(path.join(warmup, 'recall.json'), path.join(c0, 'recall.json'));
  fs.copyFileSync(path.join(warmup, 'recall.json'), path.join(c7, 'recall.json'));

  assert.deepEqual(
    fs.readFileSync(path.join(c0, 'world.json')),
    fs.readFileSync(path.join(c7, 'world.json')),
    'shared warm-up checkpoint must be byte-identical before condition ops',
  );

  const w0 = WorldState.restore(c0);
  const w7 = WorldState.restore(c7);
  applyC0(w0);
  applyC0(w7);
  applyC7PhysicalSocial(w7);

  assert.equal(w0.canEnter('T', 'S'), false);
  assert.equal(w7.canEnter('T', 'S'), false);
  assert.equal(w0.objectById('key-S')?.keyFor, 'S');
  assert.equal(w7.objectById('key-S')?.keyFor, undefined);
  assert.deepEqual(auditSeasonEconomy(w0), []);
  assert.deepEqual(auditSeasonEconomy(w7), []);
});
