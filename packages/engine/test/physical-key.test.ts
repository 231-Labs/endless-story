/**
 * 實體鑰匙 (Stage 2) — 使用權只隨門鑰的當面交手而動. The key OBJECT
 * (`WorldObject.keyFor`) and the use-right LEDGER (`accessGrants`) are seeded
 * together (housing) but otherwise unlinked; this stage links them at runtime:
 * a co-present physical hand-over of the key OBJECT is the ONLY thing that
 * 授予/撤銷 a standing use-right at the tick's gift hook (§7.78 換鎖 stays as the
 * escape hatch when the owner cannot physically retrieve the key).
 *
 * Deterministic PLUMBING (FakeSceneAgent subclass, scripted, no LLM / no credits):
 *   1. 授鑰 — 屋主 hands the key to a non-owner ⇒ they gain a STANDING key.
 *   2. 收回 — a tenant surrenders the key to the OWNER ⇒ the tenant loses it,
 *      the owner still enters by deed.
 *   3. 借鑰 — a standing holder LENDS to a non-owner ⇒ the receiver gains a key
 *      AND the lender keeps theirs (lending is not surrender).
 *   4. a NON-key gift is inert to access (the hook only touches keyFor objects).
 *   5. 物理相遇 required — a hand-off named at an OFF-scene person transfers no
 *      use-right (the hand can't reach them; no access change).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

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

/**
 * Hands a carried OBJECT to a named co-present receiver on the giver's FIRST beat,
 * then drops the curtain; every other actor keeps the scene open so the giver gets
 * its turn. Mirrors gift-bond.test.ts's GiftingAgent, parametrised. The beat prose
 * names no registered alias, so physical-canon leaves it alone and only the
 * structured `carrierName` effect moves carriage (commitBeatPhysics), exactly as a
 * real hand-off does.
 */
class HandOverAgent extends FakeSceneAgent {
    handed = false;
    giverId: string;
    receiverName: string;
    objectId: string;
    constructor(giverId: string, receiverName: string, objectId: string) {
        super();
        this.giverId = giverId;
        this.receiverName = receiverName;
        this.objectId = objectId;
    }
    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        const r = await super.actBeat(input);
        if (input.characterId === this.giverId && !this.handed) {
            this.handed = true;
            return {
                ...r,
                beat: `${input.name}將那物事交到${this.receiverName}手裡`,
                objectEffects: [{ objectId: this.objectId, carrierName: this.receiverName }],
                close: true,
            };
        }
        // everyone else keeps the scene open so the giver gets its turn to hand over.
        return { ...r, close: false };
    }
}

/** A portable key OBJECT that names its lock (`keyFor`), carried by `carrier`. */
function keyObject(carrier: string, scene: string): WorldObject {
    return {
        id: 'key',
        label: '小樓的鑰匙',
        aliases: ['小樓的鑰匙', '鑰匙'],
        sceneId: scene,
        portable: true,
        visibility: 'visible',
        carriedBy: carrier,
        keyFor: 's1',
        version: 0,
        knownBy: [carrier],
    };
}

/**
 * A public day street (s0) where the hand-over plays, plus the private 小樓 (s1,
 * privacyLevel 3) that the key opens. `over` tailors cast/roster/deed/grants per
 * case. `accessSeeded: true` skips the §2.96 social seed so each case's access
 * state is exactly what it declares (no genesis-driven pass creeps in). day 日午 —
 * a public day scene plays, and it is NOT day-end, so §7.78 換鎖 never runs.
 */
function keyWorld(over: Partial<WorldStateData> = {}): WorldStateData {
    return {
        sagaId: 'key',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c2', name: '丙', persona: '丙', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '戲園前街', privacyLevel: 0 },
            { id: 's1', name: '小樓', privacyLevel: 3 },
        ],
        roster: { c0: 's0', c1: 's0', c2: 's0' },
        homeByChar: { c0: 's1', c1: 's1', c2: 's0' },
        workByChar: { c0: 's0', c1: 's0', c2: 's0' },
        wants: [],
        edges: {},
        clock: makeClock(6, 2), // 日午 — a public day scene plays; not day-end
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        accessSeeded: true, // skip the §2.96 seed — the case declares its own access
        ...over,
    };
}

// ── 1) 授鑰 (grant on hand to a non-owner) ────────────────────────────────────
test('1) 授鑰: 屋主 hands the key to a non-owner ⇒ they gain a STANDING use-right', async () => {
    // 甲(c0) owns 小樓(s1) by deed; 乙(c1) holds no key. 甲 hands 乙 the key at the
    // public street. After the tick 乙 may let themselves in with a standing key.
    const world = new WorldState(keyWorld({
        propertyOwners: { s1: ['c0'] },
        accessGrants: {}, // 乙 holds nothing to begin with
        objects: [keyObject('c0', 's0')],
    }));
    assert.equal(world.canEnter('c1', 's1'), false, '乙 cannot enter before the key changes hands');

    await runTick(world, deps(new HandOverAgent('c0', '乙', 'key')), { log: () => {} });

    assert.equal(world.canEnter('c1', 's1'), true, '乙 may now let themselves into 小樓');
    assert.ok(
        world.keysHeldBy('c1').some((k) => k.sceneId === 's1' && k.kind === 'standing'),
        '乙 now holds a STANDING key to 小樓',
    );
});

// ── 2) 收回 (revoke on surrender to owner) ────────────────────────────────────
test('2) 收回: a tenant surrenders the key to the OWNER ⇒ the tenant loses it, the owner keeps deed', async () => {
    // 乙(c1) is a 租客 of 小樓(s1) (holds a standing key); 甲(c0) is the 屋主 (deed).
    // 乙 hands the key back to 甲 at the street — 使用權 returns to the owner.
    const world = new WorldState(keyWorld({
        propertyOwners: { s1: ['c0'] },
        accessGrants: { s1: { standing: ['c1'], oneTime: [] } },
        objects: [keyObject('c1', 's0')], // 乙 carries the key
    }));
    assert.equal(world.canEnter('c1', 's1'), true, '乙 can enter before surrendering the key');

    await runTick(world, deps(new HandOverAgent('c1', '甲', 'key')), { log: () => {} });

    assert.equal(world.canEnter('c1', 's1'), false, '乙 surrendered the key — no longer admitted');
    assert.ok(
        !world.keysHeldBy('c1').some((k) => k.sceneId === 's1'),
        '乙 holds no key to 小樓 after the hand-back',
    );
    assert.equal(world.canEnter('c0', 's1'), true, '甲 still enters 小樓 by deed (surrender does not touch ownership)');
});

// ── 3) 借鑰 (lend, non-owner → non-owner) ─────────────────────────────────────
test('3) 借鑰: a standing holder LENDS to a non-owner ⇒ receiver gains a key, lender keeps theirs', async () => {
    // 乙(c1) holds a standing key to 小樓(s1) (owner 甲/c0 is at home); 乙 hands the
    // key to 丙(c2), a non-owner. 借鑰 grants 丙 AND leaves 乙's key intact — lending
    // is not surrender (撤銷 is its own deliberate act: 交還屋主 or §7.78 換鎖).
    const world = new WorldState(keyWorld({
        roster: { c0: 's1', c1: 's0', c2: 's0' }, // owner at home; lender + borrower meet on the street
        propertyOwners: { s1: ['c0'] },
        accessGrants: { s1: { standing: ['c1'], oneTime: [] } },
        objects: [keyObject('c1', 's0')], // 乙 carries the key
    }));

    await runTick(world, deps(new HandOverAgent('c1', '丙', 'key')), { log: () => {} });

    assert.equal(world.canEnter('c2', 's1'), true, '丙 gained a standing key by the lending');
    assert.ok(
        world.keysHeldBy('c2').some((k) => k.sceneId === 's1' && k.kind === 'standing'),
        '丙 now holds a STANDING key to 小樓',
    );
    assert.equal(world.canEnter('c1', 's1'), true, '乙 STILL holds the key — lending did not revoke the lender');
    assert.ok(
        world.keysHeldBy('c1').some((k) => k.sceneId === 's1' && k.kind === 'standing'),
        '乙 keeps their standing key',
    );
});

// ── 4) a NON-key gift is inert to access ──────────────────────────────────────
test('4) a NON-key gift leaves accessGrants byte-identical', async () => {
    // 甲(c0) hands 乙(c1) an ordinary 白蘭 (no keyFor). The gift warms the bond, but
    // the use-right ledger must not move — only keyFor objects touch access.
    const flower: WorldObject = {
        id: 'flower', label: '一串白蘭', aliases: ['一串白蘭', '白蘭'], sceneId: 's0',
        portable: true, visibility: 'visible', carriedBy: 'c0', version: 0, knownBy: ['c0'],
    };
    const world = new WorldState(keyWorld({
        propertyOwners: { s1: ['c1'] }, // 乙 owns 小樓, so accessGrants below is a real, non-trivial table
        accessGrants: { s1: { standing: ['c0'], oneTime: [] } },
        objects: [flower],
    }));
    const before = structuredClone(world.data.accessGrants);

    await runTick(world, deps(new HandOverAgent('c0', '乙', 'flower')), { log: () => {} });

    assert.deepEqual(world.data.accessGrants, before, 'an ordinary gift does not touch the use-right ledger');
});

// ── 5) 物理相遇 required ───────────────────────────────────────────────────────
test('5) 物理相遇: a hand-off named at an OFF-scene person transfers no use-right', async () => {
    // 甲(c0) tries to hand the key to 丙(c2), who is NOT on the street (rostered at
    // 小樓). commitBeatPhysics rejects a transfer to a non-present carrier, so the
    // beat is dropped and the use-right hook is never reached — access is untouched.
    const world = new WorldState(keyWorld({
        roster: { c0: 's0', c1: 's0', c2: 's1' }, // 丙 is off-scene (at 小樓)
        propertyOwners: { s1: ['c1'] }, // 乙 owns 小樓; 丙 is a keyless non-owner
        accessGrants: { s1: { standing: [], oneTime: [] } },
        objects: [keyObject('c0', 's0')], // 甲 carries the key on the street
    }));
    const before = structuredClone(world.data.accessGrants);
    assert.equal(world.canEnter('c2', 's1'), false, '丙 cannot enter 小樓 to begin with');

    await runTick(world, deps(new HandOverAgent('c0', '丙', 'key')), { log: () => {} });

    assert.deepEqual(world.data.accessGrants, before, 'no co-present hand — no use-right transfer');
    assert.equal(world.canEnter('c2', 's1'), false, '丙 still holds no key (the key never reached them)');
});
