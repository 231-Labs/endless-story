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

import { FakeSceneAgent, LocalRecall, LocalClock, applyRewrite, type SceneAgentPort } from '../../src/index.ts';
import { buildCast, isPublicVenue, type Char } from './world.ts';
import { snapshotCast, restoreCast, type CastSnapshot } from './persistence.ts';
import { occLabel, type RehearsalCall } from './rhythm.ts';
import { FakePlanner, RealPlanner, type Planner } from './agent-turn.ts';
import { runSeason, type SeasonResult, type RoundRecord } from './round.ts';
import { healthStatus } from './health.ts';
import { newPlay, totalEffort } from './production.ts';
import { makeShowrunner } from './showrunner.ts';
import { renderSeasonHtml } from './season-html.ts';

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
    // Memory is PERSISTED under <outDir>/memory whenever this run has a durable home
    // (a real slice, or an explicit SEASON_OUT_DIR) — so a later week can restore it. A
    // bare default smoke uses a throwaway temp dir (keeps the source tree clean).
    const persistMemory = REAL || !!process.env.SEASON_OUT_DIR;
    const recallDir = persistMemory
        ? path.join(outDir, 'memory')
        : fs.mkdtempSync(path.join(os.tmpdir(), 'agent-season-mem-'));
    fs.mkdirSync(recallDir, { recursive: true });

    log('══════════════════════════════════════════════════════════════════════');
    log(` AGENT-SEASON — 時辰-round clean rebuild (${REAL ? 'REAL-LLM' : 'FAKE-LLM smoke'})`);
    log('══════════════════════════════════════════════════════════════════════');
    log(`provider=${provider}  model=${model}  recall-embeddings=${realEmbed ? 'REAL(openai)' : 'HASH-fallback'}`);
    log(`days=${DAYS} (6 時辰/day)  cast=${CAST.join('、')}  out=${outDir}`);

    const agent: SceneAgentPort = REAL ? await realAgent() : new FakeSceneAgent();
    const planner: Planner = REAL ? new RealPlanner(log) : new FakePlanner();
    const clockPort = new LocalClock();
    const cast = buildCast(CAST);
    const byName = new Map(cast.map((c) => [c.name, c]));
    const nameOf = new Map(cast.map((c) => [c.id, c.name]));

    // ── SEASON PERSISTENCE — CONTINUE A WEEK. If SEASON_RESTORE points at a PRIOR run's
    // outDir, overlay that week's mutated cast state onto this fresh seed AND carry its
    // accumulated episodic memories forward (copy the prior memory dir into this recall
    // dir BEFORE LocalRecall reads it). Canon seed memories are reloaded verbatim regardless.
    const restorePath = process.env.SEASON_RESTORE ? path.resolve(process.env.SEASON_RESTORE) : null;
    const restoreInfo: { continued: boolean; from?: string; restored: string[]; samples: string[] } = {
        continued: false,
        restored: [],
        samples: [],
    };
    if (restorePath) {
        const statePath = path.join(restorePath, 'cast-state.json');
        if (fs.existsSync(statePath)) {
            const snap = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as CastSnapshot;
            const restored = restoreCast(cast, snap);
            // carry the prior week's accumulated episodic memory forward (copy, never mutate).
            const priorMem = path.join(restorePath, 'memory');
            if (fs.existsSync(priorMem)) fs.cpSync(priorMem, recallDir, { recursive: true });
            // sample a couple of carried-over relationship views to PROVE the round-trip.
            const samples: string[] = [];
            for (const c of cast) {
                if (!snap.cast[c.id]) continue;
                for (const [oid, view] of c.relationshipViews) {
                    samples.push(`${c.name} 對 ${nameOf.get(oid) ?? oid}：「${view.slice(0, 28)}${view.length > 28 ? '…' : ''}」`);
                    if (samples.length >= 2) break;
                }
                if (samples.length >= 2) break;
            }
            restoreInfo.continued = true;
            restoreInfo.from = restorePath;
            restoreInfo.restored = restored;
            restoreInfo.samples = samples;
            log(`\n▶ 續盤：從 ${restorePath} 載入 ${restored.length} 人狀態 + 記憶（${restored.map((id) => nameOf.get(id) ?? id).join('、')}）`);
        } else {
            log(`\n▶ SEASON_RESTORE 指向 ${restorePath}，但找不到 cast-state.json — 改開新盤。`);
        }
    } else {
        log('\n▶ 開新盤（fresh season；未設 SEASON_RESTORE）。');
    }

    const recall = new LocalRecall(recallDir);

    // ── 注夢 (DREAM INJECTION) — the paid-influence hook, WITHOUT puppeteering.
    // SEASON_DREAM='角色名|夢境文字' plants last night's dream: the character REMEMBERS
    // dreaming it (an episodic memory, recallable like any lived moment), and her OWN
    // ledger-keeper (the validated rewriteWantLedger) decides what — if anything — it
    // stirs: mutate a want, spawn one, or shrug it off. The dream whispers; she chooses.
    const dreamSpec = process.env.SEASON_DREAM ?? '';
    if (dreamSpec.includes('|')) {
        const cut = dreamSpec.indexOf('|');
        const dname = dreamSpec.slice(0, cut).trim();
        const dtext = dreamSpec.slice(cut + 1).trim();
        const dc = byName.get(dname);
        if (dc && dtext) {
            const dreamLine = `昨夜得了一個夢，醒來枕上心口都還跳著：${dtext}`;
            await recall.remember(dc.id, dreamLine, { kind: 'observation', importance: 8, day: 0 });
            log(`\n〔注夢〕${dc.name} 昨夜得夢：「${dtext.slice(0, 48)}${dtext.length > 48 ? '…' : ''}」`);
            try {
                const beforeLive = dc.wants.filter((w) => !w.retired).map((w) => w.desc).join('｜');
                const reply = await agent.rewriteWantLedger({
                    name: dc.name,
                    persona: dc.persona,
                    secret: dc.secret,
                    wants: dc.wants.filter((w) => !w.retired).map((w) => ({ id: w.id, layer: w.layer, desc: w.desc })),
                    sceneText: dreamLine,
                });
                applyRewrite(dc.wants, dc.id, reply, 0, [], cast.map((x) => x.name));
                const afterLive = dc.wants.filter((w) => !w.retired).map((w) => w.desc).join('｜');
                const reaction = reply.spawn?.desc
                    ? `這夢在心裡撩起一樁：「${reply.spawn.desc}」`
                    : afterLive !== beforeLive
                      ? '舊念被這夢攪動、換了模樣'
                      : '醒來只當是個夢，心帳未動';
                log(`   → ${reaction}`);
            } catch {
                log('   → （夢注了，心帳未應——非致命）');
            }
        }
    }

    // snapshot the initial self-model views for the latest-wins proof.
    const initialViews = new Map<string, Map<string, string>>();
    for (const c of cast) initialViews.set(c.id, new Map(c.relationshipViews));
    // assert seed memories loaded verbatim (non-thinned) into recall.
    const seedCounts = cast.map((c) => `${c.name}=${c.thickMemories.length}`);

    log(`\ncast (${cast.length}): ${cast.map((c) => `${c.name}[${occLabel(c.occupation)}]@${c.homeVenue}`).join('、')}`);
    log('（每個人都從自己的營生作息起步 — 這正是分散引力井的重點）');
    log(`seed memories loaded (verbatim, non-thinned): ${seedCounts.join('  ')}\n`);

    const reh: RehearsalCall = { announced: false, line: '' };
    const showrunner = makeShowrunner(DAYS);
    const play = newPlay('', 'genesis');
    log(`\nshowrunner 中心命題：${showrunner.centralQuestion}`);
    log(`死線（世界事實）：第${showrunner.deadlineDay}日·${showrunner.finalePart} 年底大會串｜排練投入門檻 ≥${showrunner.rehearsalEffortThreshold}`);
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
        play,
        showrunner,
    });

    printCounters(result, cast, byName, initialViews, seedCounts, restoreInfo);
    const reportPath = path.join(outDir, 'report.md');
    writeReport(reportPath, { provider, model, realEmbed, result, cast, initialViews });

    // SEASON PERSISTENCE — write the end-of-week snapshot so the NEXT week can restore it.
    const statePath = path.join(outDir, 'cast-state.json');
    fs.writeFileSync(statePath, JSON.stringify(snapshotCast(cast, DAYS * 6)));

    // ALWAYS emit a readable HTML next to the report (§ user: every run must produce
    // an HTML to read, so problems are caught by reading the whole season).
    const htmlPath = path.join(outDir, 'report.html');
    fs.writeFileSync(
        htmlPath,
        renderSeasonHtml(result, {
            title: '春雪社 · 重啟戲箱',
            subtitle: '一齣自治敘事引擎跑出的完整賽季 · 上海 · 一九二〇年代',
            centralQuestion: showrunner.centralQuestion,
            deadlineLine: `死線 · 世界事實：年底霞飛路大會串（第${showrunner.deadlineDay}日${showrunner.finalePart}）。掛得上名的班子拿檔期版面，掛不上的被遺忘。`,
            prologue: PROLOGUE,
            cast,
        }),
    );

    if (!persistMemory) fs.rmSync(recallDir, { recursive: true, force: true });
    log(`\n✅ AGENT-SEASON ${REAL ? 'REAL-LLM SLICE' : 'FAKE SMOKE'} COMPLETE`);
    log(`   report:  ${reportPath}`);
    log(`   html:    ${htmlPath}`);
    log(`   state:   ${statePath}  (snapshot → restore next week via SEASON_RESTORE=${outDir})`);
    if (persistMemory) log(`   memory PRESERVED at: ${recallDir}`);
    if (REAL) log(`   archive PRESERVED at: ${outDir}`);
}

/** 序章 — world facts only (SEASON_ONE_SLICE §6); the reader's opening. */
const PROLOGUE = [
    '春雪社的這座戲台，原是清末一位官紳家的堂會戲台。改朝換代後，官宦人家的排場散了，這方戲台連著半進院子，被沈雪笙盤了下來，掛上春雪社的水牌。正樑上那塊舊匾額她一直沒換，燙金的字暗了，至今照舊掛著。',
    '戲台最裡頭的後台，那幾口樟木戲箱，落了十五年的灰。十五年前沈雪笙封箱那日，班裡如今這批台前的人多半還是孩子。她沒對任何人交代緣由，只說往後這幾箱小生的行頭不再動了。班子靠著幾齣熟戲，一年一年也就過來了，台下的人換了一批又一批，戲單卻還是那張戲單。',
    '今年不同。霞飛路那頭新起的戲園放出話來，年底要辦一場打對台的大會串。掛得上名的班子，往後的檔期、報上的版面、堂會的邀約，都在這一場上見高低。掛不上的，慢慢就沒人記得了。',
    '沈雪笙把那口最底下的箱子開了一條縫。裡頭壓著的，除了那幾件沒人再穿的小生戲衣，還有一只早停了的懷錶。',
    '戲箱要重開了。這一季，春雪社得排出一齣自己的新戲，趕在年底那場會串之前。至於箱底那些沒說完的舊事，沒有人交代該怎麼辦。',
];

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
    restoreInfo: { continued: boolean; from?: string; restored: string[]; samples: string[] },
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

    // 9) PRODUCTION + BOX OFFICE + SHOWRUNNER RAZOR (Stage 2)
    L('');
    L('── 9) PRODUCTION + BOX OFFICE + SHOWRUNNER RAZOR (deterministic, no LLM number) ──');
    const play = r.play;
    L(`play title......................... 《${play.title || '（未定）'}》`);
    L(`play reached 'premiered'........... ${play.state === 'premiered' ? 'YES' : `NO (state=${play.state})`}`);
    L(`cast (≥2 needed)................... ${play.cast.length}  → ${play.cast.join('、') || '（無）'}`);
    L(`effort accumulated per char........ ${[...play.effort.entries()].map(([id, e]) => `${id}=${e}`).join('  ') || '（無）'}`);
    L(`total rehearsal effort............. ${totalEffort(play).toFixed(1)}`);
    L(`deadline world-fact injected....... ${r.deadlineInjections}  時辰-plans  (injected = ${r.deadlineInjections > 0 ? 'YES' : 'NO'})`);
    if (r.boxOffice) {
        const bo = r.boxOffice;
        L(`box office computed deterministically. YES  → total=${bo.total}（購票 ${bo.ticketBuyers}、回訪 ${bo.repeats}）`);
        L(`   quality=${bo.quality.toFixed(2)}  repute=${bo.repute.toFixed(2)}  (both audited accumulators)`);
        for (const row of bo.rows) {
            L(`   · ${row.name}[${row.kind}] warmth=${row.warmth.toFixed(2)} → willingness=${row.willingness.toFixed(2)}  ${row.bought ? '購票' : '未購'}${row.repeat ? '＋回訪' : ''}`);
        }
        L(`   drivers (ability×effort)....... ${bo.drivers.map((d) => `${d.name}(${d.ability}×${d.effort}=${d.contribution.toFixed(2)})`).join('  ')}`);
    } else {
        L('box office computed deterministically. NO (play never premiered)');
    }
    const v = r.showrunnerVerdict;
    L(`showrunner razor (season predicate). ${v.passed ? 'PASS ✅' : 'FAIL ❌'}`);
    for (const reason of v.reasons) L(`   · ${reason}`);

    // 10) EXCLUSIVITY / DISCOVERY (修羅場) — general, driven by romantic stake + presence
    L('');
    L('── 10) 排他 / 撞破修羅場 (a jealous third caught an intimate pair; edges rewrite) ──');
    L(`修羅場 fired this season........... ${r.discoveries.length}  ${r.discoveries.length ? '' : '(none — no invested third reached an intimate scene)'}`);
    for (const d of r.discoveries) {
        L(`   ⚔ 第${Math.floor(d.tick / 6) + 1}日·${d.part}：${d.discoverer} ${d.brokeIn ? '破門闖進撞破' : '撞破'} ${d.pair[0]}×${d.pair[1]} @ ${d.venue}`);
    }

    // 11) SCENE SELF-CHECK / REPAIR + POV subjective layer
    L('');
    L('── 11) 場景自檢/修訂 + 各人視角（主觀敘事層） ────────────────────────────────');
    L(`scenes put through self-check...... ${r.reviewedScenes}  (reviewed = ${r.reviewedScenes > 0 ? 'YES' : 'NO'})`);
    L(`beats whose text was repaired...... ${r.reviewedBeatsChanged}  ${r.reviewedBeatsChanged > 0 ? '' : '(fake = pass-through, 0 expected)'}`);
    L(`woven 章回 put through reviewChapter ${r.reviewedChapters}  (chapter-level gender/logic guard = ${r.reviewedChapters > 0 ? 'YES' : 'NO'})`);
    L(`章回 whose prose was repaired....... ${r.repairedChapters}  ${r.repairedChapters > 0 ? '' : '(fake = pass-through, 0 expected)'}`);
    const povChars = Object.keys(r.povReflections);
    const povTotal = povChars.reduce((n, id) => n + r.povReflections[id].length, 0);
    L(`POV daily reflections generated.... ${povTotal}  across ${povChars.length} 人  (subjective layer = ${povTotal > 0 ? 'YES' : 'NO'})`);
    for (const id of povChars) {
        const rows = r.povReflections[id];
        const nm = byName.get(id)?.name ?? id;
        const last = rows[rows.length - 1];
        L(`   · ${nm}：${rows.length} 日  ↳ 第${last.day}日「${last.text.slice(0, 40)}…」`);
    }

    // 12) PERCEPTION (眼耳鼻身, passive+gated) + TIME-AS-SCARCE-RESOURCE (opportunity cost)
    L('');
    L('── 12) 感知（眼耳鼻身，被動＋定位設限）＋ 時辰＝稀缺資源（機會成本） ──────────────');
    L(`perception snapshots injected...... ${r.perceptionInjections}  (每個 plan 一次被動感知；gated = ${r.perceptionInjections > 0 ? 'YES' : 'NO'})`);
    L(`修羅場 via ADJACENT-HEAR path...... ${r.hearDiscoveries}  (隔壁聽見→趕來破門；抓姦不再需同處一室)`);
    L(`opportunity-cost framing injected.. ${r.oppCostFramings}  (每個 plan 皆知這一時辰有限；injected = ${r.oppCostFramings > 0 ? 'YES' : 'NO'})`);
    L(`long/deep scenes (beats ≥ ${10}) that SPENT participants... ${r.longScenes}`);
    L(`active-turns skipped (character spent by a long scene).... ${r.occupiedTurns}  ${r.occupiedTurns > 0 ? '→ 機會成本 BIT' : '(none this slice — 床戲 falls on 深宵, the day\'s last 時辰)'}`);

    // 13) SEASON PERSISTENCE (snapshot / restore → continue a week)
    L('');
    L('── 13) 賽季存續（快照／續盤，把上週的狀態＋記憶接下去） ──────────────────────');
    L(`this run was................ ${restoreInfo.continued ? '續盤 CONTINUATION' : '開新盤 FRESH SEASON'}`);
    if (restoreInfo.continued) {
        L(`restored from............... ${restoreInfo.from}`);
        L(`characters restored......... ${restoreInfo.restored.length}  → ${restoreInfo.restored.map((id) => byId2(cast, id)?.name ?? id).join('、')}`);
        L('sample carried-over relationship views (round-trip proof):');
        for (const s of restoreInfo.samples) L(`   · ${s}`);
    } else {
        L('（本盤為新開；跑完會寫 cast-state.json，下週用 SEASON_RESTORE 指向本 outDir 即可續盤）');
    }

    // 14) STREET / FOOD / MONEY (daily life + a small economy)
    L('');
    L('── 14) 街市／吃食／錢（日常生活＋小經濟） ────────────────────────────────────');
    const totalMeals = Object.values(r.meals).reduce((a, b) => a + b, 0);
    L(`new PUBLIC street/food venues in geography.. 霞飛路商店街、戲園前街  (both isPublic = ${['霞飛路商店街', '戲園前街'].every((n) => isPublicVenue(n)) ? 'YES' : 'NO'})`);
    L(`meals eaten this season (Σ)................. ${totalMeals}  ${totalMeals > 0 ? '→ 吃食機制 BIT' : '(nobody stood at a food venue on a free turn this slice)'}`);
    L('per-character end-of-season 錢／餓／meals:');
    for (const c of cast) {
        L(`   · ${c.name}[${occLabel(c.occupation)}]  money=${c.money}  hunger=${c.hunger.toFixed(2)}  meals=${r.meals[c.id] ?? 0}`);
    }
    const richest = [...cast].sort((a, b) => b.money - a.money)[0];
    const poorest = [...cast].sort((a, b) => a.money - b.money)[0];
    L(`seeded wealth spread (DATA, not name-logic).. 最寬裕 ${richest.name}=${richest.money} ≫ 最緊 ${poorest.name}=${poorest.money}`);
    L(`money never negative......................... ${cast.every((c) => c.money >= 0) ? 'YES' : 'NO'}`);

    L('');
    L('════════════════════════════════════════════════════════════════════════════════');
}

/** Local helper: find a cast member by id (the persistence counter prints names). */
function byId2(cast: Char[], id: string): Char | undefined {
    return cast.find((c) => c.id === id);
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
    md.push(...povMd(r, cast));
    md.push(...productionMd(r));
    md.push(...boxOfficeMd(r));
    md.push(...showrunnerMd(r));
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
        lines.push(`  - **場景 @ ${s.venue}**${s.isPrivate ? '（私）' : ''}${s.consummate ? '〔床〕' : ''}${s.discovery ? '〔修羅場〕' : ''}：${s.participants.join('×')}`);
        // Private / 床 / 修羅場 scenes print their WOVEN 章回 first (the readable literary
        // version), then the raw 分鏡 beats after it. Public scenes keep the raw beats
        // (the per-時辰 public weave already renders their prose at the round level).
        const privateWoven = (s.isPrivate || !!s.discovery) && !!s.chapter;
        if (privateWoven) {
            lines.push(`    - **章回（此場織回）**：`);
            lines.push(`    > ${s.chapter!.replace(/\n/g, '\n    > ')}`);
            lines.push(`    - 分鏡（${s.beats.length} 拍）：`);
        }
        // Private / 床 / 修羅場 scenes surface each beat's 內心一句 (〔心〕) under the
        // spoken line — the emotional transition a reader otherwise never sees.
        const showInner = s.isPrivate || !!s.discovery;
        for (const b of s.beats) {
            lines.push(`    > **${b.name}**：${b.text}`);
            if (showInner && b.inner) lines.push(`    > 〔心〕${b.inner}`);
        }
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

// ── POV subjective layer (report) ─────────────────────────────────────────────
function povMd(r: SeasonResult, cast: Char[]): string[] {
    const md: string[] = [];
    const ids = cast.map((c) => c.id).filter((id) => (r.povReflections[id]?.length ?? 0) > 0);
    if (!ids.length) return md;
    md.push('## 各人視角 · POV daily reflections (subjective layer)');
    md.push('');
    md.push('> 第一人稱、主觀（或有偏頗）的每日自述，與客觀的時辰章回並存。讀者可只跟著一個人走。');
    md.push('');
    const byId = new Map(cast.map((c) => [c.id, c]));
    for (const id of ids) {
        md.push(`### ${byId.get(id)?.name ?? id} 的帳`);
        for (const row of r.povReflections[id]) md.push(`- **第${row.day}日**：${row.text}`);
        md.push('');
    }
    return md;
}

// ── Stage 2 report sections ───────────────────────────────────────────────────
function productionMd(r: SeasonResult): string[] {
    const play = r.play;
    const md: string[] = [];
    md.push('## 製作 Production');
    md.push('');
    md.push(`- **戲碼**：《${play.title || '（未定）'}》　**狀態**：${play.state}`);
    md.push(`- **state timeline**：${play.timeline.map((t) => `${t.state}@${t.at}`).join(' → ')}`);
    md.push(`- **選角（cast）**：${play.cast.join('、') || '（無）'}`);
    md.push(`- **每角排練投入（effort）**：${[...play.effort.entries()].map(([id, e]) => `${id}=${e}`).join('　') || '（無）'}　（total=${totalEffort(play).toFixed(1)}）`);
    md.push(`- **班之名望（repute accumulator）**：${play.repute.toFixed(2)}`);
    md.push('- **劇本片段（script fragments）**：');
    if (play.scriptFragments.length) for (const f of play.scriptFragments) md.push(`  - ${f}`);
    else md.push('  - （無）');
    if (r.premiere) {
        md.push('- **大會串獻演（premiere scene）**：');
        md.push(`  - @ ${r.premiere.venue}：${r.premiere.participants.join('×')}`);
        for (const b of r.premiere.beats) md.push(`    > **${b.name}**：${b.text}`);
    }
    md.push('');
    return md;
}

function boxOfficeMd(r: SeasonResult): string[] {
    const md: string[] = [];
    md.push('## 大會串 Finale + 票房 Box office');
    md.push('');
    const bo = r.boxOffice;
    if (!bo) {
        md.push('（本場未演成，無票房。）');
        md.push('');
        return md;
    }
    md.push('> 數字是可審加總，永不由 LLM 決定。willingness = 0.4·warmth + 0.3·repute + 0.3·quality；');
    md.push('> box office = Σ 購票(willingness>0) + 回訪(willingness>0.6)。');
    md.push('');
    md.push(`- **票房總計**：**${bo.total}**（購票 ${bo.ticketBuyers} 人、回訪 ${bo.repeats} 次）`);
    md.push(`- **戲之品相 quality**：${bo.quality.toFixed(2)}　**班之名望 repute**：${bo.repute.toFixed(2)}`);
    md.push('');
    md.push('| 觀眾 | 類 | warmth | repute | quality | willingness | 購票 | 回訪 |');
    md.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const row of bo.rows) {
        md.push(`| ${row.name} | ${row.kind} | ${row.warmth.toFixed(2)} | ${row.repute.toFixed(2)} | ${row.quality.toFixed(2)} | ${row.willingness.toFixed(2)} | ${row.bought ? '✓' : ''} | ${row.repeat ? '✓' : ''} |`);
    }
    md.push('');
    md.push(`- **驅動品相的角色（ability × effort）**：${bo.drivers.map((d) => `${d.name}（${d.ability}×${d.effort}=${d.contribution.toFixed(2)}）`).join('　')}`);
    md.push('');
    return md;
}

function showrunnerMd(r: SeasonResult): string[] {
    const md: string[] = [];
    md.push('## Showrunner 收尾判準');
    md.push('');
    md.push(`**${r.showrunnerVerdict.passed ? 'PASS ✅' : 'FAIL ❌'}** — razor：劇本>0 ∧ 選角≥2 ∧ 排練投入≥門檻 ∧ state=premiered。`);
    md.push('');
    for (const reason of r.showrunnerVerdict.reasons) md.push(`- ${reason}`);
    md.push('');
    return md;
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
