/**
 * 班主叫排戲 through runTick — deterministic (a FakeSceneAgent subclass, no LLM).
 * At day start the 班主 (the 班庫's authorized spender) decides whether to call
 * today's rehearsal and which 戲碼. A called rehearsal must: record w.rehearsalCall,
 * announce itself to the troupe as a public percept, and (emergentProduction on,
 * no play yet) BOOTSTRAP the production — so it no longer waits on an individual
 * propose_play. That afternoon (日午/晡時) the troupe players get a rehearsal
 * rhythmHint pulling them to the venue, while a non-troupe outsider does not. The
 * default FakeSceneAgent omits decideRehearsal, so the whole phase stays inert
 * (backward compat — the deterministic economy runs are unaffected).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { runTick } from '../src/tick.ts';
import type { WorldState } from '../src/world-state.ts';
import type {
    ArchivePort,
    MoveDecideInput,
    MoveDecideResult,
    RehearsalDecideInput,
    RehearsalDecideReply,
} from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };

/** spring-snow + anchun frame, plus a performance block AND emergentProduction. */
function stageWorld(): WorldState {
    const frame = buildAnchunAcceptanceFrame();
    (frame as { economy: { performance?: object } }).economy.performance = {
        venueScene: '雲錦台戲台',
        leadNames: ['柳安春', '蘇映雪'],
        minCast: 4,
        fullHouseYuan: 30,
    };
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, frame);
    world.data.emergentProduction = true;
    return world;
}

/** A 班主 that always calls rehearsal of 回雪, and records the rhythmHint each
 *  character's decideMove receives (so the afternoon pull is observable). */
class BanzhuAgent extends FakeSceneAgent {
    rhythmByName = new Map<string, string | undefined>();
    async decideRehearsal(_input: RehearsalDecideInput): Promise<RehearsalDecideReply | null> {
        return { call: true, title: '回雪', line: '今日排《回雪》，午後戲台見' };
    }
    override async decideMove(input: MoveDecideInput): Promise<MoveDecideResult> {
        this.rhythmByName.set(input.name, input.rhythmHint);
        return { move: false, reason: 'fake: stay' };
    }
}

function deps(agent: FakeSceneAgent) {
    return {
        agent,
        recall: new LocalRecall(),
        archive: nullArchive,
        clock: new LocalClock(),
        economy: new LocalEconomy(),
    };
}

function stageId(world: WorldState): string {
    return world.data.scenes.find((scene) => scene.name === '雲錦台戲台')!.id;
}

test('清晨: the 班主 calls rehearsal — records the call, announces it, bootstraps the play', async () => {
    const world = stageWorld();
    world.data.clock = makeClock(6, 0); // day 1 清晨
    const banzhuId = world.idByName('沈雪笙')!;
    const agent = new BanzhuAgent();

    await runTick(world, deps(agent), { log: () => {} });

    // the day's rehearsal is recorded, resolved to the venue scene id.
    assert.ok(world.data.rehearsalCall, 'a rehearsal was called');
    assert.equal(world.data.rehearsalCall!.day, 1);
    assert.equal(world.data.rehearsalCall!.title, '回雪');
    assert.equal(world.data.rehearsalCall!.venueSceneId, stageId(world), 'venue resolves to the stage scene id');

    // a public percept announcing the rehearsal is scheduled for the troupe players.
    const announce = (world.data.scheduledEvents ?? []).find((event) => event.id.startsWith('rehearsal-call-'));
    assert.ok(announce, 'a rehearsal-call percept was scheduled');
    assert.match(announce!.text, /回雪/);
    assert.equal(announce!.visibility, 'public');
    assert.ok(announce!.witnessIds.includes(world.idByName('柳安春')!), 'a troupe lead is a witness');
    assert.ok(!announce!.witnessIds.includes(world.idByName('金鳳')!), 'a non-troupe outsider is not a witness');

    // emergentProduction on + no prior play → the 班主's call bootstrapped it.
    assert.ok(world.data.production, 'the call bootstrapped a production');
    assert.equal(world.data.production!.title, '回雪');
    assert.equal(world.data.production!.initiatorId, banzhuId, 'the 班主 is the initiator');
});

test('日午: a troupe player is pulled to the rehearsal venue; a non-troupe outsider is not', async () => {
    const world = stageWorld();
    world.data.clock = makeClock(6, 0); // day 1 清晨
    const agent = new BanzhuAgent();

    await runTick(world, deps(agent), { log: () => {} }); // 清晨 — calls rehearsal
    await runTick(world, deps(agent), { log: () => {} }); // 日午 — the afternoon pull

    // 柳安春 (a lead → troupe player, no own 日午 duty) is pulled to the venue.
    const liuHint = agent.rhythmByName.get('柳安春');
    assert.ok(liuHint, '柳安春 got a rhythm hint at 日午');
    assert.match(liuHint!, /班主叫的/, 'the pull is framed as the 班主 called it');
    assert.match(liuHint!, /回雪/, 'the hint names the 戲碼');
    assert.match(liuHint!, /雲錦台戲台/, 'the hint names the rehearsal venue');

    // 金鳳 (長三堂子 歌女 — never on the troupe payroll) gets NO rehearsal pull.
    const jinHint = agent.rhythmByName.get('金鳳');
    assert.ok(jinHint !== undefined, '金鳳 got a rhythm hint at 日午');
    assert.doesNotMatch(jinHint!, /班主叫的/, 'a non-troupe outsider is not pulled to rehearsal');
});

test('backward compat: the default FakeSceneAgent (no decideRehearsal) never calls rehearsal', async () => {
    const world = stageWorld();
    world.data.clock = makeClock(6, 0); // day 1 清晨
    const d = deps(new FakeSceneAgent());
    for (let i = 0; i < 6; i++) await runTick(world, d, { log: () => {} }); // a full day

    assert.equal(world.data.rehearsalCall, undefined, 'no rehearsalCall is ever set on the fake path');
});
