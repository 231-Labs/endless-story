/**
 * Integration smoke — the fake agent drives the full tick pipeline for 8 ticks,
 * then a simulated restart continues. Asserts MECHANICALLY (RULES.md: machine
 * counters, no eyeballing):
 *   · beats occur in ≥2 distinct scenes,
 *   · night ticks route characters toward their home anchors,
 *   · the want ledger + recall survive a restore + 2 more ticks,
 *   · archive files exist and are non-empty.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { FileArchive } from '../src/adapters/local/file-archive.ts';
import { LocalClock } from '../src/adapters/local/clock.ts';
import { createWorldFromPreset } from '../src/preset.ts';
import { runTick, type TickReport } from '../src/tick.ts';
import { WorldState } from '../src/world-state.ts';
import type { ObserveSceneInput } from '../src/ports.ts';

const quiet = () => {}; // silence per-beat logging in the test

class RecordingSessionAgent extends FakeSceneAgent {
    observations: ObserveSceneInput[] = [];
    async observeScene(input: ObserveSceneInput): Promise<void> {
        this.observations.push(input);
    }
}

test('8-tick run + restart continues, with mechanical counters', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-smoke-'));
    const stateDir = path.join(dir, 'state');
    const memDir = path.join(dir, 'memory');
    const archiveDir = path.join(dir, 'archive');

    const agent = new RecordingSessionAgent();
    const recall = new LocalRecall(memDir);
    const archive = new FileArchive(archiveDir);
    const clock = new LocalClock();

    const { world } = await createWorldFromPreset('spring-snow', recall, { ticksPerDay: 6 });
    world.snapshot(stateDir);

    const deps = { agent, recall, archive, clock };
    const reports: TickReport[] = [];
    // Run 6 ticks (covers day 1 fully: dawn genesis → two night ticks).
    for (let i = 0; i < 6; i++) {
        reports.push(await runTick(world, deps, { snapshotDir: stateDir, log: quiet }));
    }

    // ── counter 1: beats in ≥2 distinct scenes ────────────────────────────────
    const distinctBeatScenes = new Set(reports.flatMap((r) => r.beatScenes));
    const totalBeats = reports.reduce((n, r) => n + r.beats, 0);
    assert.ok(distinctBeatScenes.size >= 2, `beats in ≥2 scenes (got ${distinctBeatScenes.size})`);
    assert.ok(totalBeats > 0, 'some beats occurred');

    // ── epistemic boundary: only actual witnesses receive an event ──────────
    const objectiveEvents = reports.flatMap((r) => r.events);
    assert.ok(objectiveEvents.length > 0, 'tick emitted frozen objective events');
    assert.ok(objectiveEvents.some((event) => event.witnessIds.length < world.data.cast.length), 'some events are off-scene for part of the cast');
    assert.ok(objectiveEvents.some((event) => event.visibility === 'private'), 'night produced a private event');
    for (const event of objectiveEvents) {
        const deliveries = agent.observations.filter((item) => item.event.id === event.id);
        assert.deepEqual(
            new Set(deliveries.map((item) => item.characterId)),
            new Set(event.witnessIds),
            `${event.id}: exactly the witnesses received it`,
        );
        assert.ok(deliveries.every((item) => event.witnessIds.includes(item.characterId)), 'no off-scene delivery');
    }

    // ── counter 2: night ticks route toward home anchors ──────────────────────
    const nightReports = reports.filter((r) => r.night);
    assert.ok(nightReports.length >= 1, 'at least one night tick in the run');
    let nightRoutedHome = 0;
    for (const r of nightReports) {
        for (const [id, sid] of Object.entries(r.routed)) {
            if (world.data.homeByChar[id] === sid) nightRoutedHome++;
        }
    }
    assert.ok(nightRoutedHome > 0, `night routed ≥1 char to their home (got ${nightRoutedHome})`);

    // ── counter 3: genesis grew wants ─────────────────────────────────────────
    const genesisTotal = reports.reduce((n, r) => n + r.genesisRan, 0);
    assert.ok(genesisTotal >= world.data.cast.length, `genesis ran for the cast (${genesisTotal})`);
    const liveBeforeRestart = world.data.wants.filter((x) => !x.retired).length;
    assert.ok(liveBeforeRestart > 0, 'live wants exist');

    // ── counter 4: archive files exist and are non-empty ──────────────────────
    const files = fs.readdirSync(archiveDir).filter((f) => f.endsWith('.md'));
    assert.ok(files.length > 0, 'archive wrote markdown files');
    for (const f of files) {
        assert.ok(fs.statSync(path.join(archiveDir, f)).size > 0, `${f} non-empty`);
    }
    const kinds = new Set(files.map((f) => f.split('-')[2]));
    assert.ok(kinds.has('shoujuan'), 'archived 手卷 (scene beats)');

    // ── simulated restart: fresh objects from disk, continue 2 ticks ──────────
    const wantsCountOnDisk = world.data.wants.length;
    const restored = WorldState.restore(stateDir);
    assert.equal(restored.data.wants.length, wantsCountOnDisk, 'want ledger survived the restart');
    assert.equal(restored.data.clock.currentTick, world.data.clock.currentTick, 'clock survived');

    // recall survived too — a genesis memory is still recallable after reopening.
    const recall2 = new LocalRecall(memDir);
    const anyId = restored.data.cast[0].id;
    const recalled = await recall2.recall(anyId, restored.data.cast[0].persona, 3, restored.data.clock.day);
    assert.ok(recalled.length > 0, 'recall store survived the restart');

    const agent2 = new FakeSceneAgent();
    const archive2 = new FileArchive(archiveDir);
    for (let i = 0; i < 2; i++) {
        await runTick(restored, { agent: agent2, recall: recall2, archive: archive2, clock }, { snapshotDir: stateDir, log: quiet });
    }
    assert.ok(
        restored.data.wants.length >= wantsCountOnDisk,
        'the ledger continued growing after the restart',
    );

    fs.rmSync(dir, { recursive: true, force: true });
});
