/**
 * Composition tests for the scene chain — the REAL runSceneLoop with a scripted
 * agent (no LLM, no chain, CI-clean). Unit tests kept passing while five seam
 * bugs shipped; these assert the seams themselves:
 *
 *   want → forcing (private-pair resistance drop §2.45) → intimacy gate →
 *   beat inputs (identity/tie/state actually arrive) → sat/heat math (§2.46) →
 *   strict resolve (§2.31) → tryst qualification (G8 night gate).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    forcingLevel,
    jealousNightPursuit,
    newWant,
    nightSceneKind,
    qualifiesAsReckoning,
    qualifiesAsTryst,
    yearningNightPursuit,
    type Want,
} from '@endless-story/engine/core/want-core';
import {
    effectiveResistance,
    runSceneLoop,
    type SceneAgent,
    type SceneLoopCastMember,
} from '@endless-story/engine/core/scene-loop';
import { computeSpatialRouting } from './spatial-routing.ts';

const BAI = { id: '0xbai', name: '白韻秋' };
const LIU = { id: '0xliu', name: '柳生春' };
const WEN = { id: '0xwen', name: '江聞鶴' };

function loveWant(over: Partial<Want> = {}): Want {
    const w = newWant({
        characterId: BAI.id,
        layer: '愛',
        desc: '想聽他應一聲「好」',
        target: LIU.name,
        weight: 0.9,
        sat: 0.2,
        resistance: 8,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 1,
    });
    Object.assign(w, over);
    return w;
}

function pairCast(): SceneLoopCastMember[] {
    return [
        {
            characterId: BAI.id,
            name: BAI.name,
            persona: '綢緞莊獨養千金，柳生春最闊氣的戲迷。',
            role: '客',
            ties: { [LIU.id]: '你對TA：戀慕（想聽他應一聲「好」…）' },
            stateLine: '## 此刻身心\n- 身子：累得骨頭都快散了。',
        },
        { characterId: LIU.id, name: LIU.name, persona: '春雪社當紅小生。', role: '小生' },
    ];
}

type ActBeatCall = Parameters<SceneAgent['actBeat']>[0];

function scriptedAgent(script: { resolved?: boolean; note?: string } = {}) {
    const calls: ActBeatCall[] = [];
    const agent: SceneAgent = {
        actBeat: async (input) => {
            calls.push(input);
            return { beat: `${input.name}低聲說了一句。`, inner: '……', addressed: input.others[0]?.name };
        },
        judgeWantResolved: async () => ({ resolved: script.resolved ?? false, note: script.note }),
    };
    return { agent, calls };
}

test('tryst chain: private pair + love want → resistance drop, edge forcing, gate, resolve', async () => {
    const w = loveWant({ heat: 4.2 });
    const wants = [w];
    // §2.45: alone with the want's target in a private scene, 8 → 5.
    assert.equal(effectiveResistance(w, { isPrivate: true, cast: pairCast() }), 5);

    const { agent, calls } = scriptedAgent({ resolved: true, note: '她把話問出了口' });
    const result = await runSceneLoop({
        sceneId: '0xchamber',
        sceneName: '白宅繡樓',
        isPrivate: true,
        clock: '深宵',
        emotionalStance: 'consummate',
        cast: pairCast(),
        wants,
        tick: 23,
        agent,
    });

    // The intimacy gate opened ex ante (love want, alone with its target).
    assert.equal(result.intimacyGateOpened, true);

    // The first (hottest) actor is the want's owner, and her beat input carried
    // the whole composed context — this is exactly what the seam bugs dropped.
    const first = calls[0];
    assert.equal(first.name, BAI.name);
    assert.equal(first.privateAlone, true);
    // heat 4.2 + 1 (acting) = 5.2 ≥ effR 5 → edge, and consummate unlocks.
    assert.equal(first.forcing, 'edge');
    assert.equal(first.consummate, true);
    assert.equal(first.stateLine?.includes('此刻身心'), true);
    assert.equal(first.others[0].name, LIU.name);
    assert.equal(first.others[0].role, '小生');
    // Actor's OWN tie only — never the reverse edge (no omniscience).
    assert.equal(first.others[0].tie, '你對TA：戀慕（想聽他應一聲「好」…）');

    // Strict resolve (§2.31): edge-level acted want + judge verdict → retired.
    assert.equal(result.resolved.length, 1);
    assert.equal(w.retired, true);
    assert.equal(w.resolvedNote, '她把話問出了口');
});

test('§2.46: public crumbs starve a love want (sat +0.05), private feeds it (+0.16)', async () => {
    const pub = loveWant();
    const { agent: a1 } = scriptedAgent();
    await runSceneLoop({
        sceneId: '0xstreet',
        sceneName: '前街',
        isPrivate: false,
        clock: '日午',
        cast: pairCast(),
        wants: [pub],
        tick: 20,
        maxTurns: 1,
        agent: a1,
    });
    assert.ok(Math.abs(pub.sat - 0.25) < 1e-9);

    const priv = loveWant();
    const { agent: a2 } = scriptedAgent();
    await runSceneLoop({
        sceneId: '0xchamber',
        sceneName: '白宅繡樓',
        isPrivate: true,
        clock: '深宵',
        cast: pairCast(),
        wants: [priv],
        tick: 23,
        maxTurns: 1,
        agent: a2,
    });
    assert.ok(Math.abs(priv.sat - 0.36) < 1e-9);
});

test('G8 tryst qualification: exactly the pair, private, live love want at the other', () => {
    const wants = [loveWant()];
    assert.equal(qualifiesAsTryst([BAI, LIU], 3, wants), true);
    // Any missing leg disqualifies:
    assert.equal(qualifiesAsTryst([BAI, LIU, WEN], 3, wants), false); // third wheel
    assert.equal(qualifiesAsTryst([BAI, LIU], 2, wants), false); // not private enough
    assert.equal(qualifiesAsTryst([BAI, WEN], 3, wants), false); // want aims elsewhere
    assert.equal(qualifiesAsTryst([BAI, LIU], 3, [loveWant({ retired: true })]), false);
    assert.equal(qualifiesAsTryst([BAI, LIU], 3, [loveWant({ layer: '志' })]), false);
});

const JIN = { id: '0xjin', name: '金鳳' };

function grudgeWant(over: Partial<Want> = {}): Want {
    const w = newWant({
        characterId: JIN.id,
        layer: '怨',
        desc: '柳生春欠我一句親口交代',
        target: LIU.name,
        weight: 0.85,
        sat: 0.2,
        resistance: 8,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 1,
    });
    Object.assign(w, over);
    return w;
}

test('G8b 撞破: tryst pair + one jealous third = confrontation; no jealousy = sleep', () => {
    const love = loveWant();
    // Third with a burning grudge at one of the pair → 撞破.
    assert.equal(nightSceneKind([BAI, LIU, JIN], 3, [love, grudgeWant()]), 'confrontation');
    // Pair alone stays a tryst; grudge-less third kills the night scene.
    assert.equal(nightSceneKind([BAI, LIU], 3, [love]), 'tryst');
    assert.equal(nightSceneKind([BAI, LIU, WEN], 3, [love]), null);
    // Jealousy aimed at neither of the pair does not qualify.
    assert.equal(nightSceneKind([BAI, LIU, JIN], 3, [love, grudgeWant({ target: WEN.name })]), null);
    // Public room: nothing plays at night regardless.
    assert.equal(nightSceneKind([BAI, LIU, JIN], 2, [love, grudgeWant()]), null);
});

test('G8b 妒火夜隨: a pressing grudge stalks its target, idle ones stay home', () => {
    const resolve = (t: string) => (t === LIU.name ? LIU.id : undefined);
    // heat 5 / resist 8 → pressing (≥ 0.6×8) → stalks, uninvited.
    const hot = jealousNightPursuit([grudgeWant({ heat: 5 })], JIN.id, resolve);
    assert.ok(hot);
    assert.equal(hot!.id, LIU.id);
    assert.equal(hot!.intrude, true);
    // Cold grudge (idle forcing) does not stalk; love-layer never stalks.
    assert.equal(jealousNightPursuit([grudgeWant({ heat: 1 })], JIN.id, resolve), null);
    assert.equal(jealousNightPursuit([loveWant({ characterId: JIN.id, heat: 9 })], JIN.id, resolve), null);
});

function debtWant(over: Partial<Want> = {}): Want {
    const w = newWant({
        characterId: LIU.id,
        layer: '虧欠',
        desc: '想遞水袖時真碰著她的手，把那夜逃的債還清',
        target: BAI.name,
        weight: 0.9,
        sat: 0.2,
        resistance: 9,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 1,
    });
    Object.assign(w, over);
    return w;
}

test('H1 了結: a private pair with an unsettled debt want plays as a reckoning', () => {
    const debt = debtWant();
    // The gate pathology: 虧欠 climbed to the ceiling but only 愛/情 opened a
    // private night pair, so it never got its reckoning. Now it qualifies.
    assert.equal(qualifiesAsReckoning([LIU, BAI], 3, [debt]), true);
    assert.equal(qualifiesAsTryst([LIU, BAI], 3, [debt]), false); // not a tryst — no intimacy gate
    assert.equal(nightSceneKind([LIU, BAI], 3, [debt]), 'reckoning');
    // Still gated: public room, or the debt aimed elsewhere, sleeps.
    assert.equal(nightSceneKind([LIU, BAI], 2, [debt]), null);
    assert.equal(qualifiesAsReckoning([LIU, WEN], 3, [debt]), false);
    // A debt pair witnessed by a jealous third is a 撞破.
    assert.equal(nightSceneKind([LIU, BAI, JIN], 3, [debt, grudgeWant({ target: LIU.name })]), 'confrontation');
});

test('H1/H3c 夜赴: pressing = welcome-gated (no intrude), edge+ = intrude', () => {
    const resolve = (t: string) => (t === BAI.name ? BAI.id : t === LIU.name ? LIU.id : undefined);
    // Pressing (heat 6 / resist 9 → forcing 6, ≥ 0.6×9): seeks the target, but
    // politely — a wary creditor can still keep the door shut.
    const polite = yearningNightPursuit([debtWant({ heat: 6 })], LIU.id, resolve);
    assert.ok(polite);
    assert.equal(polite!.id, BAI.id);
    assert.equal((polite as { intrude?: boolean }).intrude, undefined);
    // Edge (heat 9 / resist 9): ripe enough to seek uninvited (H3c: intrude at
    // edge so the private scene forms BEFORE the want breaks + resolves publicly).
    assert.equal(yearningNightPursuit([debtWant({ heat: 9 })], LIU.id, resolve)?.intrude, true);
    assert.equal(yearningNightPursuit([loveWant({ heat: 8 })], BAI.id, resolve)?.intrude, true);
    // H3d: an idle bond that is still STRONG (high standing tension) now SEEKS its
    // object at night — welcome-gated, no intrude — so a love want a rivalry keeps
    // cold no longer freezes out of the night entirely.
    const coldButStrong = yearningNightPursuit([debtWant({ heat: 0, frust: 0 })], LIU.id, resolve);
    assert.equal(coldButStrong?.id, BAI.id);
    assert.equal((coldButStrong as { intrude?: boolean }).intrude, undefined);
    // A cold AND weak bond (tension below bondYearnTension 0.5) stays home:
    // debtWant weight 0.9 × (1 − 0.6) = 0.36 < 0.5.
    assert.equal(
        yearningNightPursuit([debtWant({ heat: 0, frust: 0, sat: 0.6 })], LIU.id, resolve),
        null,
    );
});

test('H3 breaking + reckoning: edge/breaking debt barges in; the pair plays as 了結', () => {
    // debtWant res 9 → edge at forcing 9, breaking at ≥ 12 (res + margin 3).
    assert.equal(forcingLevel(debtWant({ heat: 9, frust: 0 })), 'edge');
    assert.equal(forcingLevel(debtWant({ heat: 12, frust: 0 })), 'breaking');
    const resolve = (t: string) => (t === BAI.name ? BAI.id : undefined);
    // A ripe (edge+) one-sided debt reaches its target uninvited even when the
    // other side never welcomes — this is THE H3 unblock.
    const forced = yearningNightPursuit([debtWant({ heat: 12 })], LIU.id, resolve);
    assert.equal(forced?.id, BAI.id);
    assert.equal(forced?.intrude, true);
    // Downstream: intrude + a private home = the pair forms (proven by the G8b
    // routing test below), and [LIU,BAI]+debt plays as a 了結 reckoning.
    assert.equal(nightSceneKind([LIU, BAI], 4, [debtWant({ heat: 12 })]), 'reckoning');
});

test('G8b routing: intrude bypasses the welcome gate into a private home', () => {
    // 蘇 welcomes 柳 into her home (the tryst forms); 金鳳 pursues 柳. She is
    // welcomed by nobody — polite pursuit bounces home, jealous intrusion walks in.
    const scenes = [
        { id: 'suHome', privacyLevel: 4 },
        { id: 'liuHome', privacyLevel: 4 },
        { id: 'jinHome', privacyLevel: 4 },
    ];
    const welcome = (host: string, visitor: string) => (host === '0xsu' && visitor === LIU.id ? 1 : 0);
    const actors = [
        { id: '0xsu', sceneId: 'suHome', homeSceneId: 'suHome' },
        { id: LIU.id, sceneId: 'liuHome', homeSceneId: 'liuHome', fatigue: 0.2, pursue: { id: '0xsu', w: 0.9 } },
        {
            id: JIN.id,
            sceneId: 'jinHome',
            homeSceneId: 'jinHome',
            fatigue: 0.2,
            pursue: { id: LIU.id, w: 0.9, intrude: true },
        },
    ];
    const targets = computeSpatialRouting(actors, scenes, true, welcome);
    assert.equal(targets.get(LIU.id), 'suHome'); // the tryst forms first
    assert.equal(targets.get(JIN.id), 'suHome'); // …and the jealousy follows in
    // Same pursuit WITHOUT intrude bounces home (nobody welcomes 金鳳).
    const politeActors = actors.map((a) =>
        a.id === JIN.id ? { ...a, pursue: { id: LIU.id, w: 0.9 } } : a,
    );
    const politeTargets = computeSpatialRouting(politeActors, scenes, true, welcome);
    assert.equal(politeTargets.get(JIN.id), 'jinHome');
});

test('H3b routing: pursuer aims at the pursued HOME (not their daytime scene) + softened home pull', () => {
    // The live bug: both spend the day in a PUBLIC hall (sceneId ≠ home), and the
    // pursuer is processed FIRST — old code saw the target still in the public
    // hall (propriety 0) AND high night fatigue buried pursuit → both slept alone.
    const scenes = [
        { id: 'hall', privacyLevel: 0 },
        { id: 'suHome', privacyLevel: 4 },
        { id: 'liuHome', privacyLevel: 4 },
    ];
    const welcome = (host: string, visitor: string) => (host === '0xsu' && visitor === LIU.id ? 1 : 0);
    const actors = [
        { id: LIU.id, sceneId: 'hall', homeSceneId: 'liuHome', fatigue: 0.85, pursue: { id: '0xsu', w: 0.9 } },
        { id: '0xsu', sceneId: 'hall', homeSceneId: 'suHome', fatigue: 0.85 },
    ];
    const targets = computeSpatialRouting(actors, scenes, true, welcome);
    assert.equal(targets.get('0xsu'), 'suHome'); // 蘇 goes home
    assert.equal(targets.get(LIU.id), 'suHome'); // 柳 aims at 蘇's HOME → the pair forms
});

test('H3b routing: a one-sided breaking intrusion forms the pair against a wary target', () => {
    const scenes = [
        { id: 'hall', privacyLevel: 0 },
        { id: 'suHome', privacyLevel: 4 },
        { id: 'liuHome', privacyLevel: 4 },
    ];
    const noWelcome = () => 0; // 蘇 never opens the door to 柳
    const actors = [
        { id: LIU.id, sceneId: 'hall', homeSceneId: 'liuHome', fatigue: 0.85, pursue: { id: '0xsu', w: 1, intrude: true } },
        { id: '0xsu', sceneId: 'hall', homeSceneId: 'suHome', fatigue: 0.85 },
    ];
    const targets = computeSpatialRouting(actors, scenes, true, noWelcome);
    // Intrusion is a compulsion — it overrides tiredness and the shut door.
    assert.equal(targets.get(LIU.id), 'suHome');
});

test('H3d: cold mutual love (a rivalry kept it off the driver seat) still forms the night tryst', () => {
    // The stall this fixes: a love want that never wins the driver seat stays at
    // idle forcing forever, so the OLD night-pursuit (forcing-gated) never fired
    // and the pair never formed. Now a cold-but-strong bond SEEKS by tension —
    // welcome-gated, so a MUTUAL pair forms while a one-sided cold longing does not.
    const resolve = (t: string) => (t === LIU.name ? LIU.id : t === BAI.name ? BAI.id : undefined);
    const wants = [
        loveWant({ characterId: LIU.id, target: BAI.name, heat: 0, frust: 0 }), // 柳→白, cold
        loveWant({ characterId: BAI.id, target: LIU.name, heat: 0, frust: 0 }), // 白→柳, cold
    ];
    assert.equal(forcingLevel(wants[0]), 'idle'); // genuinely un-heated…
    const pL = yearningNightPursuit(wants, LIU.id, resolve);
    const pB = yearningNightPursuit(wants, BAI.id, resolve);
    assert.equal(pL?.id, BAI.id); // …yet each still seeks the other,
    assert.equal(pB?.id, LIU.id);
    assert.equal((pL as { intrude?: boolean }).intrude, undefined); // politely (no barge-in).
    assert.equal((pB as { intrude?: boolean }).intrude, undefined);

    const scenes = [
        { id: 'hall', privacyLevel: 0 },
        { id: 'liuHome', privacyLevel: 4 },
        { id: 'baiHome', privacyLevel: 4 },
    ];
    const welcome = (host: string, visitor: string) =>
        (host === LIU.id && visitor === BAI.id) || (host === BAI.id && visitor === LIU.id) ? 1 : 0;
    const actors = [
        { id: LIU.id, sceneId: 'hall', homeSceneId: 'liuHome', fatigue: 0.6, pursue: { id: BAI.id, w: pL!.w } },
        { id: BAI.id, sceneId: 'hall', homeSceneId: 'baiHome', fatigue: 0.6, pursue: { id: LIU.id, w: pB!.w } },
    ];
    const targets = computeSpatialRouting(actors, scenes, true, welcome);
    // The mutual welcome + softened home pull lands both in ONE private home.
    const liuAt = targets.get(LIU.id);
    const baiAt = targets.get(BAI.id);
    assert.equal(liuAt, baiAt, '柳白同宿一處（私會成局）');
    assert.ok(liuAt === 'liuHome' || liuAt === 'baiHome', '落在某人的私宅');
    // And that private pair with a live love want across it plays as a 幽會.
    assert.equal(nightSceneKind([LIU, BAI], 4, wants), 'tryst');
});
