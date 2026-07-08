/**
 * Preset loading — the spring-snow world builds with cast, scenes (privacy),
 * anchors and genesis memories.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorldState, loadPresetFile, seedGenesisMemories } from '../src/preset.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';

test('loadPresetFile + buildWorldState assembles the spring-snow world', () => {
    const raw = loadPresetFile('spring-snow');
    const world = buildWorldState(raw);
    assert.ok(world.data.cast.length >= 5, 'cast seeded');
    assert.ok(world.data.scenes.length >= 5, 'scenes seeded');
    assert.ok(world.data.sagaPremise.length > 0, 'premise present');
    // Every character has a resolved home + work anchor (loud throw on mismatch,
    // so reaching here means all preset scene names resolved).
    for (const c of world.data.cast) {
        assert.ok(world.data.homeByChar[c.id], `${c.name} has a home`);
        assert.ok(world.data.workByChar[c.id], `${c.name} has a work anchor`);
        assert.equal(world.data.roster[c.id], world.data.workByChar[c.id], 'day starts at work');
    }
    // Private homes exist (privacy ≥ 3) so night trysts are physically possible.
    assert.ok(world.data.scenes.some((s) => s.privacyLevel >= 3), 'has a private scene');
    // Secrets carried onto the cast (the field production stripped from POV).
    assert.ok(world.data.cast.some((c) => c.secret && c.secret.length > 0), 'secrets present');
    // Clock starts at day 1.
    assert.equal(world.data.clock.day, 1);
    assert.equal(world.data.clock.currentTick, 0);
});

test('seedGenesisMemories writes the preset memories into recall', async () => {
    const raw = loadPresetFile('spring-snow');
    const world = buildWorldState(raw);
    const recall = new LocalRecall(); // in-memory (no dir)
    const seeded = await seedGenesisMemories(raw, world, recall);
    assert.ok(seeded > 0, 'some genesis memories seeded');
    // A character with authored memories can recall at least one.
    const withMems = raw.founding_cast?.find((c) => (c.memories?.length ?? 0) > 0);
    assert.ok(withMems, 'preset has a character with memories');
    const id = world.idByName(withMems!.name)!;
    const hits = await recall.recall(id, withMems!.memories![0], 3, 1);
    assert.ok(hits.length > 0, 'seeded memory is recallable');
});
