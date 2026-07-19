/**
 * Movement distance-cost (A) + 路遇 en-route interception (B) — plumbing tests.
 * Deterministic: A is pure math on district grouping; B is driven by a bespoke
 * transitReact stub (the default fake omits transitReact, so B never fires on
 * the deterministic path — the reason the 154-test smoke stays untouched).
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { createWorldFromPreset } from '../src/preset.ts';
import { runTick } from '../src/tick.ts';
import { newWant } from '../src/core/want-core.ts';
import type { ArchivePort, MoveDecideInput, MoveDecideResult, TransitReactInput, TransitReaction } from '../src/ports.ts';

const quiet = () => {};
const nullArchive: ArchivePort = { commit: async () => {} };

async function freshWorld() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-move-'));
    const recall = new LocalRecall(path.join(dir, 'memory'));
    const { world } = await createWorldFromPreset('spring-snow', recall, { ticksPerDay: 6 });
    return { world, deps: { agent: new FakeSceneAgent(), recall, archive: nullArchive, clock: new LocalClock() }, dir };
}
const sceneId = (world: Awaited<ReturnType<typeof freshWorld>>['world'], name: string) =>
    world.data.scenes.find((s) => s.name === name)!.id;

class MoverAgent extends FakeSceneAgent {
    moverName: string;
    targetSceneId: string;
    constructor(moverName: string, targetSceneId: string) {
        super();
        this.moverName = moverName;
        this.targetSceneId = targetSceneId;
    }
    async decideMove(input: MoveDecideInput): Promise<MoveDecideResult> {
        if (input.name !== this.moverName) return { move: false, reason: 'stay' };
        const target = input.options.find((o) => o.sceneId === this.targetSceneId);
        return target ? { move: true, targetSceneId: target.sceneId, reason: 'go' } : { move: false, reason: 'blocked' };
    }
}

/** A mover that also reacts to the road — engages iff the person seen is `engageWith`. */
class WaylaidAgent extends MoverAgent {
    engageWith: string;
    constructor(moverName: string, targetSceneId: string, engageWith: string) {
        super(moverName, targetSceneId);
        this.engageWith = engageWith;
    }
    async transitReact(input: TransitReactInput): Promise<TransitReaction> {
        return input.seenName === this.engageWith ? { act: 'engage', word: '你且慢走' } : { act: 'pass' };
    }
}

test('spatial helpers: scenes carry districts; gates + waypoints derive from them', async () => {
    const { world, dir } = await freshWorld();
    const stage = sceneId(world, '雲錦台戲台'); // 雲錦台 district
    const dressing = sceneId(world, '後台妝閣'); // same district
    const street = sceneId(world, '戲園前街'); // 霞飛路 district
    assert.equal(world.sameDistrict(stage, dressing), true, 'stage + dressing room are one place');
    assert.equal(world.sameDistrict(stage, street), false, 'stage + street are across town');
    assert.equal(world.nearby(stage, dressing), true);
    assert.equal(world.nearby(stage, street), false);
    // a cross-district journey passes at least one public throat; a same-district hop passes none
    assert.equal(world.transitWaypoints(stage, dressing).length, 0, 'no road within a district');
    assert.ok(world.transitWaypoints(street, dressing).length > 0, 'a cross-town trip walks a road');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('A — a cross-district trip books rest; a same-district hop books none', async () => {
    // cross-district: 柳安春 walks from a 霞飛路 scene into 雲錦台
    const far = await freshWorld();
    const liu = far.world.idByName('柳安春')!;
    far.world.data.roster[liu] = sceneId(far.world, '戲園前街'); // district 霞飛路
    far.world.data.clock = makeClock(6, 1); // 日午 (daytime)
    await runTick(far.world, { ...far.deps, agent: new MoverAgent('柳安春', sceneId(far.world, '雲錦台戲台')) }, { log: quiet });
    assert.equal(far.world.data.roster[liu], sceneId(far.world, '雲錦台戲台'), 'the far trip completed');
    assert.ok(far.world.data.restUntilTickByChar?.[liu] !== undefined, 'a cross-district trip books a rest window');
    fs.rmSync(far.dir, { recursive: true, force: true });

    // same-district: a few steps within 雲錦台 — no rest booked
    const near = await freshWorld();
    const liu2 = near.world.idByName('柳安春')!;
    near.world.data.roster[liu2] = sceneId(near.world, '雲錦台戲台');
    near.world.data.clock = makeClock(6, 1);
    await runTick(near.world, { ...near.deps, agent: new MoverAgent('柳安春', sceneId(near.world, '後台妝閣')) }, { log: quiet });
    assert.equal(near.world.data.roster[liu2], sceneId(near.world, '後台妝閣'), 'the local hop completed');
    assert.equal(near.world.data.restUntilTickByChar?.[liu2], undefined, 'a same-district hop books no rest');
    fs.rmSync(near.dir, { recursive: true, force: true });
});

test('B — 路遇: a traveller is waylaid on the road by someone they care about', async () => {
    const { world, deps, dir } = await freshWorld();
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const from = sceneId(world, '白公館繡樓'); // 霞飛路 district
    const to = sceneId(world, '後台妝閣'); // 雲錦台 district (a real cross-town trip)
    world.data.roster[liu] = from;
    world.data.clock = makeClock(6, 1); // daytime

    const road = world.transitWaypoints(from, to)[0];
    assert.ok(road, 'the trip has a road to walk');
    world.data.roster[su] = road; // 蘇映雪 stands on the road
    // 柳安春 carries a want aimed at 蘇映雪 → she is "someone he cares about" on the way
    world.data.wants.push(
        newWant({ characterId: liu, layer: '志向', desc: '想與蘇映雪把話說開', target: su, weight: 0.8, sat: 0.2, resistance: 5, kind: 'narrative', source: 'owner', bornTick: 0 }),
    );

    await runTick(world, { ...deps, agent: new WaylaidAgent('柳安春', to, '蘇映雪') }, { log: quiet });
    assert.equal(world.data.roster[liu], road, '柳安春 stopped on the road with 蘇映雪, never reaching 後台妝閣');
    assert.notEqual(world.data.roster[liu], to, 'the errand slipped');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('B is inert without a transitReact seam — the default fake never intercepts', async () => {
    const { world, deps, dir } = await freshWorld();
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const from = sceneId(world, '白公館繡樓');
    const to = sceneId(world, '後台妝閣');
    world.data.roster[liu] = from;
    world.data.clock = makeClock(6, 1);
    const road = world.transitWaypoints(from, to)[0];
    world.data.roster[su] = road;
    world.data.wants.push(
        newWant({ characterId: liu, layer: '志向', desc: '想與蘇映雪把話說開', target: su, weight: 0.8, sat: 0.2, resistance: 5, kind: 'narrative', source: 'owner', bornTick: 0 }),
    );
    // plain MoverAgent has no transitReact → the tick lets the traveller arrive
    await runTick(world, { ...deps, agent: new MoverAgent('柳安春', to) }, { log: quiet });
    assert.equal(world.data.roster[liu], to, 'without a transit seam the traveller arrives uninterrupted');
    fs.rmSync(dir, { recursive: true, force: true });
});
