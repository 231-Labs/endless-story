/**
 * 房產/租約/實體鑰匙 (property / lease / physical key) — Stage 1: 擁有權 (deed) split
 * from 使用權 (holding a key). Deterministic PLUMBING tests (pure WorldState +
 * seedHousing, no LLM, no tick, no credits):
 *
 *   1. deed-first ownersOf: an explicit deed wins over the homeByChar derivation
 *      (a 屋主 who does not live here owns it; a deed of only-unknown ids falls back).
 *   2. backward-compat: no deed ⇒ ownersOf is the homeByChar dweller, unchanged.
 *   3. use-right split via canEnter: owner (deed) in; tenant with a standing key in;
 *      a stranger out — and the tenant holds a key WITHOUT holding the deed.
 *   4. seedHousing: records the deed, mints the tenant's physical key object, and
 *      throws on an unknown/public scene, a mis-housed tenant, and a duplicate key.
 *   5. accessSeeded migration: an old snapshot (accessGrants defined, accessSeeded
 *      absent) restores to accessSeeded=true (must not re-seed); a fresh one stays.
 *   6. round-trip: propertyOwners + a keyFor object + accessSeeded survive JSON.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { makeClock } from '../src/adapters/local/clock.ts';
import { seedHousing } from '../src/core/housing.ts';
import { WorldState, type CastMember, type WorldObject, type WorldStateData } from '../src/world-state.ts';

/** A cast member with the boilerplate filled in. */
function member(id: string, name: string, over: Partial<CastMember> = {}): CastMember {
    return { id, name, persona: name, gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {}, ...over };
}

/**
 * Base world: 甲(c0) DWELLS in the private 甲宅(s1); 乙(c1) dwells in the private
 * 乙宅(s2); 丙(c2) lives in the public 前廳(s0). No deeds by default, so ownersOf
 * derives from homeByChar (backward-compat) until a case sets `propertyOwners`.
 */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'property',
        sagaPremise: '一個戲班',
        cast: [member('c0', '甲'), member('c1', '乙', { gender: '男' }), member('c2', '丙')],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 }, // public
            { id: 's1', name: '甲宅', privacyLevel: 3 }, // 甲 dwells here
            { id: 's2', name: '乙宅', privacyLevel: 3 }, // 乙 dwells here
        ],
        roster: { c0: 's1', c1: 's2', c2: 's0' },
        homeByChar: { c0: 's1', c1: 's2', c2: 's0' },
        workByChar: { c0: 's0', c1: 's0', c2: 's0' },
        wants: [],
        edges: {},
        clock: makeClock(6, 0),
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

// ── 1) deed-first ownersOf ───────────────────────────────────────────────────────
test('1) an explicit deed is authoritative for ownersOf (屋主 owns; 租客 does not)', () => {
    // 丙(c2) holds the DEED of 甲宅(s1) though 甲(c0) is the one who dwells there.
    const world = makeWorld({ propertyOwners: { s1: ['c2'] } });
    assert.deepEqual(world.ownersOf('s1'), ['c2'], 'the deed owner wins over the dweller');
    assert.equal(world.ownersOf('s1').includes('c0'), false, 'the 租客 (dweller) is NOT the owner');

    // a deed of only-unresolved ids is ignored — falls back to the homeByChar dweller.
    const stale = makeWorld({ propertyOwners: { s1: ['ghost'] } });
    assert.deepEqual(stale.ownersOf('s1'), ['c0'], 'an unresolved deed falls back to the dweller');
});

// ── 2) backward-compat ───────────────────────────────────────────────────────────
test('2) no deed ⇒ ownersOf is the homeByChar dweller (unchanged behaviour)', () => {
    const world = makeWorld();
    assert.deepEqual(world.ownersOf('s1'), ['c0'], '甲 dwells in 甲宅 ⇒ owner');
    assert.deepEqual(world.ownersOf('s2'), ['c1'], '乙 dwells in 乙宅 ⇒ owner');
    assert.deepEqual(world.ownersOf('s0'), [], 'a public scene has no owner');
});

// ── 3) use-right split via canEnter ──────────────────────────────────────────────
test('3) 使用權 without 擁有權: a tenant holds a key but not the deed', () => {
    // 丙(c2) owns 甲宅(s1) by deed; 甲(c0) dwells there on a STANDING key; 乙(c1) is a
    // keyless stranger to it.
    const world = makeWorld({
        propertyOwners: { s1: ['c2'] },
        accessGrants: { s1: { standing: ['c0'], oneTime: [] } },
    });
    assert.equal(world.canEnter('c2', 's1'), true, 'the owner (deed) enters');
    assert.equal(world.canEnter('c0', 's1'), true, 'the tenant (standing key) enters');
    assert.equal(world.canEnter('c1', 's1'), false, 'a keyless stranger is barred');

    assert.ok(
        world.keysHeldBy('c0').some((k) => k.sceneId === 's1' && k.kind === 'standing'),
        'the tenant holds a standing key to the home',
    );
    assert.equal(world.ownersOf('s1').includes('c0'), false, 'yet the tenant is NOT an owner of it (使用權 ≠ 擁有權)');
    assert.deepEqual(world.ownersOf('s1'), ['c2'], 'only the deed-holder owns');
});

// ── 4) seedHousing ───────────────────────────────────────────────────────────────
test('4) seedHousing records deeds and mints the tenant’s physical key', () => {
    // 乙宅(s2) is owner-occupied by 乙; 甲宅(s1) is LET — deed 丙, tenant 甲 (who dwells there).
    const world = makeWorld();
    seedHousing(world, [
        { sceneName: '乙宅', ownerNames: ['乙'] },
        { sceneName: '甲宅', ownerNames: ['丙'], lease: { tenantName: '甲', keyObjectId: 'key-jia', keyLabel: '甲宅的門鑰' } },
    ]);

    assert.deepEqual(world.data.propertyOwners?.s2, ['c1'], 'owner-occupied deed recorded');
    assert.deepEqual(world.data.propertyOwners?.s1, ['c2'], 'lease deed recorded (丙 owns, not the tenant)');

    const key = world.objectById('key-jia');
    assert.ok(key, 'the physical key object exists');
    assert.equal(key?.keyFor, 's1', 'the key names its lock');
    assert.equal(key?.carriedBy, 'c0', 'the tenant carries it');
    assert.equal(key?.sceneId, 's1', 'it travels with the tenant (their current scene)');
    assert.equal(key?.portable, true, 'a key is portable');
    assert.ok(key?.aliases.includes('鑰匙'), 'aliases include the generic 鑰匙');
    assert.deepEqual(key?.knownBy, ['c0', 'c2'], 'known to tenant + owner');

    assert.ok(world.keysHeldBy('c0').some((k) => k.sceneId === 's1' && k.kind === 'standing'), 'the tenant holds a standing key');
    assert.equal(world.data.homeByChar.c0, 's1', 'the tenant still dwells in the leased scene');
    assert.equal(world.canEnter('c0', 's1'), true, 'the tenant may let themselves in');
    assert.equal(world.canEnter('c2', 's1'), true, 'the owner enters by deed');
    assert.equal(world.canEnter('c1', 's1'), false, 'a stranger is barred');
});

test('4b) seedHousing throws loudly on a mis-authored deed/lease', () => {
    assert.throws(
        () => seedHousing(makeWorld(), [{ sceneName: '不存在殿', ownerNames: ['甲'] }]),
        /\[housing\].*unknown scene/,
        'unknown scene',
    );
    assert.throws(
        () => seedHousing(makeWorld(), [{ sceneName: '前廳', ownerNames: ['甲'] }]),
        /\[housing\].*not a private dwelling/,
        'a public (privacyLevel < 3) scene',
    );
    assert.throws(
        () => seedHousing(makeWorld(), [{ sceneName: '甲宅', ownerNames: ['查無此人'] }]),
        /\[housing\].*unknown owner/,
        'unknown owner name',
    );
    assert.throws(
        // 丙 dwells in 前廳(s0), not 乙宅(s2) — a tenant must actually dwell in the leased scene.
        () => seedHousing(makeWorld(), [{ sceneName: '乙宅', ownerNames: ['乙'], lease: { tenantName: '丙', keyObjectId: 'key-x', keyLabel: 'x' } }]),
        /\[housing\].*does not dwell/,
        'a tenant whose homeByChar ≠ the leased scene',
    );
    const dupObj: WorldObject = { id: 'dup-key', label: '別的物', aliases: ['別的物'], sceneId: 's0', portable: true, visibility: 'visible', version: 0, knownBy: [] };
    assert.throws(
        () => seedHousing(makeWorld({ objects: [dupObj] }), [{ sceneName: '甲宅', ownerNames: ['丙'], lease: { tenantName: '甲', keyObjectId: 'dup-key', keyLabel: 'x' } }]),
        /\[housing\].*already exists/,
        'a duplicate keyObjectId',
    );
});

// ── 5) accessSeeded migration ────────────────────────────────────────────────────
test('5) restore migrates an old already-seeded snapshot to accessSeeded=true', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'es-housing-'));
    try {
        // An OLD snapshot: accessGrants defined (it was seeded under the undefined-guard
        // regime) but no accessSeeded field. Restore must mark it seeded, else the
        // housing-era guard would re-seed and un-revoke any 換鎖-revoked key.
        makeWorld({ accessGrants: {} }).snapshot(tmp);
        assert.equal(WorldState.restore(tmp).data.accessSeeded, true, 'a seeded snapshot migrates to accessSeeded=true');

        // A fresh, never-seeded snapshot (no accessGrants) stays unseeded — the §2.96
        // seed still owes it a first run.
        const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'es-housing-'));
        try {
            makeWorld().snapshot(tmp2);
            assert.equal(WorldState.restore(tmp2).data.accessSeeded, undefined, 'a never-seeded snapshot is not migrated');
        } finally {
            fs.rmSync(tmp2, { recursive: true, force: true });
        }
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

// ── 6) round-trip ────────────────────────────────────────────────────────────────
test('6) propertyOwners + a keyFor object + accessSeeded survive a JSON round-trip', () => {
    const key: WorldObject = {
        id: 'key-jia',
        label: '甲宅的門鑰',
        aliases: ['甲宅的門鑰', '鑰匙'],
        sceneId: 's1',
        portable: true,
        visibility: 'visible',
        carriedBy: 'c0',
        keyFor: 's1',
        state: '甲宅的門鑰，一直帶在身上',
        version: 0,
        knownBy: ['c0', 'c2'],
    };
    const world = makeWorld({
        propertyOwners: { s1: ['c2'] },
        accessGrants: { s1: { standing: ['c0'], oneTime: [] } },
        accessSeeded: true,
        objects: [key],
    });

    const rt = new WorldState(JSON.parse(JSON.stringify(world.data)) as WorldStateData);
    assert.deepEqual(rt.data.propertyOwners, { s1: ['c2'] }, 'the deed table survives');
    assert.equal(rt.data.accessSeeded, true, 'the accessSeeded flag survives');
    const k = rt.objectById('key-jia');
    assert.equal(k?.keyFor, 's1', 'the key object keeps its keyFor');
    assert.equal(k?.carriedBy, 'c0', 'and its carrier');
    assert.deepEqual(rt.ownersOf('s1'), ['c2'], 'the deed still drives ownersOf after restore');
});
