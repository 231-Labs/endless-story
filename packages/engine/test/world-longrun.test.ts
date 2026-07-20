/**
 * 世界合流 — the long-run stability proof.
 *
 * By now the tick composes ~20 mechanisms (hunger→食肆, distance movement, access
 * keys, bond/established seed, confide/prayer/aid steps, skills threading, box
 * office by talent, 撞破 routing, gift/aid bond warmth, nightly regenerate/evolve
 * /self-model, production). This run drives the SHIPPED spring-snow-market season
 * a full week under the deterministic FakeSceneAgent with every flag on, and
 * asserts the composed world stays coherent: no throw, the money invariant holds
 * EVERY tick, nobody vanishes, and the whole world still JSON round-trips (the
 * snapshot/restore contract). A pure integration guard — no LLM, no credits.
 * The shared anchun acceptance fixture is never touched.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { runTick } from '../src/tick.ts';
import { auditSeasonEconomy } from '../src/core/season-economy.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile, loadSeasonFrameFile } from '../src/preset.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import type { ArchivePort } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };

test('the shipped spring-snow-market season runs a full week composed, conserving every tick', async () => {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, loadSeasonFrameFile('spring-snow-market'));
    // every optional layer ON, so the deterministic paths of the whole stack run.
    world.data.relationshipFallback = true;
    world.data.emergentProduction = true;

    const deps = { agent: new FakeSceneAgent(), recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock(), economy: new LocalEconomy() };

    const cast0 = world.data.cast.length;
    const accountIds0 = Object.keys(world.data.economy!.state.accounts).sort();
    assert.deepEqual(auditSeasonEconomy(world), [], 'the fresh composed world conserves');

    const ticksPerDay = world.data.clock.ticksPerDay;
    const days = 7;
    for (let i = 0; i < ticksPerDay * days; i++) {
        // a throw here fails the test — that IS the "no mechanism breaks another" guard.
        await runTick(world, deps, { log: () => {} });
        // the money invariant must hold after EVERY tick, not just at settle.
        assert.deepEqual(
            auditSeasonEconomy(world),
            [],
            `conservation held through tick ${i} (day ${world.data.clock.day}, ${world.data.clock.partOfDay})`,
        );
    }

    // nobody vanished (no mortality yet) and no account was dropped or invented.
    assert.equal(world.data.cast.length, cast0, 'the cast is intact across the week');
    assert.deepEqual(Object.keys(world.data.economy!.state.accounts).sort(), accountIds0, 'the account set is stable');

    // the whole living world still JSON round-trips (snapshot = JSON.stringify(data)),
    // and the restored world still conserves — the persistence contract survives a
    // week of every mechanism writing into WorldStateData (bonds, accessGrants,
    // prayers, establishedPairs, aidGivenTodayByChar, production, …).
    const restored = new WorldState(JSON.parse(JSON.stringify(world.data)) as WorldStateData);
    assert.deepEqual(auditSeasonEconomy(restored), [], 'the round-tripped world still conserves');
    assert.equal(restored.data.cast.length, cast0, 'round-trip preserves the cast');
});
