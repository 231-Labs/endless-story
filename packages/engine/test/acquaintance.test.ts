/**
 * 相識分寸 (subjective acquaintance) — the perceived-name mechanism.
 *
 * A character does NOT automatically know everyone's name. How a PERCEIVER refers
 * to a TARGET follows their resolution of acquaintance: 不識（trade + appearance）／
 * 認得·知姓（surname + honorific）／識全名（the full name）. This is SUBJECTIVE — it
 * shapes only what a character perceives; authorial narration stays omniscient.
 *
 * Deterministic PLUMBING (FakeSceneAgent / direct accessors, no LLM):
 *   1. perceivedName renders stranger→trade descriptor, acquainted→surname/honorific
 *      (or 行當 when no surname), named→full name.
 *   2. setAcquaint is MONOTONIC — a level only ever rises, never downgrades.
 *   3. seedAcquaintance: co-workers/edge-holders named; a public-role vendor
 *      acquainted to an unconnected perceiver (one-directional); a private
 *      unconnected pair stranger.
 *   4. deepening: a co-present tick lifts a stranger to ≥acquainted; a direct
 *      interaction (gift hand-off) lifts the pair to named.
 *   5. subjectiveNaming + acquaintance survive a JSON round-trip.
 *   6. addressing round-trip: a beat that addresses a target by their perceived
 *      knownAs still resolves to the right id (guards the scene-perception change).
 *
 * Modelled on gift-bond.test.ts / access-grant.test.ts. The shared anchun
 * acceptance fixture is never touched.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { runTick } from '../src/tick.ts';
import { WorldState, type CastMember, type WorldStateData, type WorldObject } from '../src/world-state.ts';
import { seedAcquaintance } from '../src/core/acquaintance.ts';
import { deriveBeatPerceiverIds } from '../src/core/scene-perception.ts';
import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import type { ArchivePort } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** A cast member with the boilerplate filled in. */
function member(id: string, name: string, over: Partial<CastMember> = {}): CastMember {
    return { id, name, persona: name, state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {}, ...over };
}

// ── 1) perceivedName rendering by level ──────────────────────────────────────
test('1) perceivedName renders 不識→trade descriptor, 認姓→surname/honorific, 識全名→full name', () => {
    const world = new WorldState({
        sagaId: 'acq',
        sagaPremise: '一條前街',
        subjectiveNaming: true,
        cast: [
            member('p', '沈雪笙', { role: '班主', gender: '女', age: 42 }),
            member('vendor', '趙阿福', { role: '小販', gender: '男', age: 38 }),
            member('flower', '殷阿婆', { role: '花婆', gender: '女', age: 61 }),
            member('press', '方競西', { role: '記者', gender: '男', age: 32 }),
            member('singer', '金鳳', { role: '歌女', gender: '女', age: 29 }), // 2字藝名 — 無姓
        ],
        scenes: [{ id: 's0', name: '戲園前街', privacyLevel: 0 }],
        roster: {}, homeByChar: {}, workByChar: {}, wants: [], edges: {},
        clock: makeClock(6, 0),
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
    });

    const set = (t: string, level: 'stranger' | 'acquainted' | 'named') => world.setAcquaint('p', t, level);

    // 不識 (stranger): trade + appearance, no name.
    set('vendor', 'stranger');
    set('flower', 'stranger');
    set('singer', 'stranger');
    assert.equal(world.perceivedName('p', 'vendor'), '一個賣吃食的漢子');
    assert.equal(world.perceivedName('p', 'flower'), '一個賣花的婆婆');
    assert.equal(world.perceivedName('p', 'singer'), '一個堂子的姑娘');

    // 認得·知姓 (acquainted): surname + honorific, or 行當 when no real surname.
    set('vendor', 'acquainted');
    set('flower', 'acquainted');
    set('press', 'acquainted');
    set('singer', 'acquainted');
    assert.equal(world.perceivedName('p', 'vendor'), '趙師傅'); // 男·擔販 → 師傅
    assert.equal(world.perceivedName('p', 'flower'), '殷婆婆'); // 女·老 → 婆婆
    assert.equal(world.perceivedName('p', 'press'), '方先生'); // 男·報人 → 先生
    assert.equal(world.perceivedName('p', 'singer'), '堂子的'); // 無姓藝名 → 行當代稱

    // 識全名 (named): the full name.
    set('vendor', 'named');
    assert.equal(world.perceivedName('p', 'vendor'), '趙阿福');

    // self is always named; a non-cast (authorial) perceiver is omniscient.
    assert.equal(world.perceivedName('p', 'p'), '沈雪笙');
    assert.equal(world.perceivedName('__reviewer__', 'flower'), '殷阿婆');

    // flag OFF ⇒ perceivedName === nameById everywhere (byte-identical guarantee).
    world.data.subjectiveNaming = false;
    assert.equal(world.perceivedName('p', 'flower'), '殷阿婆');
    assert.equal(world.acquaintLevel('p', 'flower'), 'named');
});

// ── 2) setAcquaint is monotonic ──────────────────────────────────────────────
test('2) setAcquaint only ever RAISES — it never downgrades', () => {
    const world = new WorldState({
        sagaId: 'acq', sagaPremise: 'x', subjectiveNaming: true,
        cast: [member('a', '甲'), member('b', '乙')],
        scenes: [], roster: {}, homeByChar: {}, workByChar: {}, wants: [], edges: {},
        clock: makeClock(6, 0), dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
    });

    world.setAcquaint('a', 'b', 'acquainted');
    assert.equal(world.acquaintLevel('a', 'b'), 'acquainted');
    world.setAcquaint('a', 'b', 'stranger'); // downgrade attempt — ignored
    assert.equal(world.acquaintLevel('a', 'b'), 'acquainted');
    world.setAcquaint('a', 'b', 'named'); // raise
    assert.equal(world.acquaintLevel('a', 'b'), 'named');
    world.setAcquaint('a', 'b', 'acquainted'); // downgrade attempt — ignored
    assert.equal(world.acquaintLevel('a', 'b'), 'named');
    world.setAcquaint('a', 'a', 'stranger'); // self is a no-op — always named
    assert.equal(world.acquaintLevel('a', 'a'), 'named');
});

// ── 3) seedAcquaintance from a small canon world ─────────────────────────────
test('3) seedAcquaintance: co-workers/edge-holders named; public vendor acquainted; private pair stranger', () => {
    const world = new WorldState({
        sagaId: 'acq', sagaPremise: 'x', subjectiveNaming: true,
        cast: [
            member('c0', '柳安春', { role: '小生' }),
            member('c1', '蘇映雪', { role: '花旦' }), // co-worker + roommate of c0
            member('c2', '殷阿婆', { role: '花婆', gender: '女', age: 61 }), // public-facing
            member('c3', '唐桂蘭', { role: '衣箱', gender: '女', age: 44 }), // private, unconnected
        ],
        scenes: [
            { id: 's0', name: '戲台', privacyLevel: 0 },
            { id: 's1', name: '大通鋪', privacyLevel: 2 },
            { id: 's2', name: '前街', privacyLevel: 0 },
            { id: 's3', name: '攤棚', privacyLevel: 2 },
            { id: 's4', name: '衣箱房', privacyLevel: 2 },
        ],
        roster: {},
        homeByChar: { c0: 's1', c1: 's1', c2: 's3', c3: 's4' }, // c0 & c1 share a dwelling
        workByChar: { c0: 's0', c1: 's0', c2: 's2', c3: 's4' }, // c0 & c1 share a workplace
        wants: [],
        edges: { c0: { c3: { tone: '好奇', weight: 1 } } }, // c0 holds a seeded edge toward c3
        clock: makeClock(6, 0), dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
    });

    seedAcquaintance(world);

    // co-workers / roommates ⇒ named both ways.
    assert.equal(world.acquaintLevel('c0', 'c1'), 'named');
    assert.equal(world.acquaintLevel('c1', 'c0'), 'named');
    // edge-holder ⇒ named (you know by name someone you have an opinion of).
    assert.equal(world.acquaintLevel('c0', 'c3'), 'named');
    // a public-facing vendor is acquainted to an unconnected perceiver…
    assert.equal(world.acquaintLevel('c1', 'c2'), 'acquainted');
    assert.equal(world.acquaintLevel('c3', 'c2'), 'acquainted');
    // …but ONE-DIRECTIONAL: the vendor does not automatically know them back.
    assert.equal(world.acquaintLevel('c2', 'c1'), 'stranger');
    // a private, unconnected pair stays stranger both ways.
    assert.equal(world.acquaintLevel('c1', 'c3'), 'stranger');
    assert.equal(world.acquaintLevel('c3', 'c1'), 'stranger');
    // and the seed is idempotent — a re-run on a seeded world is a no-op.
    const before = JSON.stringify(world.data.acquaintance);
    seedAcquaintance(world);
    assert.equal(JSON.stringify(world.data.acquaintance), before);
});

// ── 4) deepening: co-presence → acquainted, direct interaction → named ───────

/** Two co-located cast in a public day scene; c0 carries a portable object. */
function dayWorld(): WorldStateData {
    const flower: WorldObject = { id: 'flower', label: '一串白蘭', aliases: ['白蘭'], sceneId: 's0', portable: true, visibility: 'visible', carriedBy: 'c0', version: 0, knownBy: [] };
    return {
        sagaId: 'acq', sagaPremise: '一個戲班', subjectiveNaming: true,
        cast: [
            member('c0', '甲', { role: '小生' }),
            member('c1', '乙', { role: '花旦' }),
        ],
        scenes: [{ id: 's0', name: '戲園前街', privacyLevel: 0 }, { id: 's1', name: '小樓', privacyLevel: 3 }],
        roster: { c0: 's0', c1: 's0' },
        homeByChar: { c0: 's1', c1: 's1' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [], edges: {},
        clock: makeClock(6, 2), // 日午 — a public day scene plays
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [flower],
    };
}

/** Hands the carried object to 乙 on the first beat, then closes. */
class GiftingAgent extends FakeSceneAgent {
    handed = false;
    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        const r = await super.actBeat(input);
        if (input.characterId === 'c0' && !this.handed) {
            this.handed = true;
            return { ...r, beat: '把那串白蘭替乙簪上', objectEffects: [{ objectId: 'flower', carrierName: '乙' }], close: true };
        }
        return { ...r, close: false };
    }
}

test('4a) a co-present played scene lifts a prior stranger to ≥ acquainted', async () => {
    const world = new WorldState(dayWorld());
    // No seed ⇒ flag on + unrecorded pair ⇒ stranger.
    assert.equal(world.acquaintLevel('c0', 'c1'), 'stranger');
    assert.equal(world.acquaintLevel('c1', 'c0'), 'stranger');

    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    // sharing a played scene ⇒ they now recognise each other (≥ acquainted), both ways.
    assert.notEqual(world.acquaintLevel('c0', 'c1'), 'stranger');
    assert.notEqual(world.acquaintLevel('c1', 'c0'), 'stranger');
});

test('4b) a direct interaction (handing an object over) lifts the pair to named', async () => {
    const world = new WorldState(dayWorld());
    assert.equal(world.acquaintLevel('c0', 'c1'), 'stranger');

    await runTick(world, deps(new GiftingAgent()), { log: () => {} });

    assert.equal(world.acquaintLevel('c0', 'c1'), 'named', 'the giver now knows the receiver by name');
    assert.equal(world.acquaintLevel('c1', 'c0'), 'named', 'and the receiver knows the giver by name');
});

// ── 5) JSON round-trip ───────────────────────────────────────────────────────
test('5) subjectiveNaming + acquaintance survive a JSON round-trip', () => {
    const world = new WorldState({
        sagaId: 'acq', sagaPremise: 'x', subjectiveNaming: true,
        cast: [member('a', '甲'), member('b', '乙'), member('c', '丙')],
        scenes: [], roster: {}, homeByChar: {}, workByChar: {}, wants: [], edges: {},
        clock: makeClock(6, 0), dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
    });
    world.setAcquaint('a', 'b', 'named');
    world.setAcquaint('a', 'c', 'acquainted');

    const restored = new WorldState(JSON.parse(JSON.stringify(world.data)) as WorldStateData);
    assert.equal(restored.data.subjectiveNaming, true);
    assert.equal(restored.acquaintLevel('a', 'b'), 'named');
    assert.equal(restored.acquaintLevel('a', 'c'), 'acquainted');
    assert.equal(restored.acquaintLevel('a', 'x'), 'stranger'); // unrecorded ⇒ stranger
});

// ── 6) addressing round-trip (guards the scene-perception change) ────────────
test('6) a beat addressing a target by their perceived knownAs still resolves to the right id', () => {
    const world = new WorldState({
        sagaId: 'acq', sagaPremise: 'x', subjectiveNaming: true,
        cast: [
            member('speaker', '柳安春', { role: '小生', gender: '女', age: 24 }),
            member('vendor', '趙阿福', { role: '小販', gender: '男', age: 38 }),
        ],
        scenes: [{ id: 's0', name: '前街', privacyLevel: 0 }],
        roster: {}, homeByChar: {}, workByChar: {}, wants: [], edges: {},
        clock: makeClock(6, 0), dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
    });
    world.setAcquaint('speaker', 'vendor', 'acquainted');
    const perceived = world.perceivedName('speaker', 'vendor');
    assert.equal(perceived, '趙師傅', 'the speaker knows the vendor as 趙師傅, not 趙阿福');

    // The speaker addresses the vendor by the perceived name they see.
    const participants = ['speaker', 'vendor'].map((id) => ({
        id,
        name: world.nameById(id),
        knownAs: world.perceivedName('speaker', id),
    }));
    const perceiverIds = deriveBeatPerceiverIds(
        { characterId: 'speaker', addressed: `${perceived}，這生煎多少錢`, audience: 'addressed' },
        participants,
    );
    assert.ok(perceiverIds.includes('vendor'), 'addressing 趙師傅 resolves the whisper to 趙阿福 (vendor id)');

    // and resolveAddressed maps the perceived display back to the canonical id too.
    assert.equal(world.resolveAddressed('speaker', perceived, ['speaker', 'vendor']), 'vendor');
    // canonical name still resolves (flag-off path is byte-identical to idByName).
    assert.equal(world.resolveAddressed('speaker', '趙阿福', ['speaker', 'vendor']), 'vendor');
});
