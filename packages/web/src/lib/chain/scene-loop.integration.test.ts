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
import { newWant, qualifiesAsTryst, type Want } from './want-core.ts';
import {
    effectiveResistance,
    runSceneLoop,
    type SceneAgent,
    type SceneLoopCastMember,
} from './scene-loop.ts';

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
