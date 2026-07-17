import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile, reconcileSeasonObjects } from '../src/preset.ts';
import { buildSeasonOpeningEvent, seedSeasonOpening } from '../src/season-opening.ts';
import { runTick } from '../src/tick.ts';
import type { ArchiveArtifact, ArchivePort, MoveDecideInput } from '../src/ports.ts';

class SituationRecordingAgent extends FakeSceneAgent {
    moveInputs: MoveDecideInput[] = [];

    async decideMove(input: MoveDecideInput) {
        this.moveInputs.push(input);
        return { move: false, reason: 'test: stay' };
    }
}

test('season opening is one public event perceived by the full cast', () => {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    const frame = buildAnchunAcceptanceFrame();
    const event = buildSeasonOpeningEvent(world, frame);

    assert.equal(event.visibility, 'public');
    assert.equal(event.sceneName, '後台妝閣');
    assert.equal(event.witnessIds.length, world.data.cast.length);
    assert.deepEqual(event.beats[0].perceiverIds, event.witnessIds);
    assert.match(event.beats[0].text, /副刊校樣/);
    assert.match(event.beats[0].text, /第三日子夜/);
});

test('season opening enters every recall ledger and the objective archive', async () => {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    const frame = buildAnchunAcceptanceFrame();
    const recall = new LocalRecall();
    const artifacts: ArchiveArtifact[] = [];
    const archive: ArchivePort = { commit: async (artifact) => { artifacts.push(artifact); } };

    const event = await seedSeasonOpening(world, frame, {
        agent: new FakeSceneAgent(),
        recall,
        archive,
    });

    for (const member of world.data.cast) {
        const hits = await recall.recall(member.id, '副刊校樣 第三日子夜', 3, 1);
        assert.ok(hits.some((hit) => hit.text.includes('副刊校樣')), `${member.name} received the opening`);
    }
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].eventId, event.id);
    assert.ok(world.data.dayAccum.lines.some((line) => line.includes('副刊校樣')));
});

test('a scheduled deadline enters canon once and reaches movement as a current percept', async () => {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    const frame = buildAnchunAcceptanceFrame();
    applySeasonFrame(world, frame);
    world.data.clock = makeClock(6, 17);

    const recall = new LocalRecall();
    const artifacts: ArchiveArtifact[] = [];
    const archive: ArchivePort = { commit: async (artifact) => { artifacts.push(artifact); } };
    const agent = new SituationRecordingAgent();
    const report = await runTick(world, { agent, recall, archive, clock: new LocalClock(), economy: new LocalEconomy() }, { log: () => {} });

    const deadline = report.events.find((event) => event.id.endsWith(':scheduled:deadline-last-hour'));
    assert.ok(deadline, 'deadline is a frozen canonical event');
    assert.match(deadline.beats[0].text, /世界的鐘不再停/);
    assert.ok(
        agent.moveInputs.every((input) => input.currentSituation?.includes('最後一通催稿電話')),
        'every public witness receives the deadline before choosing movement',
    );
    assert.deepEqual(world.data.deliveredScheduledEventIds, ['deadline-last-hour']);
    assert.ok(artifacts.some((artifact) => artifact.eventId === deadline.id), 'deadline is archived objectively');
});

test('resume reconciliation adds omitted objects without overwriting existing physics', () => {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    const frame = buildAnchunAcceptanceFrame();
    applySeasonFrame(world, frame);
    const contract = world.objectById('anchun-exclusive-contract');
    assert.ok(contract);
    contract.state = '已由角色改寫';
    world.data.objects = world.data.objects?.filter((object) => object.id !== 'stopped-watch');

    assert.equal(reconcileSeasonObjects(world, frame), 1);
    assert.equal(reconcileSeasonObjects(world, frame), 0, 'reconciliation is idempotent');
    assert.equal(world.objectById('anchun-exclusive-contract')?.state, '已由角色改寫');
    const watch = world.objectById('stopped-watch');
    assert.equal(world.sceneNameById(watch?.sceneId ?? ''), '沈宅小樓');
    assert.equal(watch?.visibility, 'hidden');
    assert.deepEqual(
        new Set(watch?.knownBy),
        new Set([world.idByName('沈雪笙'), world.idByName('唐桂蘭')]),
    );
});
