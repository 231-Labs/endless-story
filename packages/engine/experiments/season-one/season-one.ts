/**
 * Season One — end-to-end harness entry (SEASON_ONE_SLICE). Runs the full
 * four-layer pipeline for ~10 ticks and asserts MECHANICALLY, printing a counter
 * block (RULES.md: machine counters, no eyeballing).
 *
 * FAKE-LLM smoke (default, zero keys — this round's deliverable):
 *   ./node_modules/.bin/tsx experiments/season-one/season-one.ts
 *
 * REAL-LLM run (later; STOP here for this round). Keys via env, never hardcoded:
 *   POE_API_KEY=… AI_PROVIDER=poe \
 *   [OPENAI_API_KEY=… for embeddings] \
 *   SEASON_REAL_LLM=1 ./node_modules/.bin/tsx experiments/season-one/season-one.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';

import { FakeSceneAgent, LocalRecall, FileArchive, LocalClock, type SceneAgentPort } from '../../src/index.ts';
import { runSeason, type SeasonResult } from './harness.ts';

const REAL = process.env.SEASON_REAL_LLM === '1';
const TOTAL_TICKS = 10;

async function makeAgent(): Promise<SceneAgentPort> {
    if (!REAL) return new FakeSceneAgent();
    // Real agent pulls the runner .js graph — only under tsx, only when asked.
    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    return new RunnerSceneAgent();
}

function printCounterBlock(r: SeasonResult): void {
    const p = r.play;
    const bo = r.boxOffice!;
    const pred = r.predicate!;
    const chaptersEveryTick = r.chapterByTick.every((c) => c !== null);
    const L: string[] = [];
    L.push('');
    L.push('==================== SEASON ONE — MECHANICAL COUNTER BLOCK ====================');
    L.push(`mode................................ ${REAL ? 'REAL-LLM' : 'FAKE-LLM smoke'}`);
    L.push(`cast (7)........................... ${r.castNames.join('、')}`);
    L.push(`central question................... ${r.cfg.centralQuestion}`);
    L.push(`prologue injected at t0............ ${r.prologueAtT0 ? 'YES' : 'NO'}`);
    L.push(`deadline fact present every tick... ${r.deadlineEveryTick ? 'YES' : 'NO'}`);
    L.push(`deadline daysLeft by tick.......... ${r.daysLeftByTick.join(' → ')}`);
    const strictlyDown = r.daysLeftByTick.every((d, i) => i === 0 || d < r.daysLeftByTick[i - 1] || d === r.daysLeftByTick[i - 1]);
    L.push(`  strictly non-increasing.......... ${strictlyDown ? 'YES' : 'NO'}`);
    L.push('');
    L.push(`排新戲 proposal emerged............. ${r.proposal.emerged ? `YES (tick ${r.proposal.tick}, by ${r.proposal.proposer})` : 'NO'}`);
    L.push(`  script fragments (fix #1)........ ${p?.fragments.length ?? 0}`);
    L.push(`  cast joined (distinct)........... ${p?.cast.size ?? 0}`);
    L.push(`  cast member ids.................. ${p ? [...p.cast].join(',') : '(none)'}`);
    L.push(`  total rehearsalEffort............ ${p ? Object.values(p.rehearsalEffort).reduce((s, v) => s + v, 0) : 0}  detail=${p ? JSON.stringify(p.rehearsalEffort) : '{}'}`);
    L.push('');
    L.push(`章回 produced EVERY tick........... ${chaptersEveryTick ? 'YES' : 'NO'} (${r.chapterByTick.filter((c) => c !== null).length}/${r.chapterByTick.length})`);
    L.push(`  public-weave ticks............... ${r.publicWeaveTicks.join(',')}`);
    L.push(`  day-end episodes produced........ ${r.episodesProduced}`);
    L.push(`  finale performance 章回.......... ${r.finaleChapter ? 'YES' : 'NO'} (${r.finaleChapter ? r.finaleChapter.length : 0} chars)`);
    L.push('');
    L.push(`ending predicate ran............... complete=${pred.complete}`);
    L.push(`  components: hasPlay=${pred.components.hasPlay} hasFragment=${pred.components.hasFragment} cast≥2=${pred.components.castAtLeastTwo} rehearsal≥${r.cfg.rehearsalThreshold}=${pred.components.rehearsalMet} performed=${pred.components.performed}`);
    L.push('');
    L.push(`box-office (deterministic)......... total=${bo.total}  quality=${bo.quality.toFixed(3)} (raw ${bo.qualityRaw.toFixed(2)})  repute=${bo.repute}  tickets=${bo.tickets}  repeats=${bo.repeats}`);
    L.push(`  same-seed reproducible........... ${JSON.stringify(r.boxOffice) === JSON.stringify(r.boxOfficeRepeat) ? 'YES' : 'NO'}`);
    for (const a of bo.perAudience) {
        L.push(`    ${a.name.padEnd(12)} warmth=${a.warmth.toFixed(2)} willingness=${a.willingness.toFixed(3)} bought=${a.bought} repeat=${a.repeat} → ${a.contribution}`);
    }
    L.push('');
    L.push(`night private scenes (床戲)......... ${r.privateNightScenes}  kinds=${r.nightSceneKinds.join(',') || '(none)'}`);
    L.push(`living-want rewrites: mutated...... ${r.wantsMutated}  cross-character leak=${r.crossCharacterLeak}`);
    L.push(`ledger events (mut/close/spawn).... ${r.ledgerEvents.filter((e) => e.kind === 'mutate').length}/${r.ledgerEvents.filter((e) => e.kind === 'close').length}/${r.ledgerEvents.filter((e) => e.kind === 'spawn').length}`);
    const srt = r.snapshotRoundTrip;
    L.push(`WorldState snapshot/restore........ ${srt ? `${srt.ok ? 'OK' : 'FAIL'} (wants ${srt.wantsBefore}→${srt.wantsAfter}, clock ${srt.clockBefore}→${srt.clockAfter})` : 'not run'}`);
    L.push('==============================================================================');
    L.push('');
    console.log(L.join('\n'));
}

async function main(): Promise<void> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-season-'));
    const agent = await makeAgent();
    const recall = new LocalRecall(path.join(dir, 'memory'));
    const archive = new FileArchive(path.join(dir, 'archive'));
    const clock = new LocalClock();

    const r = await runSeason(
        { agent, recall, archive, clock },
        {
            totalTicks: TOTAL_TICKS,
            snapshotDir: path.join(dir, 'state'),
            midRestartAfterTick: 4,
            audienceProse: REAL, // PROSE only in the real run; skipped in the smoke
            log: (l) => console.log(l),
        },
    );

    printCounterBlock(r);

    // ── MECHANICAL ASSERTIONS ────────────────────────────────────────────────
    assert.ok(r.prologueAtT0, 'prologue injected verbatim at t0');
    assert.ok(r.deadlineEveryTick, 'deadline fact present in every tick worldFact');
    for (let i = 1; i < r.daysLeftByTick.length; i++) assert.ok(r.daysLeftByTick[i] <= r.daysLeftByTick[i - 1], 'deadline decrements');

    assert.ok(r.proposal.emerged, '排新戲 proposal emerged');
    assert.ok(r.play, 'a 新戲 object formed');
    assert.ok(r.play!.fragments.length >= 1, `≥1 script fragment (fix #1); got ${r.play!.fragments.length}`);
    assert.ok(r.play!.cast.size >= 2, `≥2 cast; got ${r.play!.cast.size}`);
    assert.ok(Object.values(r.play!.rehearsalEffort).reduce((s, v) => s + v, 0) > 0, 'rehearsalEffort > 0');

    assert.ok(r.chapterByTick.every((c) => c !== null), 'a 章回 was produced EVERY tick');
    assert.ok(r.episodesProduced >= 1, 'day-end episode produced');
    assert.ok(r.finaleChapter, 'finale performance 章回 produced');

    assert.ok(r.predicate, 'ending predicate ran');
    assert.equal(typeof r.predicate!.complete, 'boolean', 'ending predicate returns a bool');
    assert.ok(r.predicate!.complete, 'season predicate satisfied (fragment ∧ ≥2 cast ∧ effort ∧ performed)');

    assert.ok(r.boxOffice && r.boxOfficeRepeat, 'box-office computed');
    assert.deepEqual(r.boxOffice, r.boxOfficeRepeat, 'box-office is deterministic (same inputs → same number)');
    assert.ok(r.boxOffice!.perAudience.length >= 4, 'per-audience breakdown present (白韻秋 + 散客)');
    assert.ok(r.boxOffice!.total > 0, 'box-office total > 0');

    assert.ok(r.privateNightScenes >= 1, `≥1 night private scene (床戲); got ${r.privateNightScenes}`);
    assert.ok(r.wantsMutated >= 1, 'living-want self-rewrite mutated ≥1 want');
    assert.equal(r.crossCharacterLeak, 0, 'no cross-character rewrite leakage');

    assert.ok(r.snapshotRoundTrip && r.snapshotRoundTrip.ok, 'WorldState snapshot/restore round-trips mid-season');

    console.log('\n✅ FAKE-LLM SMOKE GREEN — all mechanical counters pass.\n');
    fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
