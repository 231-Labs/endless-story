/**
 * 廟願 — the temple-prayer mechanism. Deterministic PLUMBING tests (FakeSceneAgent,
 * no LLM). A prayer is a DELIBERATE SPOKEN utterance a character makes at a
 * physical temple — 角色真的來求、對神明說出口的話 — NOT an internal unspoken want.
 *
 *   1. templeScenesOf matches 城隍廟/觀音堂/教堂 and NOT 長三堂子花廳/鄉賢正堂;
 *   2. the 祈願 step: a character at a temple with a live want records exactly one
 *      Prayer (deterministic framing under the fake agent), once/day, attributed
 *      to them; a character not at a temple prays nothing;
 *   3. backward-compat: a world with no temple scene records no prayer, no crash;
 *   4. the 廟 PULL fires for a STUCK want at 清晨/黃昏 and names the temple, and
 *      stays silent without a temple or when the want isn't stuck.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { framePrayerFallback, isStuckWant, templeScenesOf } from '../src/core/temple-prayer.ts';
import { newWant, type Want } from '../src/core/want-core.ts';
import type { ArchivePort, MoveDecideInput, MoveDecideResult } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** A live want (source genesis, so nightly genesis never piles more onto the
 *  owner). `heat`/`bornTick` shape whether the 廟 PULL reads it as STUCK. */
function want(over: {
    characterId: string;
    layer: string;
    desc: string;
    target?: string;
    weight?: number;
    resistance?: number;
    heat?: number;
    bornTick?: number;
}): Want {
    const w = newWant({
        characterId: over.characterId,
        layer: over.layer,
        desc: over.desc,
        target: over.target,
        weight: over.weight ?? 0.7,
        sat: 0.2,
        resistance: over.resistance ?? 3,
        kind: 'narrative',
        source: 'genesis',
        bornTick: over.bornTick ?? 0,
    });
    w.heat = over.heat ?? 0;
    return w;
}

/** Minimal 2-person world; a temple 城隍廟 (t0) beside a non-temple 妝閣 (s0). */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'temple',
        sagaPremise: '一座戲班，巷底有座小廟',
        cast: [
            { id: 'c0', name: '柳安春', gender: '女', persona: '坤生', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '江聞鶴', gender: '男', persona: '小生', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '後台妝閣', privacyLevel: 2 },
            { id: 't0', name: '城隍廟', privacyLevel: 1 },
        ],
        roster: { c0: 't0', c1: 's0' },
        homeByChar: { c0: 's0', c1: 's0' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [],
        edges: {},
        clock: makeClock(6, 4), // 入夜 default (culls the solo scenes; tests override)
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

/** Captures every decideMove input so a rhythmHint (the 廟 PULL) can be asserted. */
class MoveRecorder extends FakeSceneAgent {
    moveInputs: MoveDecideInput[] = [];
    override async decideMove(input: MoveDecideInput): Promise<MoveDecideResult> {
        this.moveInputs.push(input);
        return { move: false, reason: 'stay' };
    }
}

test('1) templeScenesOf matches 城隍廟/觀音堂/教堂, and NOT 堂子花廳/正堂', () => {
    const world = makeWorld({
        scenes: [
            { id: 's0', name: '城隍廟', privacyLevel: 1 },
            { id: 's1', name: '會樂里觀音堂', privacyLevel: 1 },
            { id: 's2', name: '聖三一教堂', privacyLevel: 1 },
            { id: 's3', name: '長三堂子花廳', privacyLevel: 1 },
            { id: 's4', name: '鄉賢正堂', privacyLevel: 1 },
        ],
        roster: { c0: 's0', c1: 's3' },
        homeByChar: { c0: 's0', c1: 's3' },
        workByChar: { c0: 's0', c1: 's3' },
    });
    const temples = templeScenesOf(world);
    assert.deepEqual([...temples].sort(), ['s0', 's1', 's2'], '城隍廟/觀音堂/教堂 are temples');
    assert.ok(!temples.has('s3'), '長三堂子花廳 is NOT a temple (堂子/花廳)');
    assert.ok(!temples.has('s4'), '鄉賢正堂 is NOT a temple (正堂)');
});

test('2) 祈願 step: a temple pilgrim with a live want records exactly one Prayer, once/day; a non-pilgrim prays nothing', async () => {
    const wantDesc = '只求那一紙契約莫奪了我的名字';
    const world = makeWorld({
        clock: makeClock(6, 4), // 入夜 — night culls the solo scenes, isolating the prayer
        wants: [
            want({ characterId: 'c0', layer: '事務', desc: wantDesc, weight: 0.8 }),
            want({ characterId: 'c1', layer: '志向', desc: '想在台上站到最亮處', weight: 0.6 }),
        ],
    });

    const report = await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    const prayers = world.data.prayers ?? [];
    assert.equal(prayers.length, 1, 'exactly one prayer was voiced (the pilgrim at the temple)');
    const p = prayers[0];
    assert.equal(p.characterId, 'c0', 'attributed to the pilgrim');
    assert.equal(p.name, '柳安春');
    assert.equal(p.sceneName, '城隍廟', 'voiced at the temple');
    assert.equal(p.wantDesc, wantDesc, 'carries the underlying 心願');
    assert.equal(p.layer, '事務');
    // deterministic framing (the fake agent OMITS speakPrayer): 神明在上，信女…求告：<心願>。
    assert.match(p.text, /神明在上/, 'the prayer is addressed to 神明');
    assert.match(p.text, /信女/, 'gender-aware 信女 (柳安春 is 女)');
    assert.ok(p.text.includes(wantDesc), 'the spoken prayer frames the hottest want');
    assert.equal(p.text, framePrayerFallback('柳安春', wantDesc, '女'), 'matches the deterministic framing exactly');
    // the character NOT at a temple prayed nothing.
    assert.ok(!prayers.some((q) => q.characterId === 'c1'), '江聞鶴 (not at a temple) voiced no prayer');
    // a CHARACTER-attributed beat surfaced at the temple (reads as the character
    // speaking to 神明, not a 世界 announcement) — so it floats onto the 拍流.
    const prayerBeat = report.events
        .flatMap((e) => e.beats.map((b) => ({ sceneName: e.sceneName, ...b })))
        .find((b) => b.characterId === 'c0' && b.text === p.text);
    assert.ok(prayerBeat, 'the prayer surfaced as a character beat');
    assert.equal(prayerBeat!.sceneName, '城隍廟', 'the prayer beat is anchored at the temple');
    assert.equal(prayerBeat!.name, '柳安春', 'attributed to the character, not 世界');

    // a second tick the SAME day adds no duplicate (once/day).
    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });
    assert.equal((world.data.prayers ?? []).length, 1, 'once per day — the second same-day tick adds no duplicate prayer');
});

test('3) backward-compat: a world with no temple scene records no prayer and does not crash', async () => {
    const world = makeWorld({
        scenes: [
            { id: 's0', name: '後台妝閣', privacyLevel: 2 },
            { id: 's1', name: '長三堂子花廳', privacyLevel: 1 }, // 堂子, not a temple
        ],
        roster: { c0: 's1', c1: 's0' },
        homeByChar: { c0: 's0', c1: 's0' },
        workByChar: { c0: 's0', c1: 's0' },
        clock: makeClock(6, 4),
        wants: [want({ characterId: 'c0', layer: '事務', desc: '心裡壓著一樁事', weight: 0.8 })],
    });
    assert.equal(templeScenesOf(world).size, 0, 'no temple scene ⇒ empty temple set');

    const report = await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    assert.equal(world.data.prayers, undefined, 'the 願牆 field is never touched — stays undefined');
    assert.ok(report, 'the tick completed normally (no crash)');
});

test('4) the 廟 PULL names the temple for a STUCK want at 清晨, and stays silent without a temple / when the want isn’t stuck', async () => {
    // day 2 清晨 (currentTick 6) — a want born at tick 0 is 6 ticks old (aged past
    // the stuck floor); heat 4 ≥ resistance 3 ⇒ still pressing (forcing != idle).
    const clockDawn = makeClock(6, 6);
    const stuck = () => want({ characterId: 'c0', layer: '事務', desc: '該不該應下那紙三年包銀約', weight: 0.7, heat: 4, bornTick: 0 });
    // sanity: the predicate reads it as stuck at nowTick 6.
    assert.ok(isStuckWant(stuck(), 6), 'the aged, hot, high-tension want is STUCK');

    // WITH a reachable temple + a stuck want ⇒ the pull names the temple.
    const pullAgent = new MoveRecorder();
    await runTick(makeWorld({ roster: { c0: 's0', c1: 's0' }, clock: clockDawn, wants: [stuck()] }), deps(pullAgent), { log: () => {} });
    const stuckHint = pullAgent.moveInputs.find((i) => i.name === '柳安春')?.rhythmHint ?? '';
    assert.match(stuckHint, /城隍廟/, 'the 廟 PULL names the temple');
    assert.match(stuckHint, /神明|許個願/, 'the hint reads as a go-pray pull, not a generic rhythm');

    // CONTROL A — no temple scene: the pull never fires (even with the stuck want).
    const noTempleAgent = new MoveRecorder();
    await runTick(
        makeWorld({
            scenes: [
                { id: 's0', name: '後台妝閣', privacyLevel: 2 },
                { id: 's1', name: '衣箱房', privacyLevel: 2 },
            ],
            roster: { c0: 's0', c1: 's0' },
            homeByChar: { c0: 's0', c1: 's0' },
            workByChar: { c0: 's0', c1: 's0' },
            clock: clockDawn,
            wants: [stuck()],
        }),
        deps(noTempleAgent),
        { log: () => {} },
    );
    assert.doesNotMatch(
        noTempleAgent.moveInputs.find((i) => i.name === '柳安春')?.rhythmHint ?? '',
        /神明|城隍廟/,
        'no temple ⇒ no 廟 pull',
    );

    // CONTROL B — a temple, but a FRESH want (born this tick ⇒ age 0, not stuck).
    const freshAgent = new MoveRecorder();
    await runTick(
        makeWorld({
            roster: { c0: 's0', c1: 's0' },
            clock: clockDawn,
            wants: [want({ characterId: 'c0', layer: '事務', desc: '今日剛起的一樁小事', weight: 0.7, heat: 4, bornTick: 6 })],
        }),
        deps(freshAgent),
        { log: () => {} },
    );
    assert.doesNotMatch(
        freshAgent.moveInputs.find((i) => i.name === '柳安春')?.rhythmHint ?? '',
        /城隍廟/,
        'a want that isn’t stuck (fresh) ⇒ no 廟 pull',
    );
});
