/**
 * 訪問權限 (space access grants) — the explicit private-space key mechanism that
 * replaces the implicit warmth gate. Deterministic PLUMBING tests (FakeSceneAgent
 * / scripted, no LLM):
 *
 *   1. canEnter: public → anyone; owner → yes; standing/oneTime holder → yes; a
 *      keyless stranger → no.
 *   2. lazy canon seed: a private home whose owner is warm (welcome ≥ 0.7) toward
 *      X — or is 相許 with X — hands X a STANDING key; a cold stranger gets none.
 *   3. the movement gate is the key gate: a standing holder is offered the private
 *      home, a keyless mover is barred, and the 撞破 intruder still bypasses it (a
 *      jealous third with NO key still gets the intrude option).
 *   4. one-time consume: a one-time pass admits X once, then is used up on entry
 *      (canEnter goes false afterwards).
 *   5. dynamic 授權/撤銷: an in-scene advance→accept (相許) hands the pair mutual
 *      standing keys to each other's homes; an owner who sours (a live 妒/怨/恨/仇
 *      want) toward a standing holder 換了鎖 at day-end (the key is revoked).
 *   6. backward-compat: a world seeded with no accessGrants reproduces the OLD
 *      warmth gate's admit/bar decisions on day 1; a public world is untouched.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type CastMember, type WorldStateData } from '../src/world-state.ts';
import { newWant, type Want } from '../src/core/want-core.ts';
import { BOND, bondsToJSON, seedBond } from '../src/core/bond-graph.ts';
import type { ArchivePort } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** A cast member with the boilerplate filled in. */
function member(id: string, name: string, over: Partial<CastMember> = {}): CastMember {
    return { id, name, persona: name, gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {}, ...over };
}

/** A live want RIPE by default (heat past resistance ⇒ forcing != idle). */
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
    w.heat = over.heat ?? 4; // pressure 4 ≥ resistance 3 ⇒ edge (ripe)
    return w;
}

/**
 * Base world: 甲(c0) owns the private 甲宅(s1); 乙(c1) owns the private 乙宅(s2).
 * 前廳(s0) & 街(s3) are public. Everyone starts apart. Override per case. bonds/
 * establishedPairs default to [] so the §2.95 bond seed is skipped unless a case
 * wants it; accessGrants defaults to undefined (the §2.96 seed runs) unless a case
 * pre-seeds it (which skips the seed, matching the established-pairs test pattern).
 */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'access',
        sagaPremise: '一個戲班',
        cast: [member('c0', '甲'), member('c1', '乙', { gender: '男' }), member('c2', '丙')],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 },
            { id: 's1', name: '甲宅', privacyLevel: 3 }, // 甲's private home
            { id: 's2', name: '乙宅', privacyLevel: 3 }, // 乙's private home
            { id: 's3', name: '街', privacyLevel: 1 },
        ],
        roster: { c0: 's1', c1: 's2', c2: 's0' },
        homeByChar: { c0: 's1', c1: 's2', c2: 's0' },
        workByChar: { c0: 's0', c1: 's0', c2: 's0' },
        wants: [],
        edges: {},
        bonds: [],
        establishedPairs: [],
        clock: makeClock(6, 0),
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

/** Records every decideMove input; optionally scripts ONE named mover to take the
 *  option for a named target scene (else everyone stays and the offer is inspected). */
class MoveScript extends FakeSceneAgent {
    inputs: CharacterAgentNs.MoveDecideInput[] = [];
    who?: string;
    toSceneId?: string;
    constructor(who?: string, toSceneId?: string) {
        super();
        this.who = who;
        this.toSceneId = toSceneId;
    }
    override async decideMove(input: CharacterAgentNs.MoveDecideInput): Promise<CharacterAgentNs.MoveDecideResult> {
        this.inputs.push(input);
        if (this.who && input.name === this.who) {
            const opt = input.options.find((o) => o.sceneId === this.toSceneId);
            if (opt) return { move: true, targetSceneId: opt.sceneId, reason: '測試移步' };
        }
        return { move: false, reason: 'stay' };
    }
    optionsFor(name: string): CharacterAgentNs.MoveSceneOption[] {
        return this.inputs.find((i) => i.name === name)?.options ?? [];
    }
}

/** Scripts the intimacy negotiation off the flags the loop passes: advance when the
 *  world offers the card, accept (and close) when an overture is on the table. */
class ScriptedAcceptAgent extends FakeSceneAgent {
    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        if (input.intimacyOffered) return { beat: `${input.name}輕輕應了下來`, inner: '應了', intimacy: 'accept', close: true };
        if (input.intimacyPossible) return { beat: `${input.name}挨近了些`, inner: '想再近些', intimacy: 'advance' };
        return super.actBeat(input);
    }
}

// ── 1) canEnter ────────────────────────────────────────────────────────────────
test('1) canEnter: public → anyone; owner → yes; standing/oneTime → yes; stranger → no', () => {
    const world = makeWorld();
    world.data.accessGrants = { s1: { standing: ['c1'], oneTime: ['c2'] } };

    // public scene (privacyLevel < 3 ⇒ no owner) — anyone, even an unknown id.
    assert.equal(world.canEnter('c2', 's0'), true, 'a public scene admits anyone');
    assert.equal(world.canEnter('cX', 's3'), true, 'a public scene admits a stranger too');
    assert.deepEqual(world.ownersOf('s0'), [], 'a public scene has no owner');

    // 甲宅(s1) — owner + key-holders in, keyless stranger out.
    assert.deepEqual(world.ownersOf('s1'), ['c0'], 's1 is owned by 甲 (its resident)');
    assert.equal(world.canEnter('c0', 's1'), true, 'the owner always enters their own home');
    assert.equal(world.canEnter('c1', 's1'), true, 'a standing key-holder enters');
    assert.equal(world.canEnter('c2', 's1'), true, 'a one-time pass-holder enters');
    assert.equal(world.canEnter('cX', 's1'), false, 'a keyless stranger is barred');
});

// ── 2) lazy canon seed ──────────────────────────────────────────────────────────
test('2) lazy seed: warm (≥0.7) and 相許 owners hand a STANDING key; a cold stranger gets none', async () => {
    // Night ⇒ daytime genesis (which would mint love wants) is skipped, so the seed
    // reads pure canon. 甲(c0) owns 甲宅(s1); 乙(c1) is warmly welcomed (暖 edge →
    // welcome 0.8); 丁(c3) is an old lover (相許); 丙(c2) is a cold stranger.
    const world = makeWorld({
        cast: [member('c0', '甲'), member('c1', '乙', { gender: '男' }), member('c2', '丙'), member('c3', '丁', { gender: '男' })],
        roster: { c0: 's1', c1: 's0', c2: 's0', c3: 's0' },
        homeByChar: { c0: 's1', c1: 's0', c2: 's0', c3: 's0' }, // only c0 owns a private home
        workByChar: { c0: 's0', c1: 's0', c2: 's0', c3: 's0' },
        edges: { c0: { c1: { tone: '暖', weight: 1 } } }, // welcome(甲,乙) = 0.8
        establishedPairs: ['c0|c3'], // 甲 & 丁 are old lovers (相許)
        clock: makeClock(6, 4), // 入夜 — night, no genesis
    });

    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    assert.ok(world.keysHeldBy('c1').some((k) => k.sceneId === 's1' && k.kind === 'standing'), 'a warm guest is handed a standing key');
    assert.ok(world.keysHeldBy('c3').some((k) => k.sceneId === 's1' && k.kind === 'standing'), 'an old lover (相許) holds a standing key');
    assert.deepEqual(world.keysHeldBy('c2'), [], 'a cold stranger holds no key');
    assert.equal(world.canEnter('c1', 's1'), true, 'the warm guest can enter');
    assert.equal(world.canEnter('c3', 's1'), true, 'the old lover can enter');
    assert.equal(world.canEnter('c2', 's1'), false, 'the cold stranger cannot');
    // The seed initialises the table so it never re-seeds.
    assert.notEqual(world.data.accessGrants, undefined, 'the grant table is initialised after the first tick');
});

// ── 3) the movement gate is the key gate (+ 撞破 still bypasses) ─────────────────
test('3) gate replaced: standing holder is offered the home, a keyless mover is barred, 撞破 bypasses', async () => {
    // RUN A — 乙(c1) holds a standing key to 甲宅(s1); 丙(c2) holds none. Both stand
    // in the public 前廳(s0); inspect what each is OFFERED (pre-seeded grants ⇒ the
    // §2.96 seed is skipped, so the gate reads exactly these keys).
    const admitAgent = new MoveScript();
    await runTick(
        makeWorld({
            roster: { c0: 's1', c1: 's0', c2: 's0' },
            accessGrants: { s1: { standing: ['c1'], oneTime: [] } },
            clock: makeClock(6, 4), // night — no genesis noise
        }),
        deps(admitAgent),
        { log: () => {} },
    );
    assert.ok(admitAgent.optionsFor('乙').some((o) => o.sceneId === 's1'), 'the standing key-holder is offered 甲宅');
    assert.equal(admitAgent.optionsFor('丙').some((o) => o.sceneId === 's1'), false, 'the keyless mover is barred from 甲宅');
    assert.ok(admitAgent.optionsFor('丙').some((o) => o.sceneId === 's3'), 'a public option is still offered (public unaffected)');

    // RUN B — 丙(c2) carries a ripe 妒 aimed at 甲(c0), who is mid-tryst with 乙(c1)
    // in the private, full 甲宅(s1). 丙 holds NO key, yet the 撞破 bypass still offers
    // the scene flagged intrude — a break-in ignores keys.
    const intrudeAgent = new MoveScript();
    const world = makeWorld({
        roster: { c0: 's1', c1: 's1', c2: 's0' },
        accessGrants: {}, // 丙 holds no key to s1
        wants: [ripeWant({ characterId: 'c2', layer: '妒', desc: '見不得甲與旁人親近', target: 'c0' })],
        clock: makeClock(6, 4), // night — the intrude channel is night-only
    });
    await runTick(world, deps(intrudeAgent), { log: () => {} });
    const barge = intrudeAgent.optionsFor('丙').find((o) => o.sceneId === 's1');
    assert.ok(barge, '丙 is offered 甲宅 DESPITE holding no key');
    assert.equal(barge?.intrude, true, 'the offered scene is flagged as an intrusion (撞破 bypass)');
    assert.equal(world.canEnter('c2', 's1'), false, 'and 丙 genuinely holds no key — it is the bypass, not a grant');
});

// ── 4) one-time consume ─────────────────────────────────────────────────────────
test('4) one-time pass admits once, then is consumed on entry', async () => {
    // 乙(c1) holds a one-time pass to 甲宅(s1). Night (no genesis). 乙 is scripted to
    // walk into 甲宅; the pass is spent on arrival.
    const world = makeWorld({
        roster: { c0: 's1', c1: 's0', c2: 's3' },
        accessGrants: { s1: { standing: [], oneTime: ['c1'] } },
        clock: makeClock(6, 4),
    });
    assert.equal(world.canEnter('c1', 's1'), true, 'the pass admits 乙 before entry');

    await runTick(world, deps(new MoveScript('乙', 's1')), { log: () => {} });

    assert.equal(world.data.roster.c1, 's1', '乙 walked into 甲宅 on the one-time pass');
    assert.equal(world.canEnter('c1', 's1'), false, 'the pass is used up — 乙 can no longer enter');
    assert.deepEqual(world.keyHoldersOf('s1'), [], '甲宅 holds no key-holders once the pass is spent');
    // The accessor semantics on a spent pass: a second consume is a no-op.
    assert.equal(world.consumeOneTime('s1', 'c1'), false, 'a spent pass consumes nothing');
});

// ── 5) dynamic 授權 / 撤銷 ───────────────────────────────────────────────────────
test('5a) 相許 (advance→accept) hands the pair mutual standing keys to each other’s homes', async () => {
    // A yearning pair (advanceReady true), NOT established, alone in 甲宅(s1) at night
    // (甲 "arrived" this tick ⇒ deliberate encounter). 甲 lives in s1, 乙 lives in the
    // SEPARATE private 乙宅(s2). The scripted agent advances then accepts.
    const g = new Map();
    seedBond(g, 'c0', 'c1', BOND.seed.yearning);
    seedBond(g, 'c1', 'c0', BOND.seed.yearning);
    const world = makeWorld({
        roster: { c0: 's1', c1: 's1', c2: 's0' }, // 乙 visiting 甲宅
        homeByChar: { c0: 's1', c1: 's2', c2: 's0' }, // distinct private homes
        bonds: bondsToJSON(g),
        accessGrants: {}, // no seeded keys — the grant must come from 相許
        lastMovedTickByChar: { c0: 4 },
        clock: makeClock(6, 4),
    });

    await runTick(world, deps(new ScriptedAcceptAgent()), { log: () => {} });

    assert.ok(world.isEstablished('c0', 'c1'), 'the accepted overture promotes the pair to 相許');
    assert.ok(world.keysHeldBy('c0').some((k) => k.sceneId === 's2' && k.kind === 'standing'), '甲 now holds a standing key to 乙宅');
    assert.ok(world.keysHeldBy('c1').some((k) => k.sceneId === 's1' && k.kind === 'standing'), '乙 now holds a standing key to 甲宅');
    assert.equal(world.canEnter('c0', 's2'), true, '甲 may now let themselves into 乙宅');
    assert.equal(world.canEnter('c1', 's1'), true, '乙 may now let themselves into 甲宅');
});

test('5b) souring (換鎖): an owner with a live 怨 want toward a standing holder revokes the key at day-end', async () => {
    // 甲(c0) owns 甲宅(s1); 乙(c1) holds a standing key. 甲 now carries a live 怨 want
    // aimed at 乙. At day-end 甲 換了鎖 — 乙's key is revoked.
    const world = makeWorld({
        roster: { c0: 's1', c1: 's0', c2: 's3' }, // apart — no scene, isolates the revoke
        accessGrants: { s1: { standing: ['c1'], oneTime: [] } },
        wants: [ripeWant({ characterId: 'c0', layer: '怨', desc: '這口氣咽不下，恨乙背我', target: 'c1', heat: 0 })],
        clock: makeClock(6, 5), // 深宵 — day-end (and night, so the 怨 want is not decayed away)
    });
    assert.equal(world.canEnter('c1', 's1'), true, 'the holder can enter before the turn sours');

    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    assert.equal(world.canEnter('c1', 's1'), false, '甲 換了鎖 — the soured holder is barred');
    assert.deepEqual(world.keyHoldersOf('s1'), [], '甲宅 has no key-holders after the revoke');
    assert.deepEqual(world.keysHeldBy('c1'), [], '乙 no longer holds any key');
});

// ── 6) backward-compat ──────────────────────────────────────────────────────────
test('6) backward-compat: the day-1 seed reproduces the old warmth gate; a public world is untouched', async () => {
    // No accessGrants ⇒ the §2.96 seed runs. 甲(c0) owns 甲宅(s1), warm toward 乙(c1)
    // (welcome 0.8), cold toward 丙(c2). Under the OLD gate 乙 was admitted and 丙
    // barred — the seeded day-1 state reproduces exactly those decisions.
    const world = makeWorld({
        roster: { c0: 's1', c1: 's0', c2: 's0' },
        edges: { c0: { c1: { tone: '暖', weight: 1 } } },
        clock: makeClock(6, 4), // night — no genesis
    });
    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    assert.equal(world.canEnter('c1', 's1'), true, 'the warm guest is admitted (warmth ≥ 0.7 → standing key), as the old gate did');
    assert.equal(world.canEnter('c2', 's1'), false, 'the cold stranger is barred, as the old gate did');
    assert.equal(world.canEnter('c1', 's0'), true, 'a public scene admits anyone (unaffected)');
    assert.equal(world.canEnter('c2', 's0'), true, 'the cold one too — public is public');

    // A FULLY public world: the seed finds no private owned space ⇒ empty table,
    // everyone everywhere admitted (no behaviour change at all).
    const publicWorld = makeWorld({
        scenes: [
            { id: 's0', name: '戲台', privacyLevel: 0 },
            { id: 's1', name: '練功房', privacyLevel: 1 },
            { id: 's2', name: '街', privacyLevel: 2 },
            { id: 's3', name: '歌場', privacyLevel: 1 },
        ],
        roster: { c0: 's0', c1: 's1', c2: 's2' },
        homeByChar: { c0: 's1', c1: 's1', c2: 's2' },
        clock: makeClock(6, 4),
    });
    await runTick(publicWorld, deps(new FakeSceneAgent()), { log: () => {} });
    assert.deepEqual(publicWorld.data.accessGrants, {}, 'a public world seeds an empty grant table');
    assert.equal(publicWorld.canEnter('c2', 's1'), true, 'everyone may enter any public scene');
    assert.equal(publicWorld.canEnter('c0', 's2'), true, 'no private space ⇒ no gate anywhere');
});
