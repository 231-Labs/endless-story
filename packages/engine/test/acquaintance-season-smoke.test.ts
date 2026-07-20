/**
 * 相識分寸 · flagship integration smoke — the shipped spring-snow-market season with
 * subjective naming ON. Deterministic FakeSceneAgent, no LLM. Proves the acquaintance
 * layer composes with the whole tick stack: the season seeds a real acquaintance map
 * (some genuine strangers remain, so the seed didn't just name everyone), a week of
 * ticks throws nothing and the money invariant holds every tick, and co-presence
 * actually deepens acquaintance — a pair that began strangers rises by sharing a
 * played scene. The shared anchun acceptance fixture is never touched.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { runTick } from '../src/tick.ts';
import { auditSeasonEconomy } from '../src/core/season-economy.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile, loadSeasonFrameFile, seedRelationshipViews } from '../src/preset.ts';
import { seedAcquaintance } from '../src/core/acquaintance.ts';
import { WorldState } from '../src/world-state.ts';
import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import type { ArchivePort } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };

/** The shipped spring-snow-market world with the flag on, wired exactly as the run
 *  harness does it: apply the frame, seed canon views, THEN turn on subjective
 *  naming and seed the acquaintance map (so co-workers/edge-holders start named). */
function buildFlagOnWorld(): WorldState {
    const raw = loadPresetFile('spring-snow');
    const world = buildWorldState(raw);
    applySeasonFrame(world, loadSeasonFrameFile('spring-snow-market'));
    world.data.relationshipFallback = true;
    seedRelationshipViews(world, raw.relationship_views ?? []);
    // the frame declares subjectiveNaming; mirror the manager/CLI wiring.
    assert.equal(loadSeasonFrameFile('spring-snow-market').subjectiveNaming, true, 'the shipped season declares subjective naming');
    world.data.subjectiveNaming = true;
    seedAcquaintance(world);
    return world;
}

function sceneId(world: WorldState, name: string): string {
    return world.data.scenes.find((s) => s.name === name)!.id;
}

test('the flag-on spring-snow-market season runs a week composed, conserving, and deepens a stranger by co-presence', async () => {
    const world = buildFlagOnWorld();

    // the seed left GENUINE strangers (not everyone was named) — the feature is live.
    const ids = world.data.cast.map((m) => m.id);
    const strangerPairs = ids.flatMap((a) => ids.filter((b) => b !== a && world.acquaintLevel(a, b) === 'stranger').map((b) => [a, b] as const));
    assert.ok(strangerPairs.length > 0, 'the acquaintance seed leaves real strangers on day 1');

    // pick a mutual-stranger pair and put them together in the public 戲園前街 so a
    // played day scene co-locates them; FakeSceneAgent never moves, so the pull holds.
    const pair = strangerPairs.find(([a, b]) => world.acquaintLevel(b, a) === 'stranger') ?? strangerPairs[0];
    const [a, b] = pair;
    assert.equal(world.acquaintLevel(a, b), 'stranger');
    const street = sceneId(world, '戲園前街');
    world.moveCharacter(a, street);
    world.moveCharacter(b, street);

    const deps = { agent: new FakeSceneAgent(), recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock(), economy: new LocalEconomy() };
    assert.deepEqual(auditSeasonEconomy(world), [], 'the fresh flag-on world conserves');

    const ticksPerDay = world.data.clock.ticksPerDay;
    for (let i = 0; i < ticksPerDay * 2; i++) {
        await runTick(world, deps, { log: () => {} }); // a throw here fails the test
        assert.deepEqual(auditSeasonEconomy(world), [], `conservation held through tick ${i}`);
    }

    // co-presence deepened the once-stranger pair (monotonic — it only ever rose).
    assert.notEqual(world.acquaintLevel(a, b), 'stranger', 'a co-present pair rose above stranger');
    assert.notEqual(world.acquaintLevel(b, a), 'stranger', 'and the reverse direction rose too');
});
