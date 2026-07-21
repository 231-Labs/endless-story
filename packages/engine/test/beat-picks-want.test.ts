/**
 * 執念自揀 (beatPicksWant) — the beat, not the engine, chooses which want it pushes.
 *
 * With the flag ON a beat is handed the FULL menu of its actor's live wants (hottest-
 * first, qualitative ripeness only) and may self-tag which one it actually worked via
 * `pushWant` (a 1-based menu index). The ledger — the recent/sat/heat bumps AND the
 * strict resolve pass (actedWants) — then follows that CHOICE, not the engine's
 * hottest-want guess. With the flag OFF (or when no menu is offered) the engine keeps
 * its single-want handoff and `pushWant` is inert: byte-identical.
 *
 * Setup: 甲(c0) has two live wants — a HOT 志向 (weight .9/sat .1) and a COLD 情 aimed
 * at 乙(c1) (weight .5/sat .4). hottestOf ⇒ the 志向 leads, so it is menu item ①; the
 * 情 is item ②. The scripted actor always tags `pushWant:2`, choosing the COLD want.
 * We assert which want the ledger followed.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { runSceneLoop, type SceneLoopCastMember, type SceneLoopInput } from '../src/core/scene-loop.ts';
import { newWant, type Want } from '../src/core/want-core.ts';
import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

/** 甲 always tags pushWant:2 (the SECOND menu item = the COLD want). The engine honours
 *  it only when a menu was actually offered (flag on & ≥2 live wants); everyone else and
 *  every flag-off beat ignores it. Never closes, so the scene runs its full length. */
class RedirectingAgent extends FakeSceneAgent {
    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        const r = await super.actBeat(input);
        return { ...r, pushWant: 2, close: false };
    }
}

const cast = (): SceneLoopCastMember[] => [
    { characterId: 'c0', name: '甲', persona: '甲' },
    { characterId: 'c1', name: '乙', persona: '乙' },
];

/** w-hot (志向) is hotter than w-cold (情) by tension = weight·(1−sat): .81 vs .30. */
const wants = (): Want[] => [
    newWant({ id: 'w-hot', characterId: 'c0', layer: '志向', desc: '想把戲唱到頂', weight: 0.9, sat: 0.1, resistance: 3, kind: 'narrative', source: 'genesis', bornTick: 0 }),
    newWant({ id: 'w-cold', characterId: 'c0', layer: '情', desc: '想與乙把話說開', target: 'c1', weight: 0.5, sat: 0.4, resistance: 6, kind: 'narrative', source: 'genesis', bornTick: 0 }),
    newWant({ id: 'w-c1', characterId: 'c1', layer: '日常', desc: '想睡個囫圇覺', weight: 0.4, sat: 0.4, resistance: 3, kind: 'narrative', source: 'genesis', bornTick: 0 }),
];

const base = (ws: Want[]): SceneLoopInput => ({
    sceneId: 's0', sceneName: '前廳', isPrivate: false, clock: '日午',
    cast: cast(), wants: ws, tick: 1, firstActorId: 'c0', agent: new RedirectingAgent(),
});

test('flag ON — pushWant re-binds the ledger to the chosen (cold) want, not the hottest', async () => {
    const ws = wants();
    await runSceneLoop({ ...base(ws), beatPicksWant: true });
    const hot = ws.find((w) => w.id === 'w-hot')!;
    const cold = ws.find((w) => w.id === 'w-cold')!;

    assert.ok(cold.recent > 0, 'the chosen (cold) want was WORKED — recent bumped');
    assert.ok(cold.sat > cold.sat0, 'the chosen want gained satisfaction');
    assert.ok(cold.heat > 0, 'the redirected want earned the attention-heat so it can ripen');
    assert.equal(hot.recent, 0, 'the hottest want was NOT worked — the engine did not pre-pick it');
    assert.equal(hot.sat, hot.sat0, 'the hottest want gained no satisfaction (it was only ever the scene’s tension)');
});

test('flag OFF — pushWant is inert; the engine’s hottest want drives the ledger', async () => {
    const ws = wants();
    await runSceneLoop({ ...base(ws) }); // beatPicksWant absent
    const hot = ws.find((w) => w.id === 'w-hot')!;
    const cold = ws.find((w) => w.id === 'w-cold')!;

    assert.ok(hot.recent > 0, 'without the flag the hottest want is the one worked');
    assert.ok(hot.sat > hot.sat0, 'the hottest want gained satisfaction');
    assert.equal(cold.recent, 0, 'the cold want stays untouched — pushWant ignored with no menu');
    assert.equal(cold.sat, cold.sat0, 'the cold want gained no satisfaction');
});

test('single live want ⇒ no menu even with the flag on ⇒ hottest handoff (byte-identical path)', async () => {
    // 甲 has exactly ONE live want: there is nothing to choose, so no menu is built and
    // pushWant cannot re-bind anything — the ledger falls to that one want as always.
    const only: Want[] = [
        newWant({ id: 'w-solo', characterId: 'c0', layer: '志向', desc: '想把戲唱到頂', weight: 0.9, sat: 0.1, resistance: 3, kind: 'narrative', source: 'genesis', bornTick: 0 }),
        newWant({ id: 'w-c1', characterId: 'c1', layer: '日常', desc: '想睡個囫圇覺', weight: 0.4, sat: 0.4, resistance: 3, kind: 'narrative', source: 'genesis', bornTick: 0 }),
    ];
    await runSceneLoop({ ...base(only), cast: cast(), wants: only, beatPicksWant: true });
    const solo = only.find((w) => w.id === 'w-solo')!;
    assert.ok(solo.recent > 0 && solo.sat > solo.sat0, 'the sole want is worked normally — the flag adds no menu, changes nothing');
});
