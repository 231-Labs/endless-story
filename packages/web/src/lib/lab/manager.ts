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
    TickFilesystemTransaction,
    WorldState,
    applySeasonFrame,
    attachEventDeck,
    createWorldFromPreset,
    loadEventDeckFile,
    loadSeasonFrameFile,
    reconcileSeasonObjects,
    runTick,
    seedAcquaintance,
    seedRelationshipViews,
    seedSeasonOpening,
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
import { beatsFromTickRecords, tailTickRecords } from './artifacts';
import { writeCheckpoint } from './checkpoints';
import { readJson, runDir, writeJsonAtomic } from './paths';
import { readRunMeta, writeRunStatus } from './store';
import { deckDirFor, readSeedRaw, seasonDirFor, seedDirFor } from './seeds';
import type { LabLiveBeat, LabRunMeta, LabRunPhase, LabTickRecord } from './types';

const BEAT_RING_CAP = 600;
const LOG_RING_CAP = 300;

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
        const clock = new LocalClock();
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
        };
        const previous = readJson<RunManifest>(manifestFile);
        if (previous) {
            for (const key of ['preset', 'season', 'realLlm', 'provider', 'model', 'relationshipFallback', 'emergentProduction', 'heartsCanFade', 'beatPicksWant', 'quietPresence'] as const) {
                const prior = key === 'relationshipFallback' || key === 'emergentProduction' || key === 'heartsCanFade' || key === 'beatPicksWant' || key === 'quietPresence' ? (previous[key] ?? false) : previous[key];
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

    private appendTickRecord(run: ActiveRun, report: TickReport): void {
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
            finishedAt: new Date().toISOString(),
        };
        fs.appendFileSync(ticksFileOf(run.meta.id), `${JSON.stringify(record)}\n`, 'utf8');
        run.eventsTotal += report.events.length;
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
            while (run.pendingTicks > 0) {
                const tick = run.world.data.clock.currentTick;
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
                this.appendTickRecord(run, report);
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
