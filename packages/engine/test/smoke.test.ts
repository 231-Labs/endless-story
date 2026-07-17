/**
 * Integration smoke — the fake agent drives the full tick pipeline for 8 ticks,
 * then a simulated restart continues. Asserts MECHANICALLY (RULES.md: machine
 * counters, no eyeballing):
 *   · beats occur in ≥2 distinct scenes,
 *   · no clock phase teleports characters outside their autonomous choice,
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
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { createWorldFromPreset } from '../src/preset.ts';
import { runTick, type TickReport } from '../src/tick.ts';
import { WorldState } from '../src/world-state.ts';
import { newWant } from '../src/core/want-core.ts';
import type {
    MoveDecideInput,
    MoveDecideResult,
    ObserveSceneInput,
    RippleJudgeDelta,
    RippleJudgeInput,
} from '../src/ports.ts';

const quiet = () => {}; // silence per-beat logging in the test

class RecordingSessionAgent extends FakeSceneAgent {
    observations: ObserveSceneInput[] = [];
    rippleRosters: string[][] = [];
    sceneReviews: Array<Parameters<FakeSceneAgent['reviewScene']>[0]> = [];
    async observeScene(input: ObserveSceneInput): Promise<void> {
        this.observations.push(input);
    }
    async judgeRipples(input: RippleJudgeInput): Promise<RippleJudgeDelta[]> {
        this.rippleRosters.push(input.roster.map((member) => member.characterId));
        return [];
    }
    async reviewScene(input: Parameters<FakeSceneAgent['reviewScene']>[0]) {
        this.sceneReviews.push(input);
        return {
            beats: input.beats.map((beat, index) => ({
                ...beat,
                text: index === 0 ? `${beat.text}〔已校〕` : beat.text,
            })),
        };
    }
}

class OneCharacterMovesAgent extends FakeSceneAgent {
    private readonly moverName: string;
    private readonly targetSceneId: string;

    constructor(moverName: string, targetSceneId: string) {
        super();
        this.moverName = moverName;
        this.targetSceneId = targetSceneId;
    }

    async decideMove(input: MoveDecideInput): Promise<MoveDecideResult> {
        if (input.name !== this.moverName) return { move: false, reason: 'test: stay' };
        const target = input.options.find((option) => option.sceneId === this.targetSceneId);
        return target
            ? { move: true, targetSceneId: target.sceneId, reason: 'test: follow a live intention' }
            : { move: false, reason: 'test: target is not a legal affordance' };
    }
}

class CrowdMovesAgent extends FakeSceneAgent {
    readonly moveCalls: MoveDecideInput[] = [];
    private readonly targetSceneId: string;

    constructor(targetSceneId: string) {
        super();
        this.targetSceneId = targetSceneId;
    }

    async decideMove(input: MoveDecideInput): Promise<MoveDecideResult> {
        this.moveCalls.push(input);
        const target = input.options.find((option) => option.sceneId === this.targetSceneId);
        return target
            ? { move: true, targetSceneId: target.sceneId, reason: 'test: converge' }
            : { move: false, reason: 'test: destination unavailable' };
    }
}

class RecordingStayAgent extends FakeSceneAgent {
    readonly moveCalls: MoveDecideInput[] = [];
    async decideMove(input: MoveDecideInput): Promise<MoveDecideResult> {
        this.moveCalls.push(input);
        return { move: false, reason: 'test: stay by choice' };
    }
}

test('night and dawn never move a character who chose to stay', async () => {
    for (const [tick, label] of [[4, 'night'], [0, 'dawn']] as const) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), `es-no-teleport-${label}-`));
        const recall = new LocalRecall(path.join(dir, 'memory'));
        const archive = new FileArchive(path.join(dir, 'archive'));
        const clock = new LocalClock();
        const { world } = await createWorldFromPreset('spring-snow', recall, { ticksPerDay: 6 });
        const origin = world.data.scenes.find((scene) => scene.name === '雲錦台戲台');
        assert.ok(origin);
        for (const member of world.data.cast) world.data.roster[member.id] = origin.id;
        world.data.clock = makeClock(6, tick);
        const before = { ...world.data.roster };
        const agent = new RecordingStayAgent();

        const report = await runTick(world, { agent, recall, archive, clock }, { log: quiet });

        assert.deepEqual(world.data.roster, before, `${label}: canonical roster changes only after an agent move`);
        assert.deepEqual(report.routed, {}, `${label}: report contains no hidden routing`);
        assert.ok(agent.moveCalls.length > 0, `${label}: agents still received their legal affordances`);
        assert.ok(
            agent.moveCalls.some((input) => input.options.some((option) => option.isHome)),
            `${label}: home is labeled as an affordance`,
        );
        assert.ok(
            agent.moveCalls.some((input) => input.options.some((option) => option.isWork)),
            `${label}: work is labeled as an affordance`,
        );
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('an agent-selected legal scene id commits autonomous movement to world state', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-movement-'));
    const recall = new LocalRecall(path.join(dir, 'memory'));
    const archive = new FileArchive(path.join(dir, 'archive'));
    const clock = new LocalClock();
    const { world } = await createWorldFromPreset('spring-snow', recall, { ticksPerDay: 6 });

    const mover = world.data.cast.find((member) => member.name === '柳安春');
    assert.ok(mover, '柳安春 exists in the formal seed');
    const dawnWorkSceneId = world.data.workByChar[mover.id];
    const target = world.data.scenes.find(
        (scene) => scene.privacyLevel < 3 && scene.id !== dawnWorkSceneId,
    );
    assert.ok(target, 'the world offers a second public scene');

    const report = await runTick(
        world,
        {
            agent: new OneCharacterMovesAgent(mover.name, target.id),
            recall,
            archive,
            clock,
        },
        { log: quiet },
    );

    assert.equal(report.routed[mover.id], target.id, 'tick report records the chosen scene id');
    assert.equal(world.data.roster[mover.id], target.id, 'canonical roster commits the movement');

    fs.rmSync(dir, { recursive: true, force: true });
});

test('scene capacity and travel cooldown prevent greedy convergence and oscillation', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-movement-physics-'));
    const recall = new LocalRecall(path.join(dir, 'memory'));
    const archive = new FileArchive(path.join(dir, 'archive'));
    const clock = new LocalClock();
    const { world } = await createWorldFromPreset('spring-snow', recall, { ticksPerDay: 6 });
    const origin = world.data.scenes.find((scene) => scene.name === '雲錦台戲台');
    const target = world.data.scenes.find((scene) => scene.name === '夜碼頭');
    assert.ok(origin && target);
    target.capacity = 2;
    for (const member of world.data.cast) world.data.roster[member.id] = origin.id;
    world.data.clock = makeClock(6, 1); // not dawn: keep the controlled roster

    const agent = new CrowdMovesAgent(target.id);
    await runTick(world, { agent, recall, archive, clock }, { log: quiet });
    const movedIds = Object.keys(world.data.lastMovedTickByChar ?? {});
    assert.equal(movedIds.length, 2, 'only two characters can enter a capacity-2 scene');
    assert.equal(
        world.data.cast.filter((member) => world.data.roster[member.id] === target.id).length,
        2,
        'canonical roster never exceeds scene capacity',
    );

    const callsBeforeSecondTick = agent.moveCalls.length;
    await runTick(world, { agent, recall, archive, clock }, { log: quiet });
    const secondTickNames = new Set(agent.moveCalls.slice(callsBeforeSecondTick).map((input) => input.name));
    for (const movedId of movedIds) {
        assert.ok(!secondTickNames.has(world.nameById(movedId)), 'a recent mover rests for one tick before choosing travel again');
    }

    fs.rmSync(dir, { recursive: true, force: true });
});

test('an occupied private home is not a legal move without an explicitly warm welcome', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-private-access-'));
    const recall = new LocalRecall(path.join(dir, 'memory'));
    const archive = new FileArchive(path.join(dir, 'archive'));
    const clock = new LocalClock();
    const { world } = await createWorldFromPreset('spring-snow', recall, { ticksPerDay: 6 });
    const publicScene = world.data.scenes.find((scene) => scene.name === '雲錦台戲台');
    const privateHome = world.data.scenes.find((scene) => scene.name === '沈宅小樓');
    const owner = world.data.cast.find((member) => member.name === '沈雪笙');
    assert.ok(publicScene && privateHome && owner);
    for (const member of world.data.cast) world.data.roster[member.id] = publicScene.id;
    world.data.roster[owner.id] = privateHome.id;
    world.data.clock = makeClock(6, 1);

    const agent = new CrowdMovesAgent(privateHome.id);
    await runTick(world, { agent, recall, archive, clock }, { log: quiet });
    const outsider = agent.moveCalls.find((input) => input.name === '唐桂蘭');
    assert.ok(outsider, 'outsider received a movement turn');
    assert.ok(
        !outsider.options.some((option) => option.sceneId === privateHome.id),
        'the private home was absent from the outsider affordance list',
    );

    fs.rmSync(dir, { recursive: true, force: true });
});

test('a deliberate night arrival forms an encounter outside private-home tryst rules', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-night-arrival-'));
    const recall = new LocalRecall(path.join(dir, 'memory'));
    const archive = new FileArchive(path.join(dir, 'archive'));
    const clock = new LocalClock();
    const { world } = await createWorldFromPreset('spring-snow', recall, { ticksPerDay: 6 });
    const mover = world.data.cast.find((member) => member.name === '柳安春');
    const host = world.data.cast.find((member) => member.name === '金鳳');
    const wardrobe = world.data.scenes.find((scene) => scene.name === '衣箱房');
    assert.ok(mover && host && wardrobe);
    wardrobe.capacity = 3; // 唐桂蘭 already sleeps here; leave one arrival slot.
    world.data.homeByChar[host.id] = wardrobe.id;
    world.data.roster[host.id] = wardrobe.id;
    world.data.clock = makeClock(6, 4);
    world.data.wants.push(
        newWant({
            characterId: mover.id,
            layer: '志向',
            desc: '今夜去衣箱房找金鳳說清舊帳',
            target: host.id,
            weight: 0.8,
            sat: 0.2,
            resistance: 5,
            kind: 'narrative',
            source: 'owner',
            bornTick: 0,
        }),
        newWant({
            characterId: host.id,
            layer: '志向',
            desc: '等柳安春來把舊帳說清',
            target: mover.id,
            weight: 0.8,
            sat: 0.2,
            resistance: 5,
            kind: 'narrative',
            source: 'owner',
            bornTick: 0,
        }),
    );

    const report = await runTick(
        world,
        { agent: new OneCharacterMovesAgent(mover.name, wardrobe.id), recall, archive, clock },
        { log: quiet },
    );
    assert.ok(report.beatScenes.includes(wardrobe.id), 'the intentional semi-private night meeting was played');
    assert.ok(report.beats > 0, 'the arrival became observable story rather than a fast-forwarded position change');

    fs.rmSync(dir, { recursive: true, force: true });
});

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
    for (const event of objectiveEvents) {
        const deliveries = agent.observations.filter((item) => item.event.id === event.id);
        assert.deepEqual(
            new Set(deliveries.map((item) => item.characterId)),
            new Set(event.witnessIds),
            `${event.id}: exactly the witnesses received it`,
        );
        assert.ok(deliveries.every((item) => event.witnessIds.includes(item.characterId)), 'no off-scene delivery');
    }
    assert.ok(agent.sceneReviews.length > 0, 'multi-character scenes run the quality review before freezing');
    assert.ok(
        agent.sceneReviews.every((review) => review.participants.every((p) => Boolean(p.bodyFact))),
        'the review receives data-driven body facts for pronoun repair',
    );
    assert.ok(
        objectiveEvents.some((event) => event.beats[0]?.text.endsWith('〔已校〕')),
        'the repaired text, not the raw beat, is what enters canonical events',
    );
    const socialEvents = objectiveEvents.filter((event) => event.witnessIds.length > 1);
    assert.equal(agent.rippleRosters.length, socialEvents.length, 'only witnessed social events get a ripple judgment');
    for (let i = 0; i < socialEvents.length; i++) {
        assert.deepEqual(
            new Set(agent.rippleRosters[i]),
            new Set(socialEvents[i].witnessIds),
            `${socialEvents[i].id}: only witnesses may receive a want ripple`,
        );
    }
    assert.ok(agent.rippleRosters.every((roster) => roster.length > 1), 'a solo beat never self-replicates through ripple');

    // ── counter 2: a stay decision remains authoritative at night ────────────
    const nightReports = reports.filter((r) => r.night);
    assert.ok(nightReports.length >= 1, 'at least one night tick in the run');
    assert.ok(nightReports.every((report) => Object.keys(report.routed).length === 0), 'fake stay never triggers hidden night routing');

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
