/**
 * Season Two — end-to-end integrated harness (professional production spine +
 * emergent character layer). Runs the full pipeline ~10 ticks and asserts
 * MECHANICALLY, printing a counter block (RULES.md: machine counters, no eyeballing).
 *
 * FAKE-LLM smoke (default, zero keys — this round's deliverable):
 *   ./node_modules/.bin/tsx experiments/season-one/season-two.ts
 *
 * REAL-LLM run (later; STOP here for this round). Keys via env, never hardcoded.
 * The troupe path uses GLM-4.6 (its default GLM-5.1-FW returns empty content on
 * our Poe key); the season/engine path (@endless-story/llm) is unaffected:
 *   POE_API_KEY=… OPENAI_API_KEY=… AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-4.6 \
 *   SEASON_REAL_LLM=1 ./node_modules/.bin/tsx experiments/season-one/season-two.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';

import { FakeSceneAgent, LocalRecall, FileArchive, LocalClock, type SceneAgentPort } from '../../src/index.ts';
import { makeAsk, type Ask } from '@endless-story/troupe';
import { runSeasonV2, type SeasonResultV2 } from './harness-v2.ts';

const REAL = process.env.SEASON_REAL_LLM === '1';
const TOTAL_TICKS = 10;
const ALL_STAGES = ['PROPOSED', 'SCRIPTED', 'CAST', 'SCORED', 'VERSIFIED', 'REHEARSING'];

async function makeAgent(): Promise<SceneAgentPort> {
    if (!REAL) return new FakeSceneAgent();
    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    return new RunnerSceneAgent();
}

function printCounterBlock(r: SeasonResultV2): void {
    const bo = r.boxOffice!;
    const pred = r.predicate!;
    const chaptersEveryTick = r.chapterByTick.every((c) => c !== null);
    const stageSet = new Set(r.stagesSeen);
    const emergentOffStage = r.ciMeta.filter((c) => c.source === 'emergent' && c.offStage);
    const emergent = r.ciMeta.filter((c) => c.source === 'emergent');
    const commissioned = r.ciMeta.filter((c) => c.source === 'commissioned');
    const L: string[] = [];
    L.push('');
    L.push('==================== SEASON TWO — MECHANICAL COUNTER BLOCK ====================');
    L.push(`mode................................ ${REAL ? 'REAL-LLM' : 'FAKE-LLM smoke'}`);
    L.push(`cast (7)........................... ${r.castNames.join('、')}`);
    L.push(`central question................... ${r.cfg.centralQuestion}`);
    L.push(`prologue injected at t0............ ${r.prologueAtT0 ? 'YES' : 'NO'}`);
    L.push(`deadline fact present every tick... ${r.deadlineEveryTick ? 'YES' : 'NO'}`);
    L.push(`deadline daysLeft by tick.......... ${r.daysLeftByTick.join(' → ')}`);
    const strictlyDown = r.daysLeftByTick.every((d, i) => i === 0 || d <= r.daysLeftByTick[i - 1]);
    L.push(`  strictly non-increasing.......... ${strictlyDown ? 'YES' : 'NO'}`);
    L.push('');
    L.push('── PRODUCTION SPINE (professional backbone) ──────────────────────────────────');
    L.push(`reached PREMIERED under deadline... ${r.reachedPremiere ? 'YES' : 'NO'}`);
    L.push(`all stages advanced................ ${ALL_STAGES.every((s) => stageSet.has(s)) ? 'YES' : 'NO'} (seen: ${[...stageSet].join(' → ')})`);
    L.push('stage-per-tick timeline:');
    for (const t of r.productionTimeline) L.push(`  tick ${t.tick} · 距會串 ${t.days} 天 · ${t.from} → ${t.to} · ${t.who}`);
    L.push(`REHEARSING produced takes.......... ${r.takesCount > 0 ? `YES (${r.takesCount})` : 'NO'}`);
    L.push(`staged 戲中戲 章回 non-empty........ ${r.stagedChapterChars > 0 ? `YES (${r.stagedChapterChars} chars)` : 'NO'}`);
    L.push(`rehearsalEffort (per performer).... ${JSON.stringify(r.rehearsalEffort)}`);
    L.push('');
    L.push('── SEAM 1: want-contested casting ────────────────────────────────────────────');
    L.push(`contested parts (>1 bidder)........ ${r.contestedParts.length} → ${r.contestedParts.join(',') || '(none)'}`);
    for (const [partId, bids] of Object.entries(r.castingBids)) {
        const contenders = bids.filter((b) => b.wantStrength > 0.15);
        const win = bids[0];
        L.push(`  〔${bids[0]?.partName ?? partId}〕 ${contenders.length > 1 ? '爭角' : '就位'}: ${bids.map((b) => `${b.name}(欲${b.wantStrength.toFixed(2)}×藝${b.skillFit.toFixed(2)}×緣${b.bondBoost.toFixed(2)}=${b.weight.toFixed(3)}${b.lobbiedBy ? `,${b.lobbiedBy}拉票` : ''})`).join(' | ')}`);
        L.push(`      → 勝：${win?.name}（${contenders.length > 1 ? '欲望×行當×緣分，非單憑最強羈絆' : '唯一/最合適'}）`);
    }
    L.push('');
    L.push('── SEAM 2: full relational field → 有感而發 詞 ────────────────────────────────');
    L.push(`詞 total: ${commissioned.length} commissioned / ${emergent.length} emergent`);
    for (const c of r.ciMeta) L.push(`  [${c.source === 'emergent' ? (c.offStage ? '有感·台下' : '有感·台上') : '應場'}] ${c.title} — 作者 ${c.authorName}${c.refName ? ` · 念 ${c.refName}` : ''}${c.offStage ? '  ← OFF-STAGE 恩怨（seam-2 證據）' : ''}`);
    L.push(`emergent 詞 carrying an OFF-STAGE grudge... ${emergentOffStage.length >= 1 ? `YES (${emergentOffStage.map((c) => `${c.authorName}→${c.refName}`).join('、')})` : 'NO'}`);
    L.push('');
    L.push('── DISCUSSION LAYER: judgments ARGUED, not formula\'d ─────────────────────────');
    const cd = r.castingDiscussion;
    L.push(`casting DISCUSSION ran for contested 許仙.. ${cd ? 'YES' : 'NO'}`);
    if (cd) {
        L.push(`  aspirants advocated (≥2)......... ${cd.aspirants.length} → ${cd.aspirants.join('、')}`);
        for (const t of cd.turns) L.push(`    〔${t.phase}〕${t.speaker}：${t.said.slice(0, 44)}`);
        L.push(`  班主 沈雪笙 拍板................. 「${cd.arbitrationLine.slice(0, 56)}」`);
        L.push(`  resulting cast.................. ${cd.decision}`);
        L.push(`  round cap held.................. ${cd.rounds <= cd.cap ? 'YES' : 'NO'} (rounds ${cd.rounds} ≤ cap ${cd.cap})   decided=${cd.decided ? 'YES' : 'NO'}`);
        if (cd.refusal) L.push(`  losing aspirant refused ONCE.... ${cd.refusal.by}：「${cd.refusal.line.slice(0, 40)}」（戲，非腳本）`);
    }
    const rs = r.reshapeApplied;
    L.push(`連翹 slot-less want RESHAPED the show.. ${rs ? `YES → ${rs.forName}·${rs.beatTitle}（${rs.kind}）` : 'NO'}`);
    if (rs) L.push(`  reshape desc................... ${rs.desc.slice(0, 48)}`);
    const other = r.discussions.filter((d) => d.stage !== '選角');
    L.push(`discussion at OTHER stages......... ${other.length} → ${other.map((d) => d.stage).join('、') || '(none)'}`);
    for (const d of other) L.push(`  〔${d.stage}〕→ ${d.decision.slice(0, 52)}${d.revision ? '  ← REVISED' : ''}`);
    const capOk = r.discussions.every((d) => d.rounds <= d.cap && d.decided);
    L.push(`every discussion: rounds≤cap & decided.. ${capOk ? 'YES' : 'NO'} (${r.discussions.length} discussions total)`);
    L.push(`立意 debated & injected into brief.. ${r.liyiDecided ? `YES → ${r.liyiDecided.slice(0, 28)}` : 'NO'}`);
    L.push('');
    L.push('── THICK MEMORY → 詞 PROVENANCE (v2 weakness fixed) ──────────────────────────');
    L.push(`詞 grounded in a RECALLED thick memory.. ${r.thickMemoryCi.length >= 1 ? `YES (${r.thickMemoryCi.length})` : 'NO'}`);
    for (const t of r.thickMemoryCi) L.push(`  ${t.author}${t.ref ? `→${t.ref}` : ''}：憶「${t.memory.slice(0, 34)}…」`);
    L.push('');
    L.push('── CHAPTER STREAM + CHARACTER LAYER ──────────────────────────────────────────');
    L.push(`章回 produced EVERY tick........... ${chaptersEveryTick ? 'YES' : 'NO'} (${r.chapterByTick.filter((c) => c !== null).length}/${r.chapterByTick.length})`);
    L.push(`  public-weave ticks............... ${r.publicWeaveTicks.join(',')}`);
    L.push(`  production chapter ticks......... ${r.productionChapterTicks.join(',')} (rehearsal + finale premiere)`);
    L.push(`  day-end episodes produced........ ${r.episodesProduced}`);
    L.push(`  finale performance 章回.......... ${r.finaleChapter ? 'YES' : 'NO'} (${r.finaleChapter ? r.finaleChapter.length : 0} chars)`);
    L.push(`night private scenes (床戲)......... ${r.privateNightScenes}  kinds=${r.nightSceneKinds.join(',') || '(none)'}`);
    L.push(`living-want rewrites: mutated...... ${r.wantsMutated}  cross-character leak=${r.crossCharacterLeak}`);
    L.push(`ledger events (mut/close/spawn).... ${r.ledgerEvents.filter((e) => e.kind === 'mutate').length}/${r.ledgerEvents.filter((e) => e.kind === 'close').length}/${r.ledgerEvents.filter((e) => e.kind === 'spawn').length}`);
    L.push('');
    L.push('── ENDING PREDICATE (production razor) ───────────────────────────────────────');
    L.push(`ending predicate ran............... complete=${pred.complete}`);
    L.push(`  components: brief=${pred.components.hasBrief} script=${pred.components.hasScript} cast≥2=${pred.components.castAtLeastTwo} scored=${pred.components.scored} versified=${pred.components.versified} rehearsed=${pred.components.rehearsed} premiered=${pred.components.premiered}`);
    L.push('');
    L.push('── BOX-OFFICE (deterministic) ────────────────────────────────────────────────');
    L.push(`box-office......................... total=${bo.total}  quality=${bo.quality.toFixed(3)} (raw ${bo.qualityRaw.toFixed(2)} ÷ scale ${r.qualityScale})  repute=${bo.repute}  tickets=${bo.tickets}  repeats=${bo.repeats}`);
    L.push(`  quality NOT clamped to 1.0....... ${bo.quality < 1 ? 'YES' : 'NO'} (${bo.quality.toFixed(3)})`);
    const ur = r.boxOfficeUnderRehearsed!;
    L.push(`  under-rehearsed (½ effort)....... total=${ur.total}  quality=${ur.quality.toFixed(3)}  → discriminates=${ur.total < bo.total || ur.quality < bo.quality ? 'YES' : 'NO'}`);
    L.push(`  same-seed reproducible........... ${JSON.stringify(r.boxOffice) === JSON.stringify(r.boxOfficeRepeat) ? 'YES' : 'NO'}`);
    for (const a of bo.perAudience) L.push(`    ${a.name.padEnd(12)} warmth=${a.warmth.toFixed(2)} willingness=${a.willingness.toFixed(3)} bought=${a.bought} repeat=${a.repeat} → ${a.contribution}`);
    L.push('');
    L.push('── THICK MEMORIES + RESTORE ──────────────────────────────────────────────────');
    const minMem = Math.min(...Object.values(r.memoriesPerCast));
    L.push(`memories per cast (authored)....... ${Object.entries(r.memoriesPerCast).map(([n, c]) => `${n}:${c}`).join('  ')}`);
    L.push(`  every cast ≥14 memories.......... ${minMem >= 14 ? 'YES' : 'NO'} (min ${minMem})`);
    L.push(`  a recalled memory was used....... ${r.recallUsed ? 'YES' : 'NO'}`);
    const srt = r.snapshotRoundTrip;
    L.push(`WorldState snapshot/restore........ ${srt ? `${srt.ok ? 'OK' : 'FAIL'} (wants ${srt.wantsBefore}→${srt.wantsAfter}, clock ${srt.clockBefore}→${srt.clockAfter})` : 'not run'}`);
    L.push('==============================================================================');
    L.push('');
    console.log(L.join('\n'));
}

async function main(): Promise<void> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-season2-'));
    const agent = await makeAgent();
    // The troupe production LLM. Mock in the smoke; GLM-4.6 (POE_MODEL_PRIMARY) in real.
    const troupeAsk: Ask = makeAsk({ mock: !REAL });
    const recall = new LocalRecall(path.join(dir, 'memory'));
    const archive = new FileArchive(path.join(dir, 'archive'));
    const clock = new LocalClock();

    const r = await runSeasonV2(
        { agent, troupeAsk, recall, archive, clock },
        { totalTicks: TOTAL_TICKS, snapshotDir: path.join(dir, 'state'), midRestartAfterTick: 4, audienceProse: REAL, log: (l) => console.log(l) },
    );

    printCounterBlock(r);

    // ── MECHANICAL ASSERTIONS ────────────────────────────────────────────────
    assert.ok(r.prologueAtT0, 'prologue injected verbatim at t0');
    assert.ok(r.deadlineEveryTick, 'deadline fact present in every tick worldFact');
    for (let i = 1; i < r.daysLeftByTick.length; i++) assert.ok(r.daysLeftByTick[i] <= r.daysLeftByTick[i - 1], 'deadline decrements');

    // production spine
    assert.ok(r.reachedPremiere, 'production reached PREMIERED under the deadline');
    for (const s of ALL_STAGES) assert.ok(r.stagesSeen.includes(s), `production advanced through stage ${s}`);
    assert.ok(r.takesCount > 0, `REHEARSING produced takes (>0); got ${r.takesCount}`);
    assert.ok(r.stagedChapterChars > 0, 'staged 戲中戲 章回 rendered non-empty');
    assert.ok(Object.values(r.rehearsalEffort).reduce((s, v) => s + v, 0) > 0, 'rehearsalEffort accrued');

    // seam 1 — want-contested casting
    assert.ok(r.contestedParts.length >= 1, `≥1 part had >1 bidder; got ${r.contestedParts.length}`);
    const xu = r.castingBids['xu'];
    assert.ok(xu && xu[0], 'the 許仙 part was cast');

    // seam 2 — full relational field: an OFF-STAGE grudge surfaced in a 詞
    assert.ok(r.ciMeta.some((c) => c.source === 'emergent' && c.offStage), 'an emergent 詞 carries an OFF-STAGE grudge (seam-2 proof)');

    // discussion layer — casting argued out for the contested part
    assert.ok(r.castingDiscussion, 'casting DISCUSSION ran for the contested part (許仙)');
    assert.ok(r.castingDiscussion!.aspirants.length >= 2, `≥2 aspirants advocated; got ${r.castingDiscussion!.aspirants.length}`);
    assert.ok(r.castingDiscussion!.arbitrationLine.length > 0, '班主 arbitration line present');
    assert.ok(r.castingDiscussion!.decision.includes('許仙='), 'the casting discussion produced a resulting cast');
    // 連翹's slot-less want reshaped the production
    assert.ok(r.reshapeApplied, "連翹's slot-less want triggered a production RESHAPE (spotlight/亮相 beat)");
    // discussion at ≥1 other stage produced a revision/decision
    const otherStages = r.discussions.filter((d) => d.stage !== '選角');
    assert.ok(otherStages.length >= 1, 'discussion ran at ≥1 other judgment stage');
    assert.ok(otherStages.some((d) => d.decided && (d.revision || d.decision)), 'another stage produced a revision/decision');
    // round cap held everywhere; every discussion reached a decision
    assert.ok(r.discussions.every((d) => d.rounds <= d.cap), 'round cap held (no stage exceeded its cap)');
    assert.ok(r.discussions.every((d) => d.decided), 'every discussion reached a decision (no deadlock)');
    // thick memory → 詞 provenance
    assert.ok(r.thickMemoryCi.length >= 1, 'a thick memory surfaced in a 詞 provenance');

    // chapter stream + character layer
    assert.ok(r.chapterByTick.every((c) => c !== null), 'a 章回 was produced EVERY tick');
    assert.ok(r.productionChapterTicks.length >= 1, 'production chapters joined the stream (rehearsal/premiere)');
    assert.ok(r.episodesProduced >= 1, 'day-end episode produced');
    assert.ok(r.finaleChapter, 'finale performance 章回 produced');
    assert.ok(r.privateNightScenes >= 1, `≥1 night private scene (床戲); got ${r.privateNightScenes}`);
    assert.ok(r.wantsMutated >= 1, 'living-want self-rewrite mutated ≥1 want');
    assert.equal(r.crossCharacterLeak, 0, 'no cross-character rewrite leakage');

    // ending predicate
    assert.ok(r.predicate && r.predicate.complete, 'season predicate satisfied (premiered production)');

    // box-office
    assert.ok(r.boxOffice && r.boxOfficeRepeat, 'box-office computed');
    assert.deepEqual(r.boxOffice, r.boxOfficeRepeat, 'box-office is deterministic (same inputs → same number)');
    assert.ok(r.boxOffice!.perAudience.length >= 4, 'per-audience breakdown present (白韻秋 + 散客)');
    assert.ok(r.boxOffice!.total > 0, 'box-office total > 0');
    assert.ok(r.boxOffice!.quality < 1, `box-office quality NOT clamped to 1.0 (widened scale); got ${r.boxOffice!.quality}`);
    assert.ok(r.boxOfficeUnderRehearsed, 'under-rehearsed box-office computed');
    assert.ok(
        r.boxOfficeUnderRehearsed!.total < r.boxOffice!.total || r.boxOfficeUnderRehearsed!.quality < r.boxOffice!.quality,
        'an under-rehearsed show scores lower (box-office discriminates)',
    );

    // thick memories + restore
    assert.ok(Math.min(...Object.values(r.memoriesPerCast)) >= 14, 'every cast member has ≥14 authored memories (thick-memories merge)');
    assert.ok(r.snapshotRoundTrip && r.snapshotRoundTrip.ok, 'WorldState snapshot/restore round-trips mid-season');

    console.log('\n✅ SEASON TWO FAKE-LLM SMOKE GREEN — all mechanical counters pass.\n');
    fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
