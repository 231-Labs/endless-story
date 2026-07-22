/**
 * 邀約 — the daytime invite medium (the REVERSE of 叩門). Deterministic PLUMBING
 * tests, mirroring reconcile-visit.test.ts. At 晡時, a character whose 愛/情/虧欠
 * want presses toward someone CO-PRESENT — whose own private home the target
 * cannot enter — may offer tonight's word via the optional decideInvite seat:
 * offered ⇒ grantAccess('oneTime') + two party-private scheduledEvents; seat
 * absent (FakeSceneAgent) ⇒ the word is swallowed, nothing changes. 常駐（與 叩門
 * 同屬已畢業的夜門知情一家，不再由旗標控制）；once per person per day.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant, type Want } from '../src/core/want-core.ts';
import type { ArchivePort, InviteDecideInput, InviteDecideReply } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

function ripeWant(over: { characterId: string; layer: string; desc: string; target?: string; heat?: number }): Want {
    const w = newWant({
        characterId: over.characterId,
        layer: over.layer,
        desc: over.desc,
        target: over.target,
        weight: 0.8,
        sat: 0.2,
        resistance: 3,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
    });
    w.heat = over.heat ?? 4; // pressure ≥ resistance ⇒ forcing past idle
    return w;
}

/**
 * 甲(c0) and 乙(c1) stand together in the public 前廳(s0) at 晡時. 甲's home is the
 * private 西廂(s1) — 乙 holds no key (canEnter false). 甲 carries a pressing 愛
 * want toward 乙. accessSeeded pinned true so the first-tick suitor 領入 seeding
 * cannot hand 乙 an unrelated pass and contaminate the grant assertions.
 */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'invite-test',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 },
            { id: 's1', name: '西廂', privacyLevel: 3 }, // 甲's private home
        ],
        roster: { c0: 's0', c1: 's0' }, // co-present in public
        homeByChar: { c0: 's1', c1: 's0' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [ripeWant({ characterId: 'c0', layer: '愛', desc: '想與乙把話說開', target: 'c1' })],
        edges: {},
        bonds: [],
        establishedPairs: [],
        accessSeeded: true,
        clock: makeClock(6, 2), // 晡時 — the invite part of day
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

class InvitingAgent extends FakeSceneAgent {
    calls: InviteDecideInput[] = [];
    reply: InviteDecideReply | null = { invite: true, line: '今夜得空，來坐坐' };
    async decideInvite(input: InviteDecideInput): Promise<InviteDecideReply | null> {
        this.calls.push(input);
        return this.reply;
    }
}

test('邀約常駐 + inviting seat ⇒ oneTime granted, both sides remember, once per day', async () => {
    const agent = new InvitingAgent();
    const world = makeWorld();
    await runTick(world, deps(agent), { log: () => {} });

    assert.equal(agent.calls.length, 1, 'the seat was asked exactly once');
    assert.equal(agent.calls[0].homeName, '西廂', 'the word opens the inviter own home');
    assert.equal(world.canEnter('c1', 's1'), true, '乙 now holds tonight\'s 領入 (oneTime)');
    assert.ok(world.keysHeldBy('c1').some((k) => k.sceneId === 's1' && k.kind === 'oneTime'), 'the grant is a oneTime pass, not a standing key');
    const events = world.data.scheduledEvents ?? [];
    assert.ok(events.some((e) => e.witnessIds.includes('c0') && e.text.includes('遞出去')), '甲 remembers offering the word');
    assert.ok(events.some((e) => e.witnessIds.includes('c1') && e.text.includes('來西廂坐坐')), '乙 remembers receiving it');
    assert.equal(world.data.inviteDayByChar?.c0, world.data.clock.day, 'the one-a-day marker is stamped');

    // Same day, second tick at 晡時 would re-ask — the day marker prevents it.
    const again = new InvitingAgent();
    await runTick(world, deps(again), { log: () => {} });
    assert.equal(again.calls.length, 0, 'no second invite the same day');
});

test('邀約常駐 + seat declines (or absent) ⇒ the word is swallowed, nothing changes', async () => {
    const decliner = new InvitingAgent();
    decliner.reply = { invite: false, line: '話到嘴邊又嚥了回去' };
    const world = makeWorld();
    await runTick(world, deps(decliner), { log: () => {} });
    assert.equal(decliner.calls.length, 1, 'the seat WAS consulted');
    assert.equal(world.canEnter('c1', 's1'), false, 'declined ⇒ no grant');
    assert.equal((world.data.scheduledEvents ?? []).length, 0, 'a swallowed word leaves no event');
    assert.equal(world.data.inviteDayByChar?.c0, world.data.clock.day, 'but the day marker is spent (one nerve a day)');

    // Absent seat (plain FakeSceneAgent): deterministic no-op.
    const world2 = makeWorld();
    await runTick(world2, deps(new FakeSceneAgent()), { log: () => {} });
    assert.equal(world2.canEnter('c1', 's1'), false, 'absent seat ⇒ no grant');
});

test('no invite when the target can already enter, or nobody is co-present', async () => {
    // Target already holds a standing key ⇒ no word needed.
    const keyed = makeWorld({ accessGrants: { s1: { standing: ['c1'], oneTime: [] } } });
    const agent1 = new InvitingAgent();
    await runTick(keyed, deps(agent1), { log: () => {} });
    assert.equal(agent1.calls.length, 0, 'a key-holder needs no invite');

    // Target elsewhere ⇒ no word can be handed.
    const apart = makeWorld({ roster: { c0: 's0', c1: 's1' } });
    const agent2 = new InvitingAgent();
    await runTick(apart, deps(agent2), { log: () => {} });
    assert.equal(agent2.calls.length, 0, 'no co-presence ⇒ no invite');
});
