/**
 * LabRunManager — the cinema-lab's in-process world runner.
 *
 * This is `packages/engine/src/cli.ts` main() lifted into a long-lived server
 * object: the SAME adapters, the SAME provenance manifest, the SAME per-tick
 * filesystem transaction, so a lab run directory is byte-compatible with an
 * engine CLI run (either side can resume the other). Zero chain, zero Walrus:
 * FakeSceneAgent for deterministic runs, RunnerSceneAgent (pure LLM) for real
 * prose. The only additions over the CLI are observability (live beat ring +
 * log ring + ticks.jsonl) and idle-time world-physics editing.
 *
 * Single-home rule (ENGINE_CORE.md): no narrative mechanism lives here — this
 * file is wiring. Anything that smells like mechanism goes to engine core.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    FakeSceneAgent,
    FileArchive,
    LocalClock,
    LocalEconomy,
    LocalRecall,
    MirrorClock,
    TickFilesystemTransaction,
    WorldState,
    applySeasonFrame,
    attachEventDeck,
    createWorldFromPreset,
    loadEventDeckFile,
    loadSeasonFrameFile,
    reconcileSeasonObjects,
    runInterludes,
    runTick,
    sampleMirrorClock,
    seedAcquaintance,
    seedRelationshipViews,
    seedSeasonOpening,
    type ClockPort,
    type InterludeRecord,
    type RawPreset,
    type SceneAgentPort,
    type SeasonFrame,
    type TickDeps,
    type TickReport,
} from '@endless-story/engine';
import { auditSeasonEconomy } from '@endless-story/engine/core/season-economy';
import { writeTickDossiers } from '@endless-story/engine/dossier-artifact';
import { refreshSeasonEditorial, type AnthologyComposer } from '@endless-story/engine/editorial-artifact';
import { loadLLMConfig, resolveTextProvider } from '@endless-story/llm';
import { SPRING_SNOW_MIRROR, bucketsBetween, formatStoryDate, storyNow } from '@endless-story/shared/world-clock';
import { beatsFromTickRecords, tailInterludeRecords, tailTickRecords } from './artifacts';
import { writeCheckpoint } from './checkpoints';
import { readJson, runDir, writeJsonAtomic } from './paths';
import { readRunMeta, writeRunMeta, writeRunStatus } from './store';
import { deckDirFor, readSeedRaw, seasonDirFor, seedDirFor } from './seeds';
import type { LabInterludeLive, LabLiveBeat, LabRunMeta, LabRunPhase, LabTickRecord } from './types';

const BEAT_RING_CAP = 600;
const LOG_RING_CAP = 300;
/** 折子環——低頻串流，不必如拍流那樣深；夠 UI 顯示「最近折子」即可。 */
const INTERLUDE_RING_CAP = 60;
/** 「活著」driver 的巡佇列間隔——AGENT_WAKE_LAYER.md 附錄 A 給的量級（~45s）：
 *  比引擎的 60s debounce 窗略短，讓折子在窗滿齡後盡快被巡到，體感仍是
 *  「幾十秒」而非「下一分鐘」。 */
const ALIVE_POLL_MS = 45_000;

const ECONOMY_ACTION_LABEL: Record<string, string> = {
    purchase: '購置',
    pay: '給錢',
    give: '相贈',
    contract_sign: '簽約',
    contract_decline: '拒簽',
    contract_fill_partner: '填搭檔',
    counter_offer: '還價',
};

/** Humanize the structured mechanical acts riding on a committed beat —
 *  物件操作與銀錢動作，讓「角色對世界做了什麼」在拍流裡看得見。 */
function humanizeBeatActs(
    world: WorldState,
    beat: { objectEffects?: ReadonlyArray<object>; economyCommands?: ReadonlyArray<object> },
): string[] {
    const acts: string[] = [];
    for (const effect of (beat.objectEffects ?? []) as Array<Record<string, unknown>>) {
        const label = (typeof effect.objectId === 'string' && world.objectById(effect.objectId)?.label) || String(effect.objectId ?? '某物');
        const parts = [
            effect.carried === true ? '隨身攜起' : effect.carried === false ? '放下' : '',
            typeof effect.container === 'string' && effect.container ? `入${effect.container}` : '',
            typeof effect.toScene === 'string' && effect.toScene ? `移往${effect.toScene}` : '',
            effect.visibility === 'hidden' ? '藏起' : effect.visibility === 'destroyed' ? '毀去' : '',
            typeof effect.state === 'string' && effect.state ? `（${effect.state}）` : '',
        ].filter(Boolean);
        acts.push(`物 · ${label}${parts.length ? '：' + parts.join('、') : '有所動'}`);
    }
    for (const command of (beat.economyCommands ?? []) as Array<Record<string, unknown>>) {
        const action = typeof command.action === 'string' ? command.action : '';
        const parts = [
            ECONOMY_ACTION_LABEL[action] ?? action,
            typeof command.itemId === 'string' && command.itemId ? String(command.itemId) : '',
            typeof command.amountYuan === 'number' ? `${command.amountYuan} 元` : '',
            typeof command.toName === 'string' && command.toName ? `→ ${command.toName}` : '',
            typeof command.contractId === 'string' && command.contractId ? `〔${command.contractId}〕` : '',
        ].filter(Boolean);
        acts.push(`錢 · ${parts.join(' ')}`);
    }
    return acts;
}

interface RunManifest {
    version: 1;
    preset: string;
    season?: string;
    realLlm: boolean;
    provider: string;
    model: string;
    relationshipFallback: boolean;
    emergentProduction: boolean;
    heartsCanFade: boolean;
    beatPicksWant: boolean;
    quietPresence: boolean;
    /** 事件牌組 id in play. Absent ⇒ this run has no external-push layer. */
    deck?: string;
    /** 時間法則——凍在創卷那一刻，換模式一律開新卷（與 preset/provider 同一紀律）。
     *  舊卷的 manifest 沒有這欄；比對時視同 'tick'（見 open() 的 frozen-check）。 */
    timeMode: 'tick' | 'mirror';
}

export interface ActiveRun {
    meta: LabRunMeta;
    raw: RawPreset;
    world: WorldState;
    deps: TickDeps;
    composeAnthology?: AnthologyComposer;
    transaction: TickFilesystemTransaction;
    seasonFrame?: SeasonFrame;
    provider?: string;
    model?: string;
    phase: LabRunPhase;
    lastError?: string;
    pendingTicks: number;
    /** 驅動端排的補算拍要帶的 `skippedBuckets`（見 driverTick）——單次性：下一次
     *  `appendTickRecord` 讀了就清。手動撥的拍恆為 undefined。 */
    pendingSkippedBuckets?: number;
    /** 折子 serialized job 排隊旗標——與 pendingTicks 同一條隊（loop() 的
     *  while 迴圈），絕不與拍或另一次折子並行。 */
    pendingInterlude: boolean;
    /** 折子環——最近幾折，供 live snapshot／UI 折子卡消費（newest last）。 */
    interludes: Array<Omit<LabInterludeLive, 'portraitUrl'>>;
    /** mirror 卷才有：MirrorClock 每次 `advance()` 實際取用的那個 `Date.now()`，
     *  由建構時注入的 `now` 包一層寫進來——tick 紀錄的 `realMs`／折子的
     *  `dateLabel` 都讀這裡，不再另外取樣牆鐘（同一次取樣，兩處一致）。 */
    mirrorSample?: { current?: number };
    /** mirror 卷才有：最近一次「已落拍」的真實毫秒（tick 紀錄的 `realMs` 或未
     *  打過拍時的 `epochRealMs`）——driver 拿它跟 `Date.now()` 比 bucket 序，
     *  不必每 45s 重讀 ticks.jsonl。 */
    lastTickRealMs?: number;
    /** Feed epoch — changes when the run is (re)opened in a process, so live
     *  clients know their beat cursor belongs to a different seq space. */
    epoch: string;
    /** Monotonic beat counter across the run's lifetime in this process. */
    beatSeq: number;
    beats: LabLiveBeat[];
    logs: Array<{ ts: number; line: string }>;
    eventsTotal: number;
    /** Serialization chain — every mutation queues behind the previous one. */
    busy: boolean;
}

function stateDirOf(runId: string): string {
    return path.join(runDir(runId), 'state');
}

function interludesFileOf(runId: string): string {
    return path.join(runDir(runId), 'interludes.jsonl');
}

function ticksFileOf(runId: string): string {
    return path.join(runDir(runId), 'ticks.jsonl');
}

function countLines(file: string): number {
    try {
        const text = fs.readFileSync(file, 'utf8');
        return text ? text.split('\n').filter(Boolean).length : 0;
    } catch {
        return 0;
    }
}

export class LabRunManager {
    private readonly active = new Map<string, ActiveRun>();
    /** 「活著」driver 的 per-run interval registry——process-wide、keyed by runId.
     *  Survives Next.js dev HMR the same way `active` does: both live on the
     *  `LabRunManager` instance the module-level `labManager()` singleton pins
     *  to `globalThis` (see bottom of file). */
    private readonly aliveTimers = new Map<string, ReturnType<typeof setInterval>>();

    /** Open (or return the already-open) run. Restores from snapshot when one
     *  exists, otherwise seeds a fresh world from the run's configured seed. */
    async open(runId: string): Promise<ActiveRun> {
        const existing = this.active.get(runId);
        if (existing) return existing;

        const meta = readRunMeta(runId);
        if (!meta) throw new Error(`run not found: ${runId}`);
        const cfg = meta.config;
        const out = runDir(runId);
        const stateDir = stateDirOf(runId);

        const transaction = new TickFilesystemTransaction(out);
        const recovered = transaction.recoverInterrupted();

        if (cfg.realEmbeddings && !process.env.OPENAI_API_KEY) {
            throw new Error('realEmbeddings requires OPENAI_API_KEY');
        }
        const recall = new LocalRecall(path.join(out, 'memory'), {
            embeddings: cfg.realEmbeddings ? 'auto' : 'deterministic',
        });
        const archive = new FileArchive(path.join(out, 'archive'));
        const timeMode: 'tick' | 'mirror' = cfg.timeMode === 'mirror' ? 'mirror' : 'tick';
        // mirror 卷的紀元錨點：正常路徑下由建卷 route 在 lab-run.json 就寫好了；
        // 這裡的 fallback 只防禦手改／殘缺的 meta——補一個並立刻落檔，往後每次
        // 開卷都讀同一個錨，紀元不會因為伺服器重啟而漂移。
        let epochRealMs: number | undefined;
        if (timeMode === 'mirror') {
            epochRealMs = meta.epochRealMs;
            if (epochRealMs == null) {
                epochRealMs = Date.now();
                meta.epochRealMs = epochRealMs;
                writeRunMeta(runId, meta);
            }
        }
        // MirrorClock 每次 advance() 取樣的真實毫秒寫進這個小盒子——tick 紀錄的
        // realMs／折子的 dateLabel 都讀它，同一次取樣兩處一致（見 ActiveRun 註解）。
        const mirrorSample: { current?: number } = {};
        const clock: ClockPort = timeMode === 'mirror'
            ? new MirrorClock({
                  epochRealMs: epochRealMs!,
                  cfg: SPRING_SNOW_MIRROR,
                  now: () => {
                      mirrorSample.current = Date.now();
                      return mirrorSample.current;
                  },
              })
            : new LocalClock();
        const economy = new LocalEconomy();

        let agent: SceneAgentPort;
        let composeAnthology: AnthologyComposer | undefined;
        let provider: string | undefined;
        let model: string | undefined;
        if (cfg.llm === 'real') {
            const llmConfig = loadLLMConfig();
            provider = resolveTextProvider(llmConfig) ?? undefined;
            if (!provider) throw new Error('real-LLM run needs a configured text provider (ZAI_API_KEY / POE_API_KEY / ANTHROPIC_API_KEY)');
            model = provider === 'poe'
                ? llmConfig.poeModelPrimary
                : provider === 'zai'
                    ? llmConfig.zaiModelPrimary
                    : llmConfig.anthropicModelPrimary;
            const { RunnerSceneAgent } = await import('@endless-story/engine/adapters/runner');
            const { SeasonEditorAgent } = await import('@endless-story/runner/services/storyteller-chapter');
            const editor = new SeasonEditorAgent();
            agent = new RunnerSceneAgent({
                sessionDir: path.join(out, 'sessions'),
                sessionKey: process.env.CHARACTER_SESSION_KEY,
            });
            composeAnthology = (plan, bundles) => editor.compose(plan, bundles);
        } else {
            agent = new FakeSceneAgent();
        }

        // Provenance manifest — same file, same rules as the engine CLI: a run
        // may never silently switch preset/season/provider mid-life.
        const manifestFile = path.join(out, 'run-manifest.json');
        const seasonFrame = cfg.seasonId
            ? loadSeasonFrameFile(cfg.seasonId, seasonDirFor(cfg.seasonSource ?? 'builtin'))
            : undefined;
        const manifest: RunManifest = {
            version: 1,
            preset: cfg.presetId,
            season: seasonFrame?.id,
            realLlm: cfg.llm === 'real',
            provider: provider ?? 'deterministic',
            model: model ?? 'fake',
            relationshipFallback: cfg.relationshipFallback,
            emergentProduction: cfg.emergentProduction ?? false,
            heartsCanFade: cfg.heartsCanFade ?? false,
            beatPicksWant: cfg.beatPicksWant ?? false,
            quietPresence: cfg.quietPresence ?? false,
            ...(cfg.deckId ? { deck: cfg.deckId } : {}),
            timeMode,
        };
        const previous = readJson<RunManifest>(manifestFile);
        if (previous) {
            for (const key of ['preset', 'season', 'realLlm', 'provider', 'model', 'relationshipFallback', 'emergentProduction', 'heartsCanFade', 'beatPicksWant', 'quietPresence', 'timeMode'] as const) {
                // 舊卷的 manifest 沒有 timeMode 這欄（喚醒層之前寫的）——缺席一律
                // 當 'tick'，與布林旗標的「缺席當 false」同一套回落，舊卷才不會
                // 因為加了這個新檢查就打不開。
                const prior = key === 'relationshipFallback' || key === 'emergentProduction' || key === 'heartsCanFade' || key === 'beatPicksWant' || key === 'quietPresence' ? (previous[key] ?? false)
                    : key === 'timeMode' ? (previous.timeMode ?? 'tick')
                    : previous[key];
                if (prior !== manifest[key]) {
                    // A run's manifest is frozen at creation so a diagnostic export never
                    // lies about which model/preset/flags wrote which tick. The usual
                    // trigger is changing POE_MODEL_PRIMARY (or a flag) then RE-OPENING an
                    // existing run — actionable copy beats a bare field name.
                    const hint = key === 'model' || key === 'provider'
                        ? `此卷建立時用的是 ${String(prior)}，現在的配置是 ${String(manifest[key])}。一卷不可中途換${key === 'model' ? '模型' : '供應商'}——換了請開「新卷」（新卷會從第一拍記錄新${key === 'model' ? '模型' : '供應商'}）；若確定要沿用此卷，手動改其 run-manifest.json 的 "${key}" 欄。`
                        : `此卷建立時 ${key}=${String(prior)}，現在的配置是 ${String(manifest[key])}。一卷的設定不可中途改——改了請開新卷。`;
                    throw new Error(`卷宗設定不符（${key}）：${hint}`);
                }
            }
        } else {
            writeJsonAtomic(manifestFile, manifest);
        }

        const raw = readSeedRaw(cfg.seedSource, cfg.presetId);

        let world: WorldState;
        let freshWorld = false;
        if (WorldState.exists(stateDir)) {
            world = WorldState.restore(stateDir);
            if (seasonFrame && !world.data.sagaPremise.includes(`【本季：${seasonFrame.title}】`)) {
                throw new Error(`restored world was not seeded with season ${seasonFrame.id}`);
            }
            if (seasonFrame && reconcileSeasonObjects(world, seasonFrame) > 0) world.snapshot(stateDir);
        } else {
            const created = await createWorldFromPreset(cfg.presetId, recall, {
                storiesDir: seedDirFor(cfg.seedSource),
                ticksPerDay: cfg.ticksPerDay,
            });
            world = created.world;
            // 鏡像時間：創世那一刻就該站在真實此刻，不是 tick 0 的假鐘面。
            // createWorldFromPreset 已用 makeClock(ticksPerDay,0) 佈了一個 tick 鐘，
            // mirror 卷在此覆寫成當下取樣（day 1 錨在 epochRealMs 自己）。
            if (timeMode === 'mirror') {
                world.data.clock = sampleMirrorClock(epochRealMs!, epochRealMs!, SPRING_SNOW_MIRROR, 0);
            }
            if (seasonFrame) applySeasonFrame(world, seasonFrame);
            if (cfg.relationshipFallback) {
                world.data.relationshipFallback = true;
                seedRelationshipViews(world, created.raw.relationship_views ?? []);
            }
            if (cfg.emergentProduction) world.data.emergentProduction = true;
            // 叩門/借賒/尋人 已畢業為常駐（引擎無條件常開，不再由設定翻旗標）。
            if (cfg.heartsCanFade) world.data.heartsCanFade = true;
            if (cfg.beatPicksWant) world.data.beatPicksWant = true;
            if (cfg.quietPresence) world.data.quietPresence = true;
            // 相識分寸: a season may declare subjective naming; seed the acquaintance
            // map AFTER cast/edges/views are seeded (so co-workers/edge-holders start
            // named). Mirrors how the flags above flip world.data.<flag> post-build.
            if (seasonFrame?.subjectiveNaming) {
                world.data.subjectiveNaming = true;
                seedAcquaintance(world);
            }
            // 劇本產出 — a season whose 命題 is the making of a play turns the layer
            // on itself, so a run config cannot forget what the season depends on.
            if (seasonFrame?.emergentProduction) world.data.emergentProduction = true;
            freshWorld = true;
        }
        // 事件牌組 (外力層) — validated at LOAD time so a malformed card fails before
        // the run opens, never mid-tick. Attaching is idempotent, so a resumed run
        // re-arms the same secrets without duplicating them.
        const deck = cfg.deckId ? loadEventDeckFile(cfg.deckId, deckDirFor(cfg.deckSource ?? 'builtin')) : undefined;
        if (deck) attachEventDeck(world, deck);
        // 追蹤開關 — resolved against the live cast; an unknown name fails loudly
        // rather than silently halving the run's POV output.
        if (cfg.trackedCharacterNames?.length) {
            world.data.trackedCharacterIds = cfg.trackedCharacterNames.map((name) => {
                const id = world.castById(name) ? name : world.idByName(name);
                if (!id) throw new Error(`追蹤名單裡沒有這個人：${name}（此卷可選：${world.data.cast.map((m) => m.name).join('、')}）`);
                return id;
            });
        }
        if (seasonFrame) writeJsonAtomic(path.join(out, 'season-frame.json'), seasonFrame);
        if (seasonFrame && freshWorld) {
            await seedSeasonOpening(world, seasonFrame, { agent, recall, archive });
            world.snapshot(stateDir);
        } else if (freshWorld) {
            world.snapshot(stateDir);
        }

        // mirror 卷的「上一拍取樣 realMs」——driver 拿它跟 Date.now() 比 bucket 序
        // （見 driverTick）；卷還沒打過拍就以紀元自己起算（AGENT_WAKE_LAYER 附錄 A）。
        const lastTick = timeMode === 'mirror' ? tailTickRecords(runId, 1)[0] : undefined;

        const run: ActiveRun = {
            meta,
            raw,
            world,
            deps: { agent, recall, archive, clock, economy, ...(deck ? { deck } : {}) },
            composeAnthology,
            transaction,
            seasonFrame,
            provider,
            model,
            phase: 'idle',
            pendingTicks: 0,
            pendingInterlude: false,
            interludes: [],
            ...(timeMode === 'mirror' ? { mirrorSample, lastTickRealMs: lastTick?.realMs ?? epochRealMs } : {}),
            epoch: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            beatSeq: 0,
            beats: [],
            logs: [],
            eventsTotal: countLines(ticksFileOf(runId)),
            busy: false,
        };
        if (recovered != null) this.log(run, `recovered interrupted tick ${recovered}; partial writes rolled back`);
        // Backfill the live ring from the last recorded ticks so a reopened run
        // is never a blank scroll while waiting for its next beat.
        for (const beat of beatsFromTickRecords(tailTickRecords(runId, 2))) this.pushBeat(run, beat);
        // 折子環同理回填——重開的卷不該讓折子卡空白等到下一折。
        for (const record of tailInterludeRecords(runId, INTERLUDE_RING_CAP)) this.pushInterlude(run, record);
        this.active.set(runId, run);
        this.persistStatus(run);
        return run;
    }

    get(runId: string): ActiveRun | undefined {
        return this.active.get(runId);
    }

    /** Detach a run from this process (its directory stays intact). */
    close(runId: string): void {
        const run = this.active.get(runId);
        if (run && run.phase === 'running') throw new Error('run is mid-tick — pause it first');
        this.active.delete(runId);
        this.disarmAlive(runId);
    }

    private disarmAlive(runId: string): void {
        const timer = this.aliveTimers.get(runId);
        if (!timer) return;
        clearInterval(timer);
        this.aliveTimers.delete(runId);
    }

    /**
     * Lazy 重臂——冪等：任何觸及一卷的請求（live poll、control，見 API 呼叫點）
     * 都呼叫這個。伺服器重啟後 registry 是空的，只要卷仍標記 `alive: true`，
     * 下一次有人碰到這一卷（開頁面即輪詢 live）就重新掛上 interval；卷不再
     * mirror 或 alive 已關，順手摘掉——兩個方向都自我修正，不需要另外的關卷通知。
     */
    armIfAlive(runId: string): void {
        const meta = readRunMeta(runId);
        const shouldRun = meta != null && meta.alive === true && meta.config.timeMode === 'mirror';
        if (!shouldRun) {
            this.disarmAlive(runId);
            return;
        }
        if (this.aliveTimers.has(runId)) return; // 已掛著，冪等
        const timer = setInterval(() => {
            void this.driverTick(runId);
        }, ALIVE_POLL_MS);
        timer.unref?.();
        this.aliveTimers.set(runId, timer);
    }

    /**
     * 「活著」driver 的一巡——大拍 due 就排一拍（跨多界仍一拍，記 skippedBuckets）、
     * 折子 due（佇列非空）就排一次折子 job；兩者都只 enqueue，走 loop() 既有的
     * 單一寫者隊，絕不在此直接寫世界。busy 中的卷本巡讓路，下一巡再看——
     * 「driver 只 enqueue，絕不並行執行」。
     */
    private async driverTick(runId: string): Promise<void> {
        let run: ActiveRun;
        try {
            run = await this.open(runId);
        } catch {
            // 卷開不起來了（多半是被焚毀）——沒有東西可巡，摘牌。
            this.disarmAlive(runId);
            return;
        }
        if (!run.meta.alive || run.meta.config.timeMode !== 'mirror') {
            this.disarmAlive(runId); // 設定在別處被改了（關「活著」／換卷模式不可能，但防禦）
            return;
        }
        if (run.busy) return; // 正在走著別的事——讓路，下一巡再看

        const nowMs = Date.now();
        const lastMs = run.lastTickRealMs ?? run.meta.epochRealMs ?? nowMs;
        const crossed = bucketsBetween(lastMs, nowMs, SPRING_SNOW_MIRROR);
        let queued = false;
        if (crossed > 0) {
            // 跨了幾個時辰邊界都只補一拍——嚴禁補演（AGENT_WAKE_LAYER §六之五）；
            // 跨了幾界只記進這一拍的 skippedBuckets，供 UI「歇了 N 拍」一行。
            run.pendingSkippedBuckets = crossed;
            run.pendingTicks += 1;
            queued = true;
        }
        if (run.world.data.pendingStimuli?.length) {
            run.pendingInterlude = true;
            queued = true;
        }
        if (queued) void this.loop(run);
    }

    /** Guard for fork/delete: the run directory must not be mid-tick. */
    assertIdle(runId: string): void {
        const run = this.active.get(runId);
        if (run && run.phase === 'running') throw new Error('run is mid-tick — pause and wait for the current tick');
    }

    private log(run: ActiveRun, line: string): void {
        run.logs.push({ ts: Date.now(), line });
        if (run.logs.length > LOG_RING_CAP) run.logs.splice(0, run.logs.length - LOG_RING_CAP);
        // Durable tee — beyond the in-memory ring, append every line to
        // <runDir>/engine-log.txt so the full mechanic trace ([食]/[濟]/[門]/
        // movement/[economy-audit]/[fatal]…) survives the cap AND a restart, and
        // stays exportable for a cold run. The engine emits a `── tick N · day D
        // · part ──` header each tick, so raw append preserves tick grouping.
        // Best-effort: a failed tee must never break the run.
        try {
            fs.appendFileSync(path.join(runDir(run.meta.id), 'engine-log.txt'), `${line}\n`, 'utf8');
        } catch {
            // logging must never throw
        }
    }

    private pushBeat(run: ActiveRun, beat: Omit<LabLiveBeat, 'seq' | 'ts'>): void {
        run.beatSeq += 1;
        run.beats.push({ ...beat, seq: run.beatSeq, ts: Date.now() });
        if (run.beats.length > BEAT_RING_CAP) run.beats.splice(0, run.beats.length - BEAT_RING_CAP);
    }

    private pushInterlude(run: ActiveRun, record: InterludeRecord): void {
        run.interludes.push({
            id: record.id,
            characterId: record.characterId,
            name: record.name,
            day: record.day,
            tick: record.tick,
            partOfDay: record.partOfDay,
            realMs: record.realMs,
            stimuli: record.stimuli.map((s) => ({ text: s.text, kind: s.kind })),
            response: record.response,
            ...(record.memoryNote ? { memoryNote: record.memoryNote } : {}),
        });
        if (run.interludes.length > INTERLUDE_RING_CAP) run.interludes.splice(0, run.interludes.length - INTERLUDE_RING_CAP);
    }

    private persistStatus(run: ActiveRun): void {
        const c = run.world.data.clock;
        writeRunStatus(run.meta.id, {
            day: c.day,
            tick: c.currentTick,
            partOfDay: c.partOfDay,
            liveWants: run.world.data.wants.filter((w) => !w.retired).length,
            castCount: run.world.data.cast.length,
            sceneCount: run.world.data.scenes.length,
            eventsTotal: run.eventsTotal,
            updatedAt: new Date().toISOString(),
        });
    }

    private appendTickRecord(run: ActiveRun, report: TickReport, mirrorRealMs?: number): void {
        const record: LabTickRecord = {
            day: report.day,
            tick: report.tick,
            partOfDay: report.partOfDay,
            night: report.night,
            scenesPlayed: report.scenesPlayed,
            beats: report.beats,
            resolved: report.resolved,
            liveWants: report.liveWants,
            wove: report.wove,
            episode: report.episode,
            routed: report.routed,
            events: report.events.map((event) => ({
                id: event.id,
                sceneId: event.sceneId,
                sceneName: event.sceneName,
                visibility: event.visibility,
                witnessIds: event.witnessIds,
                beats: event.beats.map((beat) => ({
                    characterId: beat.characterId,
                    name: beat.name,
                    text: beat.text,
                    inner: beat.inner,
                    addressed: beat.addressed,
                    audience: beat.audience,
                    perceiverIds: beat.perceiverIds,
                })),
            })),
            eventPovs: report.eventPovs,
            economyNotices: report.economyNotices,
            // 宏觀節奏 — every field is written only when the tick produced it, so a
            // run with no deck / no tracking / no artifacts keeps its old line shape.
            ...(report.vitals
                ? {
                      vitals: {
                          irreversible: report.vitals.irreversible,
                          wantsResolved: report.vitals.wantsResolved,
                          wantsLive: report.vitals.wantsLive,
                          resolvedRate: report.vitals.resolvedRate,
                          resolvedThisTick: report.vitals.resolvedThisTick,
                          sceneEntropy: report.vitals.sceneEntropy,
                          sceneCrowdPeak: report.vitals.sceneCrowdPeak,
                          convergence: report.vitals.convergence,
                          loops: report.vitals.loops,
                          actorCount: report.vitals.actorCount,
                      },
                  }
                : {}),
            ...(report.cardsPlayed?.length ? { cardsPlayed: report.cardsPlayed } : {}),
            ...(report.proposalsRefused?.length ? { proposalsRefused: report.proposalsRefused } : {}),
            ...(report.artifacts?.length
                ? {
                      artifacts: report.artifacts.map((artifact) => ({
                          kind: artifact.kind,
                          id: artifact.id,
                          characterId: artifact.characterId,
                          name: artifact.name,
                          day: artifact.day,
                          body: artifact.body,
                          ...(artifact.kind === 'diary'
                              ? {
                                    supportedClaims: artifact.claims.length,
                                    unsupportedClaims: artifact.unsupportedClaims.length,
                                }
                              : { occasion: artifact.occasion }),
                      })),
                  }
                : {}),
            ...(report.povTrackedIds?.length ? { povTrackedIds: report.povTrackedIds } : {}),
            ...(report.backgroundNeeds?.length ? { backgroundNeeds: report.backgroundNeeds } : {}),
            // mirror 卷專屬——這一拍在真實時間裡的落點＋由它推得的敘事日期標籤，
            // 重播讀這裡記下的值，不再取樣牆鐘（錄時重播紀律，見 interlude.ts 的
            // 同一套規矩）。tick 卷／mirror 卷還沒有任何取樣時，兩欄都不寫。
            ...(mirrorRealMs != null
                ? { realMs: mirrorRealMs, dateLabel: formatStoryDate(storyNow(mirrorRealMs, SPRING_SNOW_MIRROR).date) }
                : {}),
            // 「活著」driver 排的補算拍才有——單次性欄位，讀完即清（見下）。
            ...(run.pendingSkippedBuckets != null ? { skippedBuckets: run.pendingSkippedBuckets } : {}),
            finishedAt: new Date().toISOString(),
        };
        if (mirrorRealMs != null) run.lastTickRealMs = mirrorRealMs;
        run.pendingSkippedBuckets = undefined;
        fs.appendFileSync(ticksFileOf(run.meta.id), `${JSON.stringify(record)}\n`, 'utf8');
        run.eventsTotal += report.events.length;
    }

    /**
     * 折子 serialized job——與拍共用 loop() 的單一寫者隊（見下）：載入的世界即
     * `run.world`（已在記憶體中，同一個引用），跑完把有成局的折子落 world.json
     * ＋ append 進 `interludes.jsonl`（新檔，一行一折）＋推進折子環供 live snapshot。
     * 沒有一折成局（全部未滿齡／超預算／座席缺席）就什麼都不寫——避免每 45s
     * 巡一次都白產生一份 snapshot。
     */
    private async runInterludeBatch(run: ActiveRun, stateDir: string): Promise<void> {
        const iCfg = run.meta.config.interlude;
        // 折子落款在「此刻」，不是上一拍的舊取樣——與 nowMs 用同一個真實毫秒，
        // 折子紀錄的 realMs 與這裡顯示的 dateLabel 才是同一件事的兩種寫法。
        const nowMs = Date.now();
        const dateLabel = run.meta.config.timeMode === 'mirror'
            ? formatStoryDate(storyNow(nowMs, SPRING_SNOW_MIRROR).date)
            : undefined;
        let records: InterludeRecord[];
        try {
            records = await runInterludes(run.world, { agent: run.deps.agent, recall: run.deps.recall }, {
                nowMs,
                debounceMs: iCfg?.debounceMs,
                dailyBudget: iCfg?.dailyBudget,
                ...(dateLabel ? { dateLabel } : {}),
            });
        } catch (error) {
            // 折子失手不是刺激的錯——原封留在佇列，下一次巡（driver 或另一次戳）再試。
            this.log(run, `[interlude] 折子演繹失手：${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        if (!records.length) return;
        run.world.snapshot(stateDir);
        const file = interludesFileOf(run.meta.id);
        for (const record of records) {
            fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
            this.pushInterlude(run, record);
            this.log(run, `[interlude] ${record.name}：「${record.response.slice(0, 40)}」`);
        }
    }

    /** Queue N ticks. Returns immediately; the loop runs in-process. */
    async requestTicks(runId: string, count: number): Promise<void> {
        const run = await this.open(runId);
        const n = Math.max(0, Math.floor(count));
        if (n === 0) return;
        run.pendingTicks += n;
        run.lastError = undefined;
        if (run.phase !== 'running') void this.loop(run);
    }

    pause(runId: string): void {
        const run = this.active.get(runId);
        if (run) run.pendingTicks = 0;
    }

    private async loop(run: ActiveRun): Promise<void> {
        if (run.busy) return;
        run.busy = true;
        run.phase = 'running';
        const out = runDir(run.meta.id);
        const stateDir = stateDirOf(run.meta.id);
        try {
            // 折子與拍同一條隊：pendingInterlude 優先處理（通常很快，一兩個 LLM
            // 呼叫），處理完才繼續走 pendingTicks——兩者互斥，這個 while 本身就是
            // AGENT_WAKE_LAYER §五「一個世界任何時刻至多一個演繹在寫」的落實。
            while (run.pendingTicks > 0 || run.pendingInterlude) {
                if (run.pendingInterlude) {
                    run.pendingInterlude = false;
                    await this.runInterludeBatch(run, stateDir);
                    continue;
                }
                const tick = run.world.data.clock.currentTick;
                // 這一拍的 report 描述的是「走這一拍之前」那個 w.clock（day/tickOfDay
                // 皆取自它，見 tick.ts 的 `today = c.day`）——它是被「上一拍的
                // advance() 呼叫」（或創世那一次 sampleMirrorClock）取樣出來的，
                // 不是本次 runTick 內部即將發生的那次 advance()。所以要在呼叫
                // runTick、讓 mirrorSample.current 被下一次取樣蓋掉之前，先把它
                // 讀出來——這才是「這一拍」在真實時間裡的落點。
                // Fallback chain matters across a process restart: a freshly
                // reopened run's `mirrorSample.current` starts empty (this
                // process has never called advance() yet) even though the
                // world's `c` was sampled long ago — `lastTickRealMs` (seeded
                // from the last tick record, or the epoch for a virgin world)
                // is the correct stand-in, NOT the epoch directly.
                const mirrorRealMsForThisTick = run.meta.config.timeMode === 'mirror'
                    ? (run.mirrorSample?.current ?? run.lastTickRealMs ?? run.meta.epochRealMs)
                    : undefined;
                // Captured before appendTickRecord consumes+clears the field below —
                // used to preface the beat stream with a 「歇了 N 拍」note so a
                // catch-up tick reads as catch-up, not as an ordinary beat.
                const skippedBucketsForThisTick = run.pendingSkippedBuckets;
                if (skippedBucketsForThisTick) {
                    // 卡片前一行「歇了 N 拍」——落在這一拍自己的 onBeat／onMoves 之前
                    // （這裡先推，runTick 的回呼稍後才觸發），讀起來像補算拍的引子，
                    // 不是它的一部分。純顯示用；不落 ticks.jsonl（那邊已有 skippedBuckets
                    // 欄位可查），過程式的、不持久，重開卷即消失也無妨。
                    const c = run.world.data.clock;
                    this.pushBeat(run, {
                        day: c.day,
                        tick: c.currentTick,
                        clock: c.partOfDay,
                        sceneId: '',
                        sceneName: '歇拍',
                        isPrivate: false,
                        characterId: '__world__',
                        name: '世界',
                        text: `班子歇了 ${skippedBucketsForThisTick} 拍，此刻再開鑼。`,
                        kind: 'world',
                    });
                }
                run.transaction.begin(tick);
                let report: TickReport;
                try {
                    report = await runTick(run.world, run.deps, {
                        snapshotDir: stateDir,
                        log: (line) => this.log(run, line),
                        // 移步進拍流 —— fired as the movement phase closes, BEFORE any
                        // scene beat plays, so 行蹤 lands in true chronological order
                        // (a character's move precedes the beats it leads to). The
                        // engine hands us each committed transition; we only replay it.
                        onMoves: (moves) => {
                            for (const m of moves) {
                                this.pushBeat(run, {
                                    day: m.day,
                                    tick: m.tick,
                                    clock: m.clock,
                                    sceneId: m.toSceneId,
                                    sceneName: m.toSceneName,
                                    isPrivate: false,
                                    characterId: m.characterId,
                                    name: m.name,
                                    text: `自${m.fromSceneName}移步${m.toSceneName}`,
                                    kind: 'move',
                                });
                            }
                        },
                        onBeat: (observation) => {
                            const acts = humanizeBeatActs(run.world, observation.beat);
                            this.pushBeat(run, {
                                day: observation.day,
                                tick: observation.tick,
                                clock: observation.clock,
                                sceneId: observation.sceneId,
                                sceneName: observation.sceneName,
                                isPrivate: observation.isPrivate,
                                characterId: observation.beat.characterId,
                                name: observation.beat.name,
                                text: observation.beat.text,
                                inner: observation.beat.inner || undefined,
                                kind: 'beat',
                                acts: acts.length ? acts : undefined,
                            });
                        },
                    });
                    run.transaction.commit();
                } catch (error) {
                    run.transaction.rollback();
                    throw error;
                }
                // 天時（世界事件）與祈願（角色對神明說出口的話）進拍流：兩者都經
                // events 提交、未走 onBeat，故在此顯性化。世界旁白＝world；祈願是
                // 角色親口的一拍＝beat（角色 id/名，非 __world__）。
                for (const event of report.events) {
                    const isPrayer = event.id.includes(':prayer:');
                    for (const beat of event.beats) {
                        const isWorld = beat.characterId === '__world__';
                        if (!isWorld && !isPrayer) continue;
                        this.pushBeat(run, {
                            day: report.day,
                            tick: report.tick,
                            clock: event.clock,
                            sceneId: event.sceneId,
                            sceneName: event.sceneName,
                            isPrivate: event.visibility === 'private',
                            characterId: beat.characterId,
                            name: beat.name,
                            text: beat.text,
                            kind: isWorld ? 'world' : 'beat',
                        });
                    }
                }
                run.pendingTicks -= 1;
                this.appendTickRecord(run, report, mirrorRealMsForThisTick);
                // 時光快照 — freeze the just-committed world as this tick's
                // checkpoint so 演員訪談室 can visit "the character right after
                // tick N" later. Best-effort: a failed copy logs, never fatals.
                {
                    const checkpointError = writeCheckpoint(run.meta.id, report.tick);
                    if (checkpointError) this.log(run, `[checkpoint] tick ${report.tick} 快照失敗：${checkpointError}`);
                }
                // Post-processing mirrors the CLI: never fatal after the world
                // snapshot committed — record and continue.
                try {
                    const curator = run.meta.config.llm === 'real' ? run.deps.agent : undefined;
                    await writeTickDossiers(out, report, run.world.data.cast, curator);
                } catch (error) {
                    this.recordPostprocessFailure(out, 'dossier', report.tick, error);
                }
                try {
                    const audit = auditSeasonEconomy(run.world);
                    for (const line of audit) this.log(run, `[economy-audit] ${line}`);
                    await refreshSeasonEditorial(out, run.composeAnthology, audit);
                } catch (error) {
                    this.recordPostprocessFailure(out, 'season-editorial', report.tick, error);
                }
                this.persistStatus(run);
            }
            run.phase = 'idle';
        } catch (error) {
            run.phase = 'error';
            run.pendingTicks = 0;
            run.pendingInterlude = false;
            // 這一拍沒能落 appendTickRecord，該欄位還沒被消化——別讓它漂到未來
            // 某一拍不相干的紀錄上。
            run.pendingSkippedBuckets = undefined;
            run.lastError = error instanceof Error ? error.message : String(error);
            this.log(run, `[fatal] ${run.lastError}`);
        } finally {
            run.busy = false;
            this.persistStatus(run);
        }
    }

    private recordPostprocessFailure(outDir: string, stage: string, tick: number, error: unknown): void {
        const dir = path.join(outDir, 'postprocess-failures');
        fs.mkdirSync(dir, { recursive: true });
        const message = error instanceof Error ? error.message : String(error);
        fs.writeFileSync(path.join(dir, `tick-${tick}-${stage}.json`), `${JSON.stringify({ stage, tick, message }, null, 2)}\n`, 'utf8');
    }

    /** Beats after `afterSeq` — the live feed contract. */
    beatsSince(runId: string, afterSeq: number): LabLiveBeat[] {
        const run = this.active.get(runId);
        if (!run) return [];
        return run.beats.filter((b) => b.seq > afterSeq);
    }
}

const globalRef = globalThis as typeof globalThis & { __esCinemaLabManager?: LabRunManager };

/** Process-wide singleton (survives Next.js dev HMR module reloads). */
export function labManager(): LabRunManager {
    return (globalRef.__esCinemaLabManager ??= new LabRunManager());
}
