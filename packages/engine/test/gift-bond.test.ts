/**
 * 贈物暖情 — handing an object to a co-present person warms the bond both ways.
 *   1. the pure warmth: bumpBond(…, 'gift') lifts more than a plain shared scene;
 *   2. the tick hook: a beat that hands a registered object to a co-present person
 *      (carrierName) warms the giver↔receiver bond above a plain co-present scene.
 * The 花婆's 白蘭, bought and pinned on a sweetheart's collar, is affection made
 * physical — the bond graph should feel it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { BOND, bumpBond, bondOf, type BondGraph } from '../src/core/bond-graph.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData, type WorldObject } from '../src/world-state.ts';
import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { makeClock } from '../src/adapters/local/clock.ts';
import type { ArchivePort } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

// ── 1) pure warmth ───────────────────────────────────────────────────────────

test('1) bumpBond gift warmth outweighs a plain shared scene, both directions', () => {
    const gift: BondGraph = new Map();
    const shared: BondGraph = new Map();
    bumpBond(gift, 'a', 'b', 'gift');
    bumpBond(shared, 'a', 'b', 'shared');
    assert.ok(BOND.warmth.gift > BOND.warmth.shared, 'gift is a warmer gesture than co-presence');
    assert.ok(bondOf(gift, 'a', 'b') > bondOf(shared, 'a', 'b'), 'a→b warmer via a gift');
    assert.ok(bondOf(gift, 'b', 'a') > bondOf(shared, 'b', 'a'), 'b→a warmed too (symmetric)');
});

// ── 2) the tick hook ─────────────────────────────────────────────────────────

/** Hands the carried 白蘭 to 乙 on the first beat, then closes. */
class GiftingAgent extends FakeSceneAgent {
    handed = false;
    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        const r = await super.actBeat(input);
        if (input.characterId === 'c0' && !this.handed) {
            this.handed = true;
            // c0 hands the flower to 乙 and drops the curtain.
            return { ...r, beat: '把那串白蘭替乙簪上', objectEffects: [{ objectId: 'flower', carrierName: '乙' }], close: true };
        }
        // anyone else keeps the scene open so c0 gets its turn to give the gift.
        return { ...r, close: false };
    }
}

/** Two co-located cast in a public day scene; c0 carries a portable 白蘭. `gift`
 *  toggles whether c0 hands it to c1. */
function dayWorld(): WorldStateData {
    const flower: WorldObject = { id: 'flower', label: '一串白蘭', aliases: ['白蘭'], sceneId: 's0', portable: true, visibility: 'visible', carriedBy: 'c0', version: 0, knownBy: [] };
    return {
        sagaId: 'gift',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [{ id: 's0', name: '戲園前街', privacyLevel: 0 }, { id: 's1', name: '小樓', privacyLevel: 3 }],
        roster: { c0: 's0', c1: 's0' },
        homeByChar: { c0: 's1', c1: 's1' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [],
        edges: {},
        clock: makeClock(6, 2), // 日午 — a public day scene plays
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [flower],
    };
}

test('2) a beat that hands an object to a co-present person warms their bond above a plain scene', async () => {
    // gift run
    const giftWorld = new WorldState(dayWorld());
    await runTick(giftWorld, deps(new GiftingAgent()), { log: () => {} });
    const giftBond = bondOf(giftWorld.bondGraph(), 'c0', 'c1');

    // control run — same scene, no hand-off (plain FakeSceneAgent)
    const plainWorld = new WorldState(dayWorld());
    await runTick(plainWorld, deps(new FakeSceneAgent()), { log: () => {} });
    const plainBond = bondOf(plainWorld.bondGraph(), 'c0', 'c1');

    assert.ok(giftBond > plainBond, `a gift warms the bond beyond mere co-presence (gift ${giftBond} > plain ${plainBond})`);
});
