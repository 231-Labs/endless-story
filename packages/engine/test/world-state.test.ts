/**
 * WorldState snapshot/restore round-trip — the durability that kills the
 * volatile in-process-Map failure mode (CHARACTER_LIFECYCLE §6iii).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { makeClock } from '../src/adapters/local/clock.ts';
import { newWant } from '../src/core/want-core.ts';

function sampleWorld(): WorldState {
    const data: WorldStateData = {
        sagaId: 'test',
        sagaPremise: 'a troupe',
        cast: [
            { id: 'c0', name: '柳安春', persona: '小生', secret: '暗戀師姐', role: '小生', state: { fatigue: 0.3, hunger: 0.2, mood: 0 }, coreIdentity: ['我是坤生，女兒身扮小生'], relationshipView: { c1: '師姐，我暗慕著，話沒敢說' } },
            { id: 'c1', name: '蘇映雪', persona: '花旦', role: '花旦', state: { fatigue: 0.4, hunger: 0.1, mood: 0 }, coreIdentity: ['我是蘇映雪，工花旦'], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '後台', privacyLevel: 2 },
            { id: 's1', name: '書寓', privacyLevel: 3 },
        ],
        roster: { c0: 's0', c1: 's0' },
        homeByChar: { c0: 's1', c1: 's1' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [
            newWant({ characterId: 'c0', layer: '愛', desc: '想挨近蘇映雪', target: '蘇映雪', weight: 0.8, sat: 0.3, resistance: 6, kind: 'narrative', source: 'genesis', bornTick: 0 }),
        ],
        edges: { c0: { c1: { tone: '戀慕', weight: 2 } } },
        clock: makeClock(6, 3),
        dayAccum: { lines: ['【黃昏】', '[後台] 柳安春：把扇子擱下'], actorIds: ['c0'], sceneIds: ['s0'], povByName: { 柳安春: '心下一動' } },
        contestedResources: [{ label: 'spotlight:頭牌' }],
        objects: [],
    };
    return new WorldState(data);
}

test('snapshot → restore is a faithful round-trip', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-world-'));
    const w = sampleWorld();
    w.snapshot(dir);
    assert.ok(WorldState.exists(dir));
    const restored = WorldState.restore(dir);
    // Compare through JSON so `undefined`-valued keys (which JSON omits) don't
    // spuriously differ — the on-disk form is the contract.
    assert.deepEqual(restored.data, JSON.parse(JSON.stringify(w.data)));
    // Deep equality reaches the want ledger, edges, clock and day accumulator.
    assert.equal(restored.data.wants.length, 1);
    assert.equal(restored.data.wants[0].desc, '想挨近蘇映雪');
    assert.equal(restored.data.clock.currentTick, 3);
    assert.equal(restored.data.dayAccum.lines.length, 2);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('restore throws loudly when no snapshot exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-world-empty-'));
    assert.equal(WorldState.exists(dir), false);
    assert.throws(() => WorldState.restore(dir));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('legacy prose-only carriage is normalized into a structured carrier', () => {
    const base = sampleWorld().data;
    const migrated = new WorldState({
        ...structuredClone(base),
        objects: [{
            id: 'negative',
            label: '底片封套',
            aliases: ['底片封套'],
            sceneId: 's0',
            portable: true,
            visibility: 'hidden',
            container: '柳安春懷中',
            version: 1,
            knownBy: ['c0'],
        }],
    });
    assert.equal(migrated.objectById('negative')?.carriedBy, 'c0');
    migrated.moveCharacter('c0', 's1');
    assert.equal(migrated.objectById('negative')?.sceneId, 's1');
});

test('welcome gate reads directed relationship tone', () => {
    const w = sampleWorld();
    assert.ok(w.welcome('c0', 'c1') > 0.6, 'warm 戀慕 edge opens the door');
    assert.equal(w.welcome('c1', 'c0'), 0.5, 'no edge → neutral');
    w.setEdge('c1', 'c0', '妒');
    assert.ok(w.welcome('c1', 'c0') < 0.5, 'jealous edge shuts the door');
});

test('self-model (coreIdentity + relationshipView) survives snapshot/restore', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-world-sm-'));
    const w = sampleWorld();
    w.addCoreIdentity('c0', '我認了：戲比天大');
    w.setRelationshipView('c0', 'c1', '師姐，這一晚我把話說了');
    w.snapshot(dir);
    const restored = WorldState.restore(dir);
    assert.deepEqual(restored.castById('c0')!.coreIdentity, ['我是坤生，女兒身扮小生', '我認了：戲比天大']);
    assert.equal(restored.relationshipView('c0', 'c1'), '師姐，這一晚我把話說了');
    // The self-model block injects both channels, current and un-evictable.
    const block = restored.selfModelBlock('c0', ['c1']);
    assert.ok(block.includes('我是坤生'), 'identity injected');
    assert.ok(block.includes('師姐，這一晚我把話說了'), 'current view injected');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('relationshipView is OVERWRITE latest-wins (not append) — old view superseded', () => {
    const w = sampleWorld();
    w.setRelationshipView('c0', 'c1', '舊情人，我只欠她一句交代');
    assert.equal(w.relationshipView('c0', 'c1'), '舊情人，我只欠她一句交代');
    // A changed relationship OVERWRITES — the entry is replaced, never doubled.
    w.setRelationshipView('c0', 'c1', '話說開了，兩清了');
    assert.equal(w.relationshipView('c0', 'c1'), '話說開了，兩清了', 'latest wins');
    assert.equal(Object.keys(w.castById('c0')!.relationshipView).length, 1, 'exactly one view per person — no stale+new pair');
    const block = w.selfModelBlock('c0', ['c1']);
    assert.ok(block.includes('話說開了，兩清了') && !block.includes('舊情人'), 'injected block shows ONLY the new view');
});

test('selfTies prefers the current view, falls back to edge tone', () => {
    const w = sampleWorld();
    // c0 has a view of c1 already; c0 has an edge to c1 too — view wins.
    assert.equal(w.selfTies('c0', ['c0', 'c1'])['c1'], '師姐，我暗慕著，話沒敢說');
    // c1 has no view of c0 but (after setEdge) an edge → tone fallback.
    w.setEdge('c1', 'c0', '競');
    assert.equal(w.selfTies('c1', ['c0', 'c1'])['c0'], '你對TA：競');
});
