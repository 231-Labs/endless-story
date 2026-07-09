/**
 * Season Four — the 班主-agent milestone mechanism wired INTO the full season, so
 * production is AGENT-DRIVEN and VISIBLE, with rhythm + space as the natural teeth.
 * Runs the full pipeline ~12 ticks (a couple days so day/night rhythm + rehearsal
 * slots exercise) and asserts MECHANICALLY, printing a counter block (RULES.md:
 * machine counters, no eyeballing).
 *
 * FAKE-LLM smoke (default, zero keys — this round's deliverable):
 *   ./node_modules/.bin/tsx experiments/season-one/season-four.ts
 *
 * REAL-LLM run (later; STOP here for this round). Keys via env, never hardcoded.
 * The troupe/班主 path uses GLM-4.6 (POE_MODEL_PRIMARY); the season/engine path
 * (@endless-story/llm) uses AI_PROVIDER=poe:
 *   POE_API_KEY=… OPENAI_API_KEY=… AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-4.6 \
 *   SEASON_REAL_LLM=1 ./node_modules/.bin/tsx experiments/season-one/season-four.ts
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
const ALL_STAGES = ['PROPOSED', 'SCRIPTED', 'CAST', 'SCORED', 'VERSIFIED', 'REHEARSING'];
/** the traceable NARRATED production chain the season must make visible. */
const CHAIN_ORDER = ['announce-定角', 'casting-convened', 'announce-排練', 'rehearse', 'premiere'] as const;
/** ≥N floor members must make the rehearsal venue on ≥1 rehearsal day slot. */
const REHEARSAL_MIN_ATTEND = 3;

async function makeAgent(): Promise<SceneAgentPort> {
    if (!REAL) return new FakeSceneAgent();
    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    return new RunnerSceneAgent();
}

function printCounterBlock(r: SeasonResultV3): void {
    const bo = r.boxOffice!;
    const pred = r.predicate!;
    const chaptersEveryTick = r.chapterByTick.every((c) => c !== null);
    const stageSet = new Set(r.stagesSeen);
    const emergentOffStage = r.ciMeta.filter((c) => c.source === 'emergent' && c.offStage);
    const chainByPhase = new Map(r.productionChain.map((e) => [e.phase, e]));
    const chainOrdered = CHAIN_ORDER.every((p) => chainByPhase.has(p)) &&
        CHAIN_ORDER.map((p) => chainByPhase.get(p)!.tick).every((t, i, a) => i === 0 || t >= a[i - 1]);
    const chainAllNarrated = CHAIN_ORDER.every((p) => chainByPhase.get(p)?.narrated);
    const maxAttend = Math.max(0, ...r.rehearsalAttendance.map((a) => a.atVenue.length));
    const nhs = r.nightHomeSample;
    const bf = r.bedroomFinding!;
    const cd = r.castingDiscussion;

    const L: string[] = [];
    L.push('');
    L.push('==================== SEASON FOUR — MECHANICAL COUNTER BLOCK ====================');
    L.push(`mode................................ ${REAL ? 'REAL-LLM' : 'FAKE-LLM smoke'}`);
    L.push(`cast (7)........................... ${r.castNames.join('、')}`);
    L.push(`ticks.............................. ${TOTAL_TICKS} (6/day → day/night rhythm + rehearsal slots)`);
    L.push(`prologue injected at t0............ ${r.prologueAtT0 ? 'YES' : 'NO'}`);
    L.push(`deadline daysLeft by tick.......... ${r.daysLeftByTick.join(' → ')}`);
    L.push('');
    L.push('── 班主-AGENT MILESTONES (production made VISIBLE, not a silent flag) ─────────');
    L.push(`班主 in-world milestone announcements (narrated).. ${r.milestones.length} (${r.milestones.map((m) => m.kind).join('/')})`);
    for (const m of r.milestones) L.push(`  〔班主·${m.kind}〕(tick ${m.tick}, 距會串 ${m.daysLeftAtAnnounce} 天${m.live ? '' : ' · fallback'})「${m.announcement.slice(0, 52)}」`);
    L.push('');
    L.push('── CASTING CONVENED BY 班主 (surfaced as narrated beats, not silent) ──────────');
    L.push(`casting convened at tick........... ${r.castingConvenedTick ?? 'NO'}`);
    if (cd) {
        L.push(`  eligible advocates (≥2).......... ${cd.aspirants.length} → ${cd.aspirants.join('、')}`);
        L.push(`  cast filled (no deadlock)........ ${cd.decided ? 'YES' : 'NO'} → ${cd.decision}`);
        L.push(`  班主 拍板........................ 「${cd.arbitrationLine.slice(0, 48)}」`);
        if (cd.refusal) L.push(`  losing aspirant refused ONCE..... ${cd.refusal.by}：「${cd.refusal.line.slice(0, 34)}」`);
    }
    L.push('');
    L.push('── TRACEABLE NARRATED PRODUCTION CHAIN (announce→casting→rehearse→premiere) ───');
    for (const e of r.productionChain) L.push(`  tick ${String(e.tick).padStart(2)} · ${e.phase.padEnd(18)} · narrated=${e.narrated ? 'YES' : 'NO'} · ${e.detail.slice(0, 40)}`);
    L.push(`  chain ordered & complete......... ${chainOrdered ? 'YES' : 'NO'}   all narrated=${chainAllNarrated ? 'YES' : 'NO'}`);
    L.push('');
    L.push('── RHYTHM + SPACE = TEETH (rehearsal-slot routing; night = home) ──────────────');
    L.push('rehearsal-day attendance (floor at 戲台 / pulled off):');
    for (const a of r.rehearsalAttendance) L.push(`  tick ${a.tick} · ${a.venue} · 到(${a.atVenue.length})=${a.atVenue.join('、') || '—'}  缺=${a.absent.join('、') || '—'}`);
    L.push(`  ≥${REHEARSAL_MIN_ATTEND} floor members AT venue on ≥1 slot.. ${maxAttend >= REHEARSAL_MIN_ATTEND ? `YES (max ${maxAttend})` : `NO (max ${maxAttend})`}`);
    L.push(`  night = home (floor OFF the floor).. ${nhs ? `tick ${nhs.tick}: 私宅 ${nhs.floorAtPrivate}/${nhs.total}, 戲台 ${nhs.floorAtVenue}/${nhs.total}` : 'not sampled'}`);
    L.push('');
    L.push('── ABSENCE TEETH (pulled off by a hot want → absent → noticed in-world) ───────');
    L.push(`members pulled off rehearsal by a hot want.. ${r.absences.length}`);
    for (const a of r.absences) {
        L.push(`  tick ${a.tick} · ${a.who} → ${a.pulledTo}（人不在排練場）`);
        L.push(`    〔班主覺察〕${a.note.slice(0, 60)}`);
    }
    L.push(`  absence surfaced diegetically (班主 noticed).. ${r.absences.every((a) => a.note.length > 0) && r.absences.length > 0 ? 'YES' : 'NO'} (consequence = the absence itself, NO number penalty)`);
    L.push('');
    L.push('── 床戲 (night trysts) FINDING ───────────────────────────────────────────────');
    L.push(`night private scenes............... ${r.privateNightScenes}  kinds=${r.nightSceneKinds.join(',') || '(none)'}`);
    L.push(`床戲 (tryst) count................. ${bf.count}`);
    L.push(`  finding........................ ${bf.reason}`);
    L.push('');
    L.push('── V3 GUARANTEES STILL HOLD ──────────────────────────────────────────────────');
    L.push(`reached PREMIERED under deadline... ${r.reachedPremiere ? 'YES' : 'NO'}`);
    L.push(`all stages advanced................ ${ALL_STAGES.every((s) => stageSet.has(s)) ? 'YES' : 'NO'} (${[...stageSet].join('→')})`);
    L.push('stage-per-tick timeline:');
    for (const t of r.productionTimeline) L.push(`  tick ${t.tick} · 距會串 ${t.days} 天 · ${t.from} → ${t.to} · ${t.who}`);
    L.push(`REHEARSING produced takes.......... ${r.takesCount > 0 ? `YES (${r.takesCount})` : 'NO'}`);
    L.push(`staged 戲中戲 章回 non-empty........ ${r.stagedChapterChars > 0 ? `YES (${r.stagedChapterChars} chars)` : 'NO'}`);
    L.push(`contested parts (>1 bidder)........ ${r.contestedParts.length} → ${r.contestedParts.join(',') || '(none)'}`);
    L.push(`emergent 詞 with OFF-STAGE grudge.. ${emergentOffStage.length >= 1 ? `YES (${emergentOffStage.map((c) => `${c.authorName}→${c.refName}`).join('、')})` : 'NO'}`);
    L.push(`詞 grounded in RECALLED thick memory ${r.thickMemoryCi.length >= 1 ? `YES (${r.thickMemoryCi.length})` : 'NO'}`);
    L.push(`連翹 slot-less want RESHAPED show... ${r.reshapeApplied ? `YES → ${r.reshapeApplied.forName}·${r.reshapeApplied.beatTitle}` : 'NO'}`);
    L.push(`立意 debated & injected............ ${r.liyiDecided ? `YES → ${r.liyiDecided.slice(0, 24)}` : 'NO'}`);
    L.push(`every discussion rounds≤cap&decided ${r.discussions.every((d) => d.rounds <= d.cap && d.decided) ? 'YES' : 'NO'} (${r.discussions.length} total)`);
    L.push(`章回 produced EVERY tick........... ${chaptersEveryTick ? 'YES' : 'NO'} (${r.chapterByTick.filter((c) => c !== null).length}/${r.chapterByTick.length})`);
    L.push(`  day-end episodes................. ${r.episodesProduced}   finale 章回=${r.finaleChapter ? `YES (${r.finaleChapter.length} chars)` : 'NO'}`);
    L.push(`living-want mutated................ ${r.wantsMutated}  cross-character leak=${r.crossCharacterLeak}`);
    L.push(`box-office......................... total=${bo.total}  quality=${bo.quality.toFixed(3)} (raw ${bo.qualityRaw.toFixed(2)}÷${r.qualityScale})  NOT-clamped=${bo.quality < 1 ? 'YES' : 'NO'}`);
    L.push(`  under-rehearsed (½)............. total=${r.boxOfficeUnderRehearsed!.total} → discriminates=${r.boxOfficeUnderRehearsed!.total < bo.total || r.boxOfficeUnderRehearsed!.quality < bo.quality ? 'YES' : 'NO'}`);
    L.push(`  same-seed reproducible.......... ${JSON.stringify(r.boxOffice) === JSON.stringify(r.boxOfficeRepeat) ? 'YES' : 'NO'}`);
    const minMem = Math.min(...Object.values(r.memoriesPerCast));
    L.push(`every cast ≥14 memories............ ${minMem >= 14 ? 'YES' : 'NO'} (min ${minMem})`);
    L.push(`WorldState snapshot/restore........ ${r.snapshotRoundTrip ? `${r.snapshotRoundTrip.ok ? 'OK' : 'FAIL'} (wants ${r.snapshotRoundTrip.wantsBefore}→${r.snapshotRoundTrip.wantsAfter})` : 'not run'}`);
    L.push(`ending predicate................... complete=${pred.complete}`);
    L.push('==============================================================================');
    L.push('');
    console.log(L.join('\n'));
}

async function main(): Promise<void> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-season4-'));
    const agent = await makeAgent();
    const troupeAsk: Ask = makeAsk({ mock: !REAL });
    const recall = new LocalRecall(path.join(dir, 'memory'));
    const archive = new FileArchive(path.join(dir, 'archive'));
    const clock = new LocalClock();

    const r = await runSeasonV3(
        { agent, troupeAsk, recall, archive, clock },
        { totalTicks: TOTAL_TICKS, snapshotDir: path.join(dir, 'state'), midRestartAfterTick: 4, audienceProse: REAL, log: (l) => console.log(l) },
    );

    printCounterBlock(r);

    // ── MECHANICAL ASSERTIONS ────────────────────────────────────────────────
    // 班主-agent milestone layer (the integration under test)
    assert.ok(r.milestones.length >= 2, `班主 emitted ≥2 in-world milestone announcements; got ${r.milestones.length}`);
    assert.ok(r.milestones.every((m) => m.announcement.length > 0), 'every milestone announcement is non-empty (narrated)');

    // casting CONVENED by 班主, ≥2 advocates, cast filled, no deadlock
    assert.ok(r.castingConvenedTick !== null, 'casting was CONVENED by 班主 (surfaced in-world)');
    assert.ok(r.castingDiscussion, 'casting DISCUSSION recorded');
    assert.ok(r.castingDiscussion!.aspirants.length >= 2, `≥2 eligible advocates; got ${r.castingDiscussion!.aspirants.length}`);
    assert.ok(r.castingDiscussion!.decided, 'cast filled, no deadlock');
    assert.ok(r.castingDiscussion!.decision.includes('許仙='), 'the convened casting produced a resulting cast');

    // production advances as a TRACEABLE NARRATED chain (not silent flags)
    const chainByPhase = new Map(r.productionChain.map((e) => [e.phase, e]));
    for (const p of CHAIN_ORDER) assert.ok(chainByPhase.has(p), `production chain has a narrated ${p} event`);
    for (const p of CHAIN_ORDER) assert.ok(chainByPhase.get(p)!.narrated, `${p} is narrated`);
    const chainTicks = CHAIN_ORDER.map((p) => chainByPhase.get(p)!.tick);
    for (let i = 1; i < chainTicks.length; i++) assert.ok(chainTicks[i] >= chainTicks[i - 1], 'production chain is in order (announce→casting→rehearse→premiere)');

    // rhythm routing: ≥N floor members at the venue on ≥1 rehearsal slot; night=home
    const maxAttend = Math.max(0, ...r.rehearsalAttendance.map((a) => a.atVenue.length));
    assert.ok(maxAttend >= REHEARSAL_MIN_ATTEND, `≥${REHEARSAL_MIN_ATTEND} floor members AT rehearsal on ≥1 day slot; got max ${maxAttend}`);
    assert.ok(r.nightHomeSample, 'night-home routing was sampled after 排練');
    assert.equal(r.nightHomeSample!.floorAtVenue, 0, 'at night NO floor member is left on the public rehearsal floor (they are home)');
    assert.ok(r.nightHomeSample!.floorAtPrivate >= 1, 'at night ≥1 floor member is in a private home');

    // ABSENCE teeth: ≥1 member pulled off rehearsal by a hot want, absent, noticed
    assert.ok(r.absences.length >= 1, `≥1 member pulled off rehearsal by a hot want; got ${r.absences.length}`);
    assert.ok(r.absences.every((a) => a.note.length > 0), 'each absence is surfaced diegetically (班主 noticed in-world)');
    for (const a of r.rehearsalAttendance) {
        for (const ab of r.absences.filter((x) => x.tick === a.tick)) {
            assert.ok(!a.atVenue.includes(ab.who), `${ab.who} pulled off is ABSENT from the rehearsal scene at tick ${a.tick}`);
        }
    }

    // 床戲: report (no hard assert on tryst count — this is the standing diagnosis)
    assert.ok(r.bedroomFinding, '床戲 finding surfaced (count + reason)');

    // ── all V3 guarantees still hold ─────────────────────────────────────────
    assert.ok(r.prologueAtT0 && r.deadlineEveryTick, 'prologue @t0 + deadline every tick');
    assert.ok(r.reachedPremiere, 'production reached PREMIERED under the deadline');
    for (const s of ALL_STAGES) assert.ok(r.stagesSeen.includes(s), `stage ${s} advanced`);
    assert.ok(r.takesCount > 0, `REHEARSING produced takes (>0); got ${r.takesCount}`);
    assert.ok(r.stagedChapterChars > 0, 'staged 戲中戲 章回 rendered non-empty');
    assert.ok(r.contestedParts.length >= 1, `≥1 contested part; got ${r.contestedParts.length}`);
    assert.ok(r.ciMeta.some((c) => c.source === 'emergent' && c.offStage), 'an emergent 詞 carries an OFF-STAGE grudge (seam-2)');
    assert.ok(r.thickMemoryCi.length >= 1, 'a thick memory surfaced in a 詞 provenance');
    assert.ok(r.reshapeApplied, "連翹's slot-less want reshaped the production");
    assert.ok(r.liyiDecided, '立意 debated & injected');
    assert.ok(r.discussions.every((d) => d.rounds <= d.cap && d.decided), 'every discussion: rounds≤cap & decided');
    assert.ok(r.chapterByTick.every((c) => c !== null), 'a 章回 was produced EVERY tick');
    assert.ok(r.episodesProduced >= 1, 'day-end episode produced');
    assert.ok(r.finaleChapter, 'finale performance 章回 produced');
    assert.ok(r.wantsMutated >= 1, 'living-want self-rewrite mutated ≥1 want');
    assert.equal(r.crossCharacterLeak, 0, 'no cross-character rewrite leakage');
    assert.ok(r.predicate && r.predicate.complete, 'season predicate satisfied (premiered production)');
    assert.deepEqual(r.boxOffice, r.boxOfficeRepeat, 'box-office deterministic (same inputs → same number)');
    assert.ok(r.boxOffice!.total > 0 && r.boxOffice!.quality < 1, 'box-office non-zero, quality NOT clamped to 1.0');
    assert.ok(
        r.boxOfficeUnderRehearsed!.total < r.boxOffice!.total || r.boxOfficeUnderRehearsed!.quality < r.boxOffice!.quality,
        'an under-rehearsed show scores lower (box-office discriminates)',
    );
    assert.ok(Math.min(...Object.values(r.memoriesPerCast)) >= 14, 'every cast member ≥14 authored memories');
    assert.ok(r.snapshotRoundTrip && r.snapshotRoundTrip.ok, 'WorldState snapshot/restore round-trips mid-season');

    console.log('\n✅ SEASON FOUR FAKE-LLM SMOKE GREEN — all mechanical counters pass.\n');
    fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
