/**
 * Season · SELF-MODEL — the MUTABLE identity/relationship channel, proven on the
 * full season loop. This is the eviction fix diagnosed in feat/ultimatum-probe:
 * core identity/relationship memories fall 5/5 → 0/5 in the recall top-K by day 5
 * as recent trivia crowd them out. The fix is NOT to recency-exempt memories
 * (append-only would then pile up stale + new versions of a changed relationship);
 * it is to move "who X is to me" OUT of recall INTO an always-available mutable
 * self-model that is OVERWRITTEN each night (latest-wins) and never recalled.
 *
 * Two headline checks, plus the v4 guarantees riding underneath:
 *   1. ALWAYS-AVAILABLE — after ~15 episodic trivia beats accumulate, the probe's
 *      view of 金鳳/蘇 is STILL injected at decision time (it comes from the
 *      self-model, not the recall lottery). Contrast: the probe's recall is a
 *      wall of trivia; the self-model channel is 100% available regardless.
 *   2. LATEST-WINS — 柳 settles the 金鳳 debt in a scene; that night the
 *      consolidation OVERWRITES 金鳳's view (舊情人 → 兩清). The injected block then
 *      shows the NEW view and the OLD is GONE (superseded), NOT both.
 *
 * FAKE-LLM smoke (default, zero keys — this round's deliverable):
 *   ./node_modules/.bin/tsx experiments/season-one/season-selfmodel.ts
 *
 * REAL-LLM run (later; STOP here for this round). Keys via env, never hardcoded:
 *   POE_API_KEY=… OPENAI_API_KEY=… AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-4.6 \
 *   SEASON_REAL_LLM=1 SEASON_OUT_DIR=<preserved dir> \
 *   ./node_modules/.bin/tsx experiments/season-one/season-selfmodel.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';

import { FakeSceneAgent, LocalRecall, FileArchive, LocalClock, type SceneAgentPort } from '../../src/index.ts';
import { makeAsk, type Ask } from '@endless-story/troupe';
import { runSeasonV3, type SeasonResultV3 } from './harness-v3.ts';

const REAL = process.env.SEASON_REAL_LLM === '1';
const TOTAL_TICKS = 12;
const PROBE = '柳安春';
/** Settle 柳's 金鳳 debt on day-1 (before that day's night consolidation at tick 5). */
const SETTLE = { fromName: '柳安春', toName: '金鳳', tick: 3 };

async function makeAgent(): Promise<SceneAgentPort> {
    if (!REAL) return new FakeSceneAgent();
    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    return new RunnerSceneAgent();
}

function printCounterBlock(r: SeasonResultV3): void {
    const sm = r.selfModel;
    const bo = r.boxOffice!;
    const before = sm.probeInjections.find((d) => d.day === 1);
    const after = sm.probeInjections.filter((d) => d.day >= 2).at(-1) ?? sm.probeInjections.at(-1);

    const L: string[] = [];
    L.push('');
    L.push('================= SEASON · SELF-MODEL — MECHANICAL COUNTER BLOCK =================');
    L.push(`mode............................... ${REAL ? 'REAL-LLM' : 'FAKE-LLM smoke'}`);
    L.push(`cast (7)........................... ${r.castNames.join('、')}`);
    L.push(`ticks / probe...................... ${TOTAL_TICKS} (6/day) · probe=${sm.probe}`);
    L.push('');
    L.push('── ALWAYS-AVAILABLE (eviction fixed the RIGHT way: self-model, not recall) ────');
    L.push(`probe episodic memories (trivia)... ${sm.probeEpisodicCount}  (the recency-decayed pile that evicts core in recall)`);
    L.push(`probe decisions with self-model.... ${sm.probeInjections.length}`);
    L.push(`view of 金鳳/蘇 injected at EVERY decision.. ${sm.alwaysAvailable.join('、') || '（none）'}  → always-available=${sm.alwaysAvailable.length >= 2 ? 'YES' : 'NO'}`);
    if (before) {
        L.push('  probe self-model block @ day-1 decision (verbatim):');
        for (const line of before.block.split('\n')) L.push(`    ${line}`);
    }
    L.push('');
    L.push('── LATEST-WINS ON CHANGE (proves append-only concern is HANDLED, not exempted) ─');
    if (sm.latestWins) {
        const lw = sm.latestWins;
        L.push(`scripted change.................... ${lw.from} 對 ${lw.to} 的看法（settle tick ${SETTLE.tick} → 夜間覆寫）`);
        L.push(`  BEFORE (superseded).............. 「${lw.before}」`);
        L.push(`  AFTER  (current)................. 「${lw.after}」`);
        L.push(`  injected block shows ONLY the new view (old GONE).. ${lw.oldSuperseded ? 'YES' : 'NO'}`);
    } else {
        L.push('scripted change.................... NOT captured');
    }
    if (after) {
        L.push('  probe self-model block @ day-2 decision (verbatim, post-overwrite):');
        for (const line of after.block.split('\n')) L.push(`    ${line}`);
    }
    L.push('');
    L.push('── NIGHTLY CONSOLIDATION (OVERWRITE, latest-wins; the唯一 digestion window) ────');
    L.push(`relationship-view OVERWRITES....... ${sm.consolidations}`);
    L.push(`durable identity insights merged... ${sm.identityInsightsAdded} (§2.52)`);
    L.push('consolidated view lines (sample):');
    for (const v of sm.sampleViews) L.push(`  ${v.from} → ${v.to}：「${v.view}」`);
    L.push('');
    L.push('── EPISODIC MEMORY UNCHANGED (recall scoring NOT touched) ─────────────────────');
    L.push(`recall used in the run............. ${r.recallUsed ? 'YES' : 'NO'}  (see recall unit test: halfLife=2 decay intact)`);
    L.push('');
    L.push('── V4 GUARANTEES STILL HOLD (self-model wired in, nothing regressed) ──────────');
    L.push(`班主 milestones.................... ${r.milestones.length} (${r.milestones.map((m) => m.kind).join('/')})`);
    L.push(`casting convened at tick........... ${r.castingConvenedTick ?? 'NO'}`);
    L.push(`reached PREMIERED.................. ${r.reachedPremiere ? 'YES' : 'NO'}`);
    L.push(`章回 EVERY tick.................... ${r.chapterByTick.every((c) => c !== null) ? 'YES' : 'NO'} (${r.chapterByTick.filter((c) => c !== null).length}/${r.chapterByTick.length})`);
    L.push(`staged 戲中戲 non-empty............ ${r.stagedChapterChars > 0 ? `YES (${r.stagedChapterChars})` : 'NO'}`);
    L.push(`living-want mutated / leak......... ${r.wantsMutated} / ${r.crossCharacterLeak}`);
    L.push(`box-office deterministic........... ${JSON.stringify(r.boxOffice) === JSON.stringify(r.boxOfficeRepeat) ? 'YES' : 'NO'} (total=${bo.total})`);
    L.push(`snapshot/restore (incl self-model). ${r.snapshotRoundTrip ? (r.snapshotRoundTrip.ok ? 'OK' : 'FAIL') : 'not run'}`);
    L.push('==============================================================================');
    L.push('');
    console.log(L.join('\n'));
}

async function main(): Promise<void> {
    const dir = REAL
        ? (process.env.SEASON_OUT_DIR ?? path.join(os.tmpdir(), 'es-selfmodel-real'))
        : fs.mkdtempSync(path.join(os.tmpdir(), 'es-selfmodel-fake-'));
    if (REAL) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[season-selfmodel] mode=${REAL ? 'REAL-LLM' : 'FAKE-LLM'}  output dir: ${dir}`);

    const agent = await makeAgent();
    const troupeAsk: Ask = makeAsk({ mock: !REAL });
    const recall = new LocalRecall(path.join(dir, 'memory'));
    const archive = new FileArchive(path.join(dir, 'archive'));
    const clock = new LocalClock();

    const r = await runSeasonV3(
        { agent, troupeAsk, recall, archive, clock },
        {
            totalTicks: TOTAL_TICKS,
            snapshotDir: path.join(dir, 'state'),
            midRestartAfterTick: 4,
            audienceProse: REAL,
            selfModelProbe: PROBE,
            scriptSettle: SETTLE,
            log: (l) => console.log(l),
        },
    );

    printCounterBlock(r);

    const sm = r.selfModel;
    // ── SELF-MODEL ASSERTIONS ────────────────────────────────────────────────
    assert.ok(sm.probeEpisodicCount >= 15, `probe accumulated ≥15 episodic trivia; got ${sm.probeEpisodicCount}`);
    assert.ok(sm.probeInjections.length > 0, 'the probe made decisions with a self-model block injected');
    // ALWAYS-AVAILABLE: 金鳳 AND 蘇 present in the injected block at EVERY decision.
    assert.deepEqual(
        sm.alwaysAvailable.sort(),
        ['蘇映雪', '金鳳'].sort(),
        'view of 金鳳 AND 蘇 injected at every decision (from the self-model, never evicted by trivia)',
    );
    // LATEST-WINS: the change was consolidated by OVERWRITE, old view superseded.
    assert.ok(sm.latestWins, 'the scripted relationship change was captured');
    assert.notEqual(sm.latestWins!.before, sm.latestWins!.after, 'the view actually changed (舊情人 → 兩清)');
    assert.ok(sm.latestWins!.oldSuperseded, 'the injected block shows ONLY the new view — old GONE, not both (append-only concern handled)');
    assert.ok(sm.consolidations >= 1, 'nightly consolidation OVERWROTE ≥1 relationship view');

    // ── V4 GUARANTEES (self-model must not regress the season) ────────────────
    assert.ok(r.milestones.length >= 2, '班主 milestones still fire');
    assert.ok(r.castingConvenedTick !== null, 'casting still convened');
    assert.ok(r.reachedPremiere, 'still reaches PREMIERED');
    assert.ok(r.chapterByTick.every((c) => c !== null), '章回 every tick');
    assert.ok(r.stagedChapterChars > 0, 'staged 戲中戲 non-empty');
    assert.ok(r.wantsMutated >= 1, 'living-want self-rewrite still mutates');
    assert.equal(r.crossCharacterLeak, 0, 'no cross-character rewrite leak');
    assert.deepEqual(r.boxOffice, r.boxOfficeRepeat, 'box-office deterministic');
    assert.ok(r.snapshotRoundTrip && r.snapshotRoundTrip.ok, 'snapshot/restore round-trips (now incl the self-model)');

    console.log(`\n✅ SEASON · SELF-MODEL ${REAL ? 'REAL-LLM RUN' : 'FAKE-LLM SMOKE'} GREEN — always-available + latest-wins proven; v4 intact.\n`);
    if (REAL) console.log(`[season-selfmodel] REAL archive PRESERVED → ${path.join(dir, 'archive')}`);
    else fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
