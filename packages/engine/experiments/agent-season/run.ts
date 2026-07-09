/**
 * AGENT-SEASON · HARNESS (fake smoke + short real-LLM slice).
 * ============================================================================
 * The clean rebuild of character/time orchestration: a 時辰-ROUND clock (not one
 * tick per character), occupation-rhythm placement, the 班主 rehearsal channel,
 * concurrent multi-venue scenes, a per-時辰 weave, relationship-dependent intimacy,
 * scheduled night consolidation, and sleep-with-teeth (health/mortality).
 *
 * FAKE-LLM smoke (default, zero keys):
 *   ./node_modules/.bin/tsx experiments/agent-season/run.ts
 *
 * SHORT REAL-LLM slice (1 day = 6 時辰). Keys via env, NEVER hardcoded. Writes a
 * PRESERVED archive at $SEASON_OUT_DIR:
 *   POE_API_KEY=… OPENAI_API_KEY=… AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-4.6 \
 *   SEASON_REAL_LLM=1 SEASON_OUT_DIR=/abs/dir \
 *   ./node_modules/.bin/tsx experiments/agent-season/run.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSceneAgent, LocalRecall, LocalClock, type SceneAgentPort } from '../../src/index.ts';
import { buildCast, type Char } from './world.ts';
import { occLabel, type RehearsalCall } from './rhythm.ts';
import { FakePlanner, RealPlanner, type Planner } from './agent-turn.ts';
import { runSeason, type SeasonResult, type RoundRecord } from './round.ts';
import { healthStatus } from './health.ts';

const REAL = process.env.SEASON_REAL_LLM === '1';
const DAYS = Number(process.env.SEASON_DAYS ?? '1');
const CAST = (process.env.SEASON_CAST ?? '柳生春,蘇映雪,金鳳,白韻秋,沈雪笙,江聞鶴,連翹').split(',').map((s) => s.trim()).filter(Boolean);

const logLines: string[] = [];
function log(line = ''): void {
    console.log(line);
    logLines.push(line);
}

async function main(): Promise<void> {
    const provider = process.env.AI_PROVIDER ?? '(unset)';
    const model = process.env.POE_MODEL_PRIMARY ?? '(unset)';
    const realEmbed = !!process.env.OPENAI_API_KEY;
    const outDir = process.env.SEASON_OUT_DIR
        ? path.resolve(process.env.SEASON_OUT_DIR)
        : REAL
          ? fs.mkdtempSync(path.join(os.tmpdir(), 'agent-season-real-'))
          : import.meta.dirname;
    fs.mkdirSync(outDir, { recursive: true });
    const recallDir = REAL ? path.join(outDir, 'memory') : fs.mkdtempSync(path.join(os.tmpdir(), 'agent-season-mem-'));

    log('══════════════════════════════════════════════════════════════════════');
    log(` AGENT-SEASON — 時辰-round clean rebuild (${REAL ? 'REAL-LLM' : 'FAKE-LLM smoke'})`);
    log('══════════════════════════════════════════════════════════════════════');
    log(`provider=${provider}  model=${model}  recall-embeddings=${realEmbed ? 'REAL(openai)' : 'HASH-fallback'}`);
    log(`days=${DAYS} (6 時辰/day)  cast=${CAST.join('、')}  out=${outDir}`);

    const agent: SceneAgentPort = REAL ? await realAgent() : new FakeSceneAgent();
    const planner: Planner = REAL ? new RealPlanner(log) : new FakePlanner();
    const recall = new LocalRecall(recallDir);
    const clockPort = new LocalClock();
    const cast = buildCast(CAST);
    const byName = new Map(cast.map((c) => [c.name, c]));

    // snapshot the initial self-model views for the latest-wins proof.
    const initialViews = new Map<string, Map<string, string>>();
    for (const c of cast) initialViews.set(c.id, new Map(c.relationshipViews));
    // assert seed memories loaded verbatim (non-thinned) into recall.
    const seedCounts = cast.map((c) => `${c.name}=${c.thickMemories.length}`);

    log(`\ncast (${cast.length}): ${cast.map((c) => `${c.name}[${occLabel(c.occupation)}]@${c.homeVenue}`).join('、')}`);
    log('（每個人都從自己的營生作息起步 — 這正是分散引力井的重點）');
    log(`seed memories loaded (verbatim, non-thinned): ${seedCounts.join('  ')}\n`);

    const reh: RehearsalCall = { announced: false, line: '' };
    const result = await runSeason({
        cast,
        planner,
        agent,
        recall,
        clockPort,
        log,
        days: DAYS,
        ticksPerDay: 6,
        maxScenesPerRound: REAL ? 3 : 4,
        reh,
    });

    printCounters(result, cast, byName, initialViews, seedCounts);
    const reportPath = path.join(outDir, 'report.md');
    writeReport(reportPath, { provider, model, realEmbed, result, cast, initialViews });

    if (!REAL) fs.rmSync(recallDir, { recursive: true, force: true });
    log(`\n✅ AGENT-SEASON ${REAL ? 'REAL-LLM SLICE' : 'FAKE SMOKE'} COMPLETE`);
    log(`   report:  ${reportPath}`);
    if (REAL) log(`   archive PRESERVED at: ${outDir}`);
}

async function realAgent(): Promise<SceneAgentPort> {
    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    return new RunnerSceneAgent();
}

// ── mechanical counter block ─────────────────────────────────────────────────
function venueDist(scenes: SceneResultLike[]): string {
    const m = new Map<string, number>();
    for (const s of scenes) m.set(s.venue, (m.get(s.venue) ?? 0) + 1);
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}=${n}(${Math.round((n / total) * 100)}%)`).join('  ·  ');
}
type SceneResultLike = { venue: string };

function printCounters(
    r: SeasonResult,
    cast: Char[],
    byName: Map<string, Char>,
    initialViews: Map<string, Map<string, string>>,
    seedCounts: string[],
): void {
    const L = (s = '') => log(s);
    const rounds = r.rounds;
    L('');
    L('════════════ AGENT-SEASON — MECHANICAL COUNTER BLOCK (no LLM judge) ════════════');

    // 1) 時辰-ROUND + fast-forward
    L('');
    L('── 1) 時辰-ROUND CLOCK (時辰-by-時辰; empty 時辰 fast-forwards) ────────────────');
    L(`rounds (時辰)............... ${rounds.length}  = ${DAYS}日 × 6 時辰`);
    const ff = rounds.filter((x) => x.fastForward);
    L(`fast-forwarded (empty)..... ${ff.length}  → ${ff.map((x) => `第${x.day}日·${x.part}`).join('、') || '（無）'}`);
    for (const x of ff) L(`   · 第${x.day}日·${x.part} 過場：「${x.passLine}」`);
    const dense = rounds.filter((x) => !x.fastForward);
    L(`dense 時辰 (a real round)... ${dense.length}  → ${dense.map((x) => `${x.part}(${x.scenes.length}場)`).join('、')}`);

    // 2) MULTI-VENUE CONCURRENCY + dispersion
    L('');
    L('── 2) MULTI-VENUE CONCURRENCY + DISPERSION (contrast old all-戲台) ────────────');
    const concurrentRounds = rounds.filter((x) => x.sceneVenues.length >= 2);
    L(`時辰 with ≥2 rendered-scene venues... ${concurrentRounds.length}  → ${concurrentRounds.map((x) => `${x.part}[${x.sceneVenues.join('+')}]`).join('、') || '（無）'}`);
    L(`multi-venue concurrency achieved.... ${concurrentRounds.length >= 1 ? 'YES' : 'NO'}`);
    L(`scene venue distribution............ ${r.scenes.length ? venueDist(r.scenes) : '（無場景）'}`);
    const stageShare = (() => {
        const total = r.scenes.length;
        const stage = r.scenes.filter((s) => s.venue === '雲錦台戲台').length;
        return total ? Math.round((stage / total) * 100) : 0;
    })();
    const distinctSceneVenues = new Set(r.scenes.map((s) => s.venue)).size;
    L(`distinct venues w/ a scene.......... ${distinctSceneVenues}  (season baseline was 1 = 戲台 only, 100%)`);
    L(`戲台 share of scenes................ ${stageShare}%  (dispersed = NOT ~100%)`);

    // 3) OCCUPATION-RHYTHM placement
    L('');
    L('── 3) OCCUPATION-RHYTHM (each character anchored to THEIR OWN life) ──────────');
    const troupeAtWork = rounds.some((x) => !x.night && r.reh.announced && x.placements.some((p) => byName.get(p.char)?.occupation === 'troupe' && (p.to === '雲錦台戲台' || p.to === '練功房')));
    L(`troupe at 戲台/練功房 on a day 時辰 (rehearsal called).. ${troupeAtWork ? 'YES' : 'NO'}`);
    const jin = byName.get('金鳳');
    const jinNight = rounds.filter((x) => x.part === '入夜').flatMap((x) => x.placements).filter((p) => p.char === '金鳳').map((p) => p.to);
    const jinDeep = rounds.filter((x) => x.part === '深宵').flatMap((x) => x.placements).filter((p) => p.char === '金鳳').map((p) => p.to);
    L(`金鳳 入夜 at 霞飛路歌場.............................. ${jinNight.includes('霞飛路歌場') ? 'YES' : `NO (${jinNight.join(',') || '未活動'})`}`);
    L(`金鳳 深宵 at 會樂里寓所.............................. ${jinDeep.includes('會樂里寓所') ? 'YES' : `NO (${jinDeep.join(',') || '未活動'})`}`);
    const bai = rounds.flatMap((x) => x.placements).filter((p) => p.char === '白韻秋').map((p) => p.to);
    L(`白韻秋 leisure (霞飛路/包廂茶座)..................... ${bai.every((v) => ['霞飛路', '包廂茶座', '白公館繡樓'].includes(v)) && bai.length ? 'YES' : `venues=${[...new Set(bai)].join(',') || '未活動'}`}`);
    void jin;

    // 4) 班主 REHEARSAL CHANNEL
    L('');
    L('── 4) 班主 REHEARSAL CHANNEL (an autonomous agent decision) ──────────────────');
    L(`沈雪笙 called rehearsal............. ${r.reh.announced ? `YES @ ${r.reh.at}` : 'NO'}`);
    if (r.reh.announced) L(`   announcement：「${r.reh.line}」`);
    L(`troupe gathered at a work venue.... ${r.rehearsalGathering.length ? 'YES' : 'NO'}`);
    for (const g of r.rehearsalGathering) L(`   · ${g.part} @ ${g.venue}：${g.members.join('、')}`);

    // 5) TIME TOOL
    L('');
    L('── 5) TIME TOOL (每回合先問時辰以定準作息) ───────────────────────────────────');
    L(`time-tool grounding queries........ ${r.timeToolUses}  (referenced/used = ${r.timeToolUses > 0 ? 'YES' : 'NO'})`);

    // 6) SEED MEMORIES (headline)
    L('');
    L('── 6) SEED MEMORIES — VERBATIM, NON-THINNED (the user\'s hard requirement) ────');
    L(`seed memory counts loaded into recall + self-model: ${seedCounts.join('  ')}`);
    const liu = byName.get('柳生春')!;
    const jinC = byName.get('金鳳')!;
    const su = byName.get('蘇映雪')!;
    const carnalLiu = liu.thickMemories.filter((m) => m.tag.startsWith('肌膚'));
    const carnalJin = jinC.thickMemories.filter((m) => m.tag.startsWith('肌膚'));
    const anlianLiu = liu.thickMemories.filter((m) => m.tag.startsWith('暗戀'));
    const anlianSu = su.thickMemories.filter((m) => m.tag.startsWith('暗戀'));
    L(`柳↔金鳳 肌膚/相伴 memories present.. 柳=${carnalLiu.length}、金鳳=${carnalJin.length}  → ${carnalLiu.length && carnalJin.length ? 'BOTH PRESENT' : 'MISSING'}`);
    L(`柳↔蘇 師姐妹/暗戀 memories present.. 柳=${anlianLiu.length}、蘇=${anlianSu.length}  → ${anlianLiu.length && anlianSu.length ? 'BOTH PRESENT' : 'MISSING'}`);
    L('');
    L('   ▽ 柳生春 ↔ 金鳳（身之情 / 相伴數年）— 逐字：');
    for (const m of carnalLiu.sort((a, b) => b.importance - a.importance).slice(0, 3)) L(`     ·(柳,imp${m.importance}) ${m.text}`);
    for (const m of carnalJin.sort((a, b) => b.importance - a.importance).slice(0, 2)) L(`     ·(金鳳,imp${m.importance}) ${m.text}`);
    L('');
    L('   ▽ 柳生春 ↔ 蘇映雪（八年師姐妹 / 未剖白的暗戀）— 逐字：');
    for (const m of anlianLiu.sort((a, b) => b.importance - a.importance).slice(0, 2)) L(`     ·(柳,imp${m.importance}) ${m.text}`);
    for (const m of anlianSu.sort((a, b) => b.importance - a.importance).slice(0, 2)) L(`     ·(蘇,imp${m.importance}) ${m.text}`);

    // surfacing at decision/scene time
    L('');
    const carnalSurfacings = r.surfaced.filter((s) => s.tag.startsWith('肌膚'));
    L(`   ▽ 肌膚-history SURFACED in recall at decision/scene time: ${carnalSurfacings.length} 次`);
    for (const s of carnalSurfacings.slice(0, 3)) {
        L(`     · [${s.context}] ${s.char} 召回：「${s.text.slice(0, 46)}…」`);
        L(`       ↳ 影響了：${s.shaped}`);
    }
    if (!carnalSurfacings.length) L('     （本次未偵測到肌膚記憶浮現；見誠實檢討）');

    // 7) SELF-MODEL latest-wins
    L('');
    L('── 7) SELF-MODEL LATEST-WINS (a changed relationship OVERWRITES) ─────────────');
    let overwrites = 0;
    const overwriteLines: string[] = [];
    for (const c of cast) {
        const before = initialViews.get(c.id)!;
        for (const [oid, view] of c.relationshipViews) {
            const b = before.get(oid);
            if (b && b !== view) {
                overwrites += 1;
                overwriteLines.push(`   · ${c.name} 對 ${byName.get(oid)?.name ?? oid}：「${b.slice(0, 24)}…」→「${view.slice(0, 24)}…」`);
            }
        }
    }
    L(`relationship views overwritten..... ${overwrites}  → ${overwrites > 0 ? 'latest-wins WORKS' : 'no change this slice'}`);
    for (const l of overwriteLines.slice(0, 6)) L(l);

    // 8) AGENT-TURN legibility + health/mortality
    L('');
    L('── 8) AGENT-TURN LEGIBILITY + SLEEP-TEETH ───────────────────────────────────');
    const totalPlacements = rounds.reduce((a, x) => a + x.placements.length, 0);
    L(`total agent turns (placements)..... ${totalPlacements}`);
    L(`total rendered scenes.............. ${r.scenes.length}`);
    L(`deaths (health ≤ 0)................ ${r.deaths.length}  ${r.deaths.length ? '→ ' + r.deaths.join('、') : '(none this short slice)'}`);
    L(`health at end...................... ${cast.map((c) => `${c.name}:${c.health.toFixed(2)}[${healthStatus(c)}]`).join('  ')}`);
    L('');
    L('════════════════════════════════════════════════════════════════════════════════');
}

// ── report.md ─────────────────────────────────────────────────────────────────
function writeReport(
    reportPath: string,
    args: { provider: string; model: string; realEmbed: boolean; result: SeasonResult; cast: Char[]; initialViews: Map<string, Map<string, string>> },
): void {
    const { result: r, cast } = args;
    const byName = new Map(cast.map((c) => [c.name, c]));
    const md: string[] = [];
    md.push('# Agent-season — 時辰-round clean rebuild report');
    md.push('');
    md.push(`> branch \`feat/agent-season\` (from \`feat/agent-loop\`) · ${REAL ? 'REAL-LLM' : 'FAKE smoke'} · provider=${args.provider} · model=${args.model} · recall-embeddings=${args.realEmbed ? 'REAL(openai)' : 'HASH'}`);
    md.push('');
    md.push('## Clean architecture (module map)');
    md.push('');
    md.push('- `canon-seed.ts` — VERBATIM thick seed memories (spring-snow.json), importance/tag curated only.');
    md.push('- `world.ts` — venues + cast; venue-anchored wants per occupation; established-lover derivation.');
    md.push('- `rhythm.ts` — occupation × 時辰 → placement pull (the multi-gravity-well fix) + 班主 rehearsal channel.');
    md.push('- `agent-turn.ts` — agent-with-tools plan (time/move/recall/interact); Fake + Real planners.');
    md.push('- `health.ts` — sleep-with-teeth: health drain/recover + mortality.');
    md.push('- `round.ts` — the 時辰-ROUND loop: active-set → placement → concurrent scenes → weave → night consolidation → fast-forward.');
    md.push('- `run.ts` — harness (fake smoke + real slice) + mechanical counter block.');
    md.push('');
    md.push('## Venue distribution (dispersion proof)');
    md.push('');
    md.push('```');
    md.push(r.scenes.length ? venueDist(r.scenes) : '（無場景）');
    md.push('```');
    md.push('');
    md.push('## 時辰-round transcript (per 時辰)');
    md.push('');
    for (const x of r.rounds) md.push(roundMd(x, byName));
    md.push('## Seed memories (verbatim, non-thinned)');
    md.push('');
    const liu = byName.get('柳生春');
    const jin = byName.get('金鳳');
    const su = byName.get('蘇映雪');
    if (liu && jin) {
        md.push('### 柳生春 ↔ 金鳳 — 身之情 / 相伴數年 (肌膚)');
        for (const m of liu.thickMemories.filter((z) => z.tag.startsWith('肌膚'))) md.push(`- (柳, imp${m.importance}) ${m.text}`);
        for (const m of jin.thickMemories.filter((z) => z.tag.startsWith('肌膚'))) md.push(`- (金鳳, imp${m.importance}) ${m.text}`);
        md.push('');
    }
    if (liu && su) {
        md.push('### 柳生春 ↔ 蘇映雪 — 八年師姐妹 / 未剖白的暗戀 (暗戀)');
        for (const m of liu.thickMemories.filter((z) => z.tag.startsWith('暗戀'))) md.push(`- (柳, imp${m.importance}) ${m.text}`);
        for (const m of su.thickMemories.filter((z) => z.tag.startsWith('暗戀'))) md.push(`- (蘇, imp${m.importance}) ${m.text}`);
        md.push('');
    }
    md.push('### 肌膚-history surfacings (recall at decision/scene time)');
    md.push('');
    for (const s of r.surfaced.filter((z) => z.tag.startsWith('肌膚'))) {
        md.push(`- **[${s.context}] ${s.char}** 召回「${s.text.slice(0, 40)}…」 → 影響：${s.shaped}`);
    }
    md.push('');
    fs.writeFileSync(reportPath, md.join('\n'));
}

function roundMd(x: RoundRecord, byName: Map<string, Char>): string {
    const lines: string[] = [];
    lines.push(`### 時辰 ${x.tick} · 第${x.day}日·${x.part}${x.night ? '（入夜）' : ''}`);
    if (x.fastForward) {
        lines.push(`- **過場（fast-forward）**：${x.passLine}`);
        lines.push('');
        return lines.join('\n');
    }
    lines.push(`- **active**：${x.active.join('、')}  ·  **active venues**：${x.activeVenues.join('、')}`);
    for (const p of x.placements) {
        lines.push(`  - **${p.char}**（${p.from}→${p.to}）｜tools: ${p.tools.join(' → ')}`);
        lines.push(`    - 計劃：${p.plan}`);
        if (p.interactIntent) lines.push(`    - interact→ ${p.interactIntent.target}：${p.interactIntent.intent}`);
    }
    for (const s of x.scenes) {
        lines.push(`  - **場景 @ ${s.venue}**${s.isPrivate ? '（私）' : ''}${s.consummate ? '〔床〕' : ''}：${s.participants.join('×')}`);
        for (const b of s.beats) lines.push(`    > **${b.name}**：${b.text}`);
        if (s.resolved.length) lines.push(`    - 了結：${s.resolved.join('；')}`);
    }
    if (x.chapter) {
        lines.push(`  - **章回（織回）**：`);
        lines.push(`    > ${x.chapter.replace(/\n/g, '\n    > ')}`);
    }
    for (const cs of x.consolidations) {
        lines.push(`  - **深宵覆蓋 · ${cs.char}**：${cs.updated.join('；')}`);
    }
    lines.push('');
    return lines.join('\n');
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
