/**
 * 劇本產出 end-to-end through runTick — deterministic (FakeSceneAgent, no LLM).
 * The flag-gated action layer must: (on) let a production be proposed, accrue
 * effort, and premiere at day-end, surfacing a 世界 beat + a report.production
 * snapshot; (off) never run — chooseAction has zero effect on the world.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { buildWorldState, loadPresetFile } from '../src/preset.ts';
import { runTick, type TickReport } from '../src/tick.ts';
import type { ArchivePort } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };
function deps() {
    return { agent: new FakeSceneAgent(), recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock(), economy: new LocalEconomy() };
}

test('flag ON: a production is proposed, accrues effort, and premieres at day-end', async () => {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    world.data.emergentProduction = true;
    const d = deps();

    const reports: TickReport[] = [];
    for (let i = 0; i < 12; i++) reports.push(await runTick(world, d, { log: () => {} })); // 2 days

    const prod = world.data.production;
    assert.ok(prod, 'a production was proposed');
    assert.ok(prod!.contributors.length >= 2, 'it drew real collaborators');
    assert.ok(prod!.scriptFragments.length > 0, 'it accrued script fragments');
    assert.equal(prod!.status, 'premiered', 'it reached premiere within two days');
    assert.ok(prod!.premieredDay, 'the premiere day is stamped');

    // the report carried a production snapshot for the lab panel
    assert.ok(reports.some((r) => r.production?.status === 'premiered'), 'report.production reflects the premiere');

    // the proposal and the premiere surfaced as public 世界 beats (lab 拍流)
    const worldBeats = reports.flatMap((r) => r.events).flatMap((e) => e.beats).filter((b) => b.characterId === '__world__');
    assert.ok(worldBeats.some((b) => b.text.includes('提議排一齣新戲')), 'the proposal surfaced');
    assert.ok(worldBeats.some((b) => b.text.includes('首演')), 'the premiere surfaced');
});

test('flag OFF: the action layer never runs — no production materializes', async () => {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    // emergentProduction left undefined (default off)
    const d = deps();
    const reports: TickReport[] = [];
    for (let i = 0; i < 12; i++) reports.push(await runTick(world, d, { log: () => {} }));

    assert.equal(world.data.production, undefined, 'no production without the flag');
    assert.ok(reports.every((r) => r.production === undefined), 'report never carries a production');
    const worldBeats = reports.flatMap((r) => r.events).flatMap((e) => e.beats).filter((b) => b.characterId === '__world__');
    assert.ok(!worldBeats.some((b) => b.text.includes('新戲')), 'no production world beats leak');
});
