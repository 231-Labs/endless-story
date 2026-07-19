/**
 * Structural relationship fallback plumbing — (c) etiquette wired always-on,
 * (b)+(a1) seeded canon views + nightly self-model consolidation behind the
 * world flag. These are PLUMBING tests (deterministic, no LLM); the behavioral
 * gap is measured on a long-season A/B with mechanical counters.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile, seedRelationshipViews } from '../src/preset.ts';
import { runTick } from '../src/tick.ts';
import type { WorldState } from '../src/world-state.ts';
import type { ArchivePort, EvolveSecretInput, SelfModelConsolidateInput, SelfModelConsolidateReply } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };

function deps(agent: FakeSceneAgent) {
    return { agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock(), economy: new LocalEconomy() };
}

function seasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    return world;
}

class BeatRecordingAgent extends FakeSceneAgent {
    beatInputs: CharacterAgentNs.ActBeatInput[] = [];
    consolidations: SelfModelConsolidateInput[] = [];
    secretEvolutions: EvolveSecretInput[] = [];

    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        this.beatInputs.push(input);
        return super.actBeat(input);
    }

    override async consolidateSelfModel(input: SelfModelConsolidateInput): Promise<SelfModelConsolidateReply> {
        this.consolidations.push(input);
        return {
            relationshipViews: input.interactions.map((it) => ({ otherId: it.otherId, view: `今日之後我對TA另有一番看法（第${input.day}日）` })),
            identityInsight: input.day === 1 ? '我比自己以為的更在意這班人' : undefined,
        };
    }

    override async evolveSecret(input: EvolveSecretInput): Promise<string | null> {
        this.secretEvolutions.push(input);
        if (!input.landed.length) return null;
        return `心事挪了一步：${input.landed[0].slice(0, 20)}之後，懸著的成了往後怎麼走。`;
    }
}

test('(c) etiquette: the preset 稱謂鐵則 reaches every scene beat', async () => {
    const world = seasonWorld();
    assert.match(world.data.etiquette ?? '', /蘇映雪為師姐/);

    const agent = new BeatRecordingAgent();
    await runTick(world, deps(agent), { log: () => {} });
    assert.ok(agent.beatInputs.length > 0, 'the day-1 world plays at least one beat');
    assert.ok(
        agent.beatInputs.every((input) => input.etiquette?.includes('蘇映雪為師姐')),
        'every beat carries the canon honorifics facts',
    );
    assert.ok(
        // charter is now derived from the clock: this season is 6 ticks/day → 「一日6拍」,
        // and every beat still states the one-action-per-tick constitution.
        agent.beatInputs.every((input) => input.timeCharter?.includes('一日6拍') && input.timeCharter?.includes('每一拍你只有一次行動')),
        'every beat carries the clock constitution (derived from ticks-per-day)',
    );
    assert.ok(
        agent.beatInputs.every((input) => input.timeCharter?.includes('日結')),
        'the charter states when the ledger settles',
    );
});

test('(a1) seeded canon views ride ties into beats — only under the flag wiring', async () => {
    const raw = loadPresetFile('spring-snow');
    const world = seasonWorld();
    world.data.relationshipFallback = true;
    const seeded = seedRelationshipViews(world, (raw as { relationship_views?: Array<{ from: string; to: string; view: string }> }).relationship_views ?? []);
    assert.ok(seeded >= 6, `seeds the authored canon views, got ${seeded}`);

    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    assert.match(world.relationshipView(liu, su) ?? '', /師姐給的是魂/);
    assert.match(world.selfTies(liu, [liu, su])[su] ?? '', /師姐給的是魂/);

    // and the tie reaches the actual beat prompt input when both share a scene
    const agent = new BeatRecordingAgent();
    await runTick(world, deps(agent), { log: () => {} });
    const liuBeats = agent.beatInputs.filter((input) => input.name === '柳安春');
    const withSu = liuBeats.filter((input) => input.others.some((other) => other.name === '蘇映雪'));
    if (withSu.length) {
        assert.ok(
            withSu.some((input) => input.others.find((other) => other.name === '蘇映雪')?.tie?.includes('師姐給的是魂')),
            '柳安春 sees her authored view of 蘇映雪 when they share a scene',
        );
    }
});

test('(b) nightly consolidation OVERWRITES views at day end — flag on only', async () => {
    const on = seasonWorld();
    on.data.relationshipFallback = true;
    const onAgent = new BeatRecordingAgent();
    const onDeps = deps(onAgent);
    for (let i = 0; i < 6; i++) await runTick(on, onDeps, { log: () => {} }); // day 1 incl. 深宵
    assert.ok(onAgent.consolidations.length > 0, 'day end consolidates whoever interacted');
    const sample = onAgent.consolidations[0];
    assert.ok(sample.interactions.length > 0);
    assert.ok(sample.interactions[0].todayText.length > 0, 'consolidation is grounded in the day\'s actual lines');
    const someActor = on.idByName(sample.name)!;
    const someOther = sample.interactions[0].otherId;
    assert.match(on.relationshipView(someActor, someOther) ?? '', /今日之後我對TA另有一番看法/);
    assert.ok(on.castById(someActor)!.coreIdentity.includes('我比自己以為的更在意這班人'));
    assert.equal(on.data.dayAccum.interactions, undefined, 'the day bank resets after consolidation');

    const off = seasonWorld();
    const offAgent = new BeatRecordingAgent();
    const offDeps = deps(offAgent);
    for (let i = 0; i < 6; i++) await runTick(off, offDeps, { log: () => {} });
    assert.equal(offAgent.consolidations.length, 0, 'without the flag the nightly phase never runs');
    assert.equal(offAgent.secretEvolutions.length, 0, 'without the flag the secret never self-evolves');
});

class LandingAgent extends BeatRecordingAgent {
    override async judgeWantResolved(
        input: Parameters<FakeSceneAgent['judgeWantResolved']>[0],
    ): ReturnType<FakeSceneAgent['judgeWantResolved']> {
        return { resolved: true, note: `${input.name}把「${input.wantDesc}」當面說開了` };
    }
}

test('(b) 心事自改: a landed want moves the secret, bedrock canonSeed stays pinned', async () => {
    const world = seasonWorld();
    world.data.relationshipFallback = true;
    const agent = new LandingAgent();
    const agentDeps = deps(agent);
    for (let i = 0; i < 6; i++) await runTick(world, agentDeps, { log: () => {} });

    // FakeSceneAgent resolves ~1/3 of judged wants, so day 1 lands something.
    assert.ok(agent.secretEvolutions.length > 0, 'a landed day triggers 心事自改');
    const evolvedInput = agent.secretEvolutions[0];
    assert.ok(evolvedInput.landed.length > 0);
    assert.ok(evolvedInput.canonSeed, 'the immutable seed rides along as the history guard');

    const member = world.data.cast.find((candidate) => candidate.name === evolvedInput.name)!;
    assert.match(member.secret ?? '', /心事挪了一步/);
    assert.equal(member.secretSeed, evolvedInput.canonSeed, 'bedrock never moves');
    assert.notEqual(member.secret, member.secretSeed);
    assert.equal(world.data.dayAccum.landedByChar, undefined, 'the landed bank resets after the night');
});
