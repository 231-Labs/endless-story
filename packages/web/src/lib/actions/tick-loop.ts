'use server';

/**
 * N4 — autonomous tick loop (docs/narrative/NARRATIVE_AGENTS.md §6): one call runs
 * ADVANCE → PLAN → MOVE → DRAMA → SOCIAL → ACT → PRODUCE → REFLECT → NARRATE.
 * Sequential throughout — one admin keypair can't sign in parallel without
 * object-version conflicts on the shared StorytellerCap. Dry-run produces POV
 * prose only; chain-mutating steps are skipped.
 */

import { Transaction } from '@mysten/sui/transactions';
import type { Character, ChapterProvenance } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { getAdminContext, withAdminLock, execAdminTx } from '@/lib/chain/admin-signer';
import { ensureEventStoreRegistered } from '@/lib/server/event-store';
import { runPovForCharacter, anchorPovChaptersBatch, anchorPovChapter, LIFE_QUERY } from '@/lib/chain/pov-core';
import { pickEncounterPair, buildEncounterTrigger, buildConfessTrigger } from './tick-phases/encounter';
import { characterAgent, sceneRecord, characterWorker as runnerWorker, eventChapter as runnerEventChapter, signAndAnchor } from '@endless-story/runner';
import { evolveRelationshipsFromScene } from '@/lib/chain/relationship-evolve';
import { collectBondPairs, seedBondTies } from './tick-phases/bond';
import { dumpChapter } from '@/lib/chain/chapter-dump';
import { deriveAndCommitDramaBeat, tensionFraction, readResourceLedger } from '@/lib/chain/drama';
import { recordSceneLine, getRecentSceneLines } from '@/lib/chain/scene-lines';
import { computeGravityTargets } from '@/lib/chain/rival-gravity';
import { computeSpatialRouting } from '@/lib/chain/spatial-routing';
import { fetchWarmGraph, fetchCastTies } from '@/lib/chain/relationship-evolve';
import { tickResourceCooldowns } from '@/lib/chain/gravity-core';
import { drainMemoryWarnings, recallForCharacter } from '@/lib/chain/memory';
import { fetchOnChainScenesForSaga } from '@/lib/chain/scene-read';
import { buildSagaRoster, type SagaRosterEntry } from '@/lib/chain/roster';
import { getCharacterSecret } from '@/lib/chain/character-secrets';
import { charactersApi } from '@/lib/api/index';
import { advanceTickAction, getWorldTimeSnapshot } from './world-time';
import { isShadowDead } from '@/lib/economy/saga-economy';
import { runSleepAction } from './sleep';
import { runPlanAction } from './plan';
import { buildTickSituations, stashTickResolved } from './tick-phases/perceive';
import { selectContention, pushRecentTemplate, framingForStatement } from '@/lib/chain/event-planner';
import { selectContentionByCentrality } from '@/lib/chain/centrality-select';
import { openArcIfNeeded, stepArc, currentArc } from '@/lib/chain/arc-lifecycle';
import { forcingLevel, pressureAwareness } from '@/lib/chain/arc-pressure';
import { frameIncident } from './event-framing';
import { proposeResourceAction } from './propose-resources';
import { coupleAttention, neglectHintFor } from '@/lib/chain/attention-core';
import { applyActorFatigue, bumpActorFatigue, decayActorFatigue, type FatigueLedger } from '@/lib/chain/actor-fatigue';
import { installNarrativeProfile } from '@/lib/chain/narrative-profile';
import { applyRipples, applyDreamStirToWants, decayWants, fadeStaleWants, jealousNightPursuit, yearningNightPursuit, newWant, nightSceneKind } from '@/lib/chain/want-core';
import { loadWants, saveWants, drainWantDreamStirs } from '@/lib/chain/want-store';
import { recordSceneRating, type SceneRating } from '@/lib/chain/scene-rating-store';
import { hasMomentToday, momentKey, recordMoment } from '@/lib/chain/moment-ledger';
import { recordSceneTruth } from '@/lib/chain/scene-truth';
import { ensureHomesSeeded } from '@/lib/chain/home-seed';
import { getHomeScene, getWorkScene } from '@/lib/chain/spatial-routing';
import { loadBible } from '@/lib/chain/story-bible-store';
import { runSceneLoop } from '@/lib/chain/scene-loop';
import { buildAxisCandidates, type SpineStep } from '@/lib/chain/spine-core';
import {
    spineClockTick,
    spineMemorySnapshot,
    reconcileOpenFromChain,
    spinePlanAndOpen,
    spinePlanAndOpenAll,
    spineAccumulatePovs,
    spineResolveAndWeave,
    type SpineCtx,
} from './event-spine';
import { compileGazetteAction } from './compile-gazette';
import { compileEventChapterAction } from './compile-event-chapter';
import { generateEventMomentAction } from './generate-event-moment';
import type {
    TickLoopInput,
    TickActResult,
    TickPovResult,
    TickPlanResult,
    TickResolveResult,
    TickMoveResult,
    TickSocialResult,
    TickAskResult,
    TickGiveResult,
    TickSettleResult,
    TickSleepResult,
    TickGazetteResult,
    TickDramaResult,
    TickStoryletResult,
    TickLoopResult,
} from './tick-loop-types';

// Re-exported so existing consumers keep importing from here.
export type {
    TickLoopInput,
    TickActResult,
    TickPovResult,
    TickPlanResult,
    TickResolveResult,
    TickMoveResult,
    TickSocialResult,
    TickAskResult,
    TickGiveResult,
    TickSettleResult,
    TickSleepResult,
    TickGazetteResult,
    TickDramaResult,
    TickStoryletResult,
    TickLoopResult,
} from './tick-loop-types';

import {
    RECALL_CONCURRENCY,
    normalizeCharacterIds,
    TickMemoryContext,
    buildRosterContextById,
    publicTagsWithRole,
    mapPool,
} from './tick-phases/support';
import {
    runMovePhase,
    applyMoveResultsToScenes,
    applyMoveResultsToRoster,
} from './tick-phases/move';
import { runSocialPhase } from './tick-phases/social';
import { runAskPhase } from './tick-phases/ask';
import { runGivePhase } from './tick-phases/give';
import { runSettlePhase } from './tick-phases/settle';
import { runActPhase, cardActionPhrase } from './tick-phases/act';

/** Recent-topic history per saga (process-level): anti-repeat so the world
 *  rotates contentions instead of locking on one. */
const recentTopicsBySaga = new Map<string, string[]>();

/** §2.51 actor-fatigue ledgers per saga: tired rows are suppressed at SELECTION
 *  so the spotlight rotates. */
const actorFatigueBySaga = new Map<string, FatigueLedger>();

/** Day accumulator for the episode weaver: clock markers + beat lines + actors
 *  (process-level; a restart drops part of one day's material, acceptable). */
const episodeDayBySaga = new Map<string, { lines: string[]; actorIds: Set<string>; sceneIds: string[]; povByName: Map<string, string> }>();

/** Last narrated event per character (process-local). While an event stays open,
 *  a character with no new beat must not re-write the same scene every tick. */
const lastPovEventByChar = new Map<string, string>();

/** Encounter cooldown (process-local): never fire the SAME pair on consecutive ticks. */
let lastEncounterPair: string | undefined;
/** Pairs past the confess milestone — don't re-confess every tick. */
const confessedPairs = new Set<string>();
/** A romance tie must accrue past a single seed before a confession can fire. */
const CONFESS_MIN_TIES = 2;

function envFlag(name: string): boolean {
    const v = (process.env[name] ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

// Owned-cap background jobs run INLINE, not in after(): inside the /api/tick
// mutex's detached promise chain Next's after() never fires (resolve/cut/still
// were silently dropped). Each inline job races a timeout so a hung call can't
// wedge the tick and, via the mutex, the whole loop.
const MOMENT_JOB_TIMEOUT_MS = Math.max(10_000, Number(process.env.ES_MOMENT_JOB_TIMEOUT_MS) || 90_000);
const CUT_JOB_TIMEOUT_MS = Math.max(10_000, Number(process.env.ES_CUT_JOB_TIMEOUT_MS) || 180_000);

/** Run a job to completion or abandon it after `ms`. Failures and timeouts go to
 *  `onError` and never throw to the caller; an abandoned job may still settle
 *  later with no awaiter (acceptable — a wedged job must not stall the loop). */
async function runJobWithTimeout(
    job: () => Promise<void>,
    ms: number,
    label: string,
    onError: (err: unknown) => void,
): Promise<void> {
    const guarded = job().catch(onError);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
            onError(new Error(`${label} timed out after ${ms}ms`));
            resolve();
        }, ms);
    });
    try {
        await Promise.race([guarded, timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

// Minimal TTY-gated ANSI (off when piped/redirected or NO_COLOR set).
const TLOG_COLOR = Boolean(process.stdout.isTTY) && process.env.NO_COLOR == null;
const clr = {
    dim: (s: string | number): string => (TLOG_COLOR ? `\x1b[2m${s}\x1b[0m` : String(s)),
};

export async function runTickLoopAction(input: TickLoopInput = {}): Promise<TickLoopResult> {
    // Register the durable event store on the first tick (gated on DATABASE_URL;
    // no-op without it). Both tick paths run through here: the admin
    // SchedulerPanel server action and the headless /api/tick route.
    await ensureEventStoreRegistered();
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return {
            ok: false,
            advanced: false,
            plans: [],
            moves: [],
            socials: [],
            asks: [],
            gives: [],
            acts: [],
            resolves: [],
            povs: [],
            sleeps: [],
            error: 'saga 尚未種子化',
        };
    }
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            advanced: false,
            plans: [],
            moves: [],
            socials: [],
            asks: [],
            gives: [],
            acts: [],
            resolves: [],
            povs: [],
            sleeps: [],
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    const dryRun = input.dryRun ?? false;
    // Flags resolve as: explicit input > TICK_* env default > built-in default.
    // Core engine (spine + director scarcity + perception) defaults ON; dry-run
    // still bypasses spine. parallelEvents stays opt-in (default = one spine event).
    const eventSpine = (input.eventSpine ?? !envFlag('TICK_EVENT_SPINE_OFF')) && !dryRun;
    const parallelEvents = (input.parallelEvents ?? envFlag('TICK_PARALLEL_EVENTS')) && !dryRun;
    const attentionBudget = input.attentionBudget ?? envFlag('TICK_ATTENTION_BUDGET');
    const llmFraming = input.llmFraming ?? envFlag('TICK_LLM_FRAMING');
    const directorResources = input.directorResources ?? !envFlag('TICK_DIRECTOR_RESOURCES_OFF');
    const rivalGravity = input.rivalGravity ?? envFlag('TICK_RIVAL_GRAVITY');
    // §4d.1: pick the staged contention by centrality, not urgency; falls back to
    // the deterministic tension-sort on failure. Default off.
    const centrality = input.centrality ?? envFlag('TICK_CENTRALITY');
    // §2.51: spotlight rotation, selection-only (settlement reads raw rows). Default off.
    const actorFatigue = input.actorFatigue ?? envFlag('TICK_ACTOR_FATIGUE');
    // Want-driven per-scene interaction loops as the narrative driver (§2.36–2.48);
    // contested resources keep only the economic settlement lane. Default off.
    const wantEngine = input.wantEngine ?? envFlag('TICK_WANT_ENGINE');
    // §4d.2: arc convergence state machine (off-chain arc state). Default off.
    const arcConvergence = input.arcConvergence ?? envFlag('TICK_ARC_CONVERGENCE');
    // Contest experiment: the "檯面上的爭奪" overlay (stake list fed to genesis,
    // 執念補判 affinity backfill, director scarcity proposals) is what frames
    // every want as slot-positioning and reads as 心機. OFF = characters pursue
    // only intrinsic wants (情/債/手藝/日常); the economic settlement lane is
    // untouched. Default ON (overlay lives); set TICK_RESOURCE_CONTEST_OFF to test.
    const resourceContest = !envFlag('TICK_RESOURCE_CONTEST_OFF');
    const maxConcurrentEvents = Math.max(
        1,
        input.maxConcurrentEvents ?? (Number(process.env.TICK_MAX_CONCURRENT_EVENTS) || 2),
    );
    const spineMode = eventSpine || parallelEvents;
    drainMemoryWarnings(); // discard stale warnings from previous requests
    const memoryContext = new TickMemoryContext();
    const cap = input.maxCharacters ?? (Number(process.env.TICK_MAX_CHARACTERS) || 6);
    const requestedIds = normalizeCharacterIds(input.characterIds);
    const t0 = Date.now();
    const since = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
    const tlog = (m: string) => console.log(`${clr.dim(`[tick ${since()}]`)} ${m}`);
    tlog(`◆ tick begins${dryRun ? ' (dry-run)' : ''}`);

    // 0. NARRATIVE PROFILE — install preset content into the engine seams.
    const narrativeProfile = await installNarrativeProfile().catch(() => null);

    // 1. ADVANCE (chain mutation — skipped on dry-run).
    let advanced = false;
    if ((input.advance ?? true) && !dryRun) {
        const adv = await advanceTickAction();
        advanced = adv.ok;
    }
    const worldTime = (await getWorldTimeSnapshot()) ?? undefined;
    const dayLabel = worldTime ? `第 ${worldTime.day} 日 · ${worldTime.partOfDay}` : '某日';
    tlog(`⏱  ${advanced ? 'advanced → ' : ''}Day ${worldTime?.day ?? '?'} · ${worldTime?.partOfDay ?? '—'}`);
    // isNight must match the Chinese dusk/night labels too — a plain
    // `partOfDay === 'night'` check silently disabled sleep and the spatial router.
    const isNight = !!worldTime && (worldTime.partOfDay === 'night' || /夜|宵/.test(worldTime.partOfDay ?? ''));
    // §2.19 daily-life state: derived fatigue curve (fresh at dawn → tired by
    // night), recomputed each tick with no storage. Hoisted above PLAN so both
    // the want-engine scene loop and POV share the same derivation.
    const dayFatigue = worldTime
        ? 0.15 + (worldTime.ticksPerDay > 1 ? worldTime.tickOfDay / (worldTime.ticksPerDay - 1) : 0.5) * 0.7
        : 0.3;

    let characters: Character[] = await charactersApi.listSagaCharacters(d.sagaId).catch(() => []);
    if (characters.length === 0) {
        characters = await charactersApi.listCharacters().catch(() => []);
    }
    if (requestedIds.length > 0) {
        const byId = new Map(characters.map((c) => [c.id, c]));
        const missing = requestedIds.filter((id) => !byId.has(id));
        if (missing.length > 0) {
            const fetched = await Promise.all(
                missing.map((id) => charactersApi.getCharacter(id).catch(() => null)),
            );
            for (const c of fetched) {
                if (c && !byId.has(c.id)) {
                    characters.push(c);
                    byId.set(c.id, c);
                }
            }
        }
    }
    const nameById = new Map(characters.map((c) => [c.id, c.name]));
    // Innate world attrs for the skill-weighted resource contest (spine settlement).
    const attrsById = new Map(characters.map((c) => [c.id, c.attributes]));
    // Economy-shadow deaths retire characters from the acting set (persisted state kept for settle).
    const alive = characters.filter((c) => !isShadowDead(d.sagaId, c.id));
    // Rotate the acting window by world tick — a fixed slice(0, cap) would star
    // the same N characters forever.
    const rotated = (() => {
        if (alive.length <= cap) return alive;
        const start = ((worldTime?.currentTick ?? 0) * cap) % alive.length;
        return [...alive.slice(start), ...alive.slice(0, start)];
    })();
    const slice =
        requestedIds.length > 0
            ? requestedIds
                  .map((id) => alive.find((c) => c.id === id))
                  .filter((c): c is Character => Boolean(c))
                  .slice(0, cap)
            : rotated.slice(0, cap);
    const scenes = await fetchOnChainScenesForSaga(d.sagaId).catch(() => []);
    const roster = await buildSagaRoster(d.sagaId, { characters, scenes }).catch(
        () => [] as SagaRosterEntry[],
    );
    let activeScenes = scenes;
    let activeRoster = roster;
    let rosterById = new Map(activeRoster.map((r) => [r.id, r]));
    let roleById = new Map(activeRoster.map((r) => [r.id, r.role || '—']));
    let rosterContextById = buildRosterContextById(slice, activeRoster);
    tlog(`cast on stage: ${slice.length} — ${slice.map((c) => c.name).join(', ')}`);

    // 1.5 PERCEIVE — each acting character's objective situation (co-presence,
    //     contested stakes, fresh resolutions) so PLAN isn't blind to this tick.
    //     Scoped + omniscience-guarded (perceive-core); never blocks on failure.
    const situationPerceive = input.situationPerceive ?? process.env.ES_SITUATION_PERCEIVE !== '0';
    let situationByChar = new Map<string, string>();
    if (situationPerceive) {
        try {
            situationByChar = await buildTickSituations({
                client: admin.client,
                packageId: d.packageId,
                sagaId: d.sagaId,
                slice,
                roster: activeRoster,
                roleById,
            });
            tlog(`◦ perceive: ${situationByChar.size} sensed the moment`);
        } catch (err) {
            console.warn('[tick-loop] perceive failed:', err);
        }
    }

    // 2. PLAN (N6) — update standing goals so decide/POV recall them. No Sui
    //    signing; bounded concurrency because an all-at-once SEAL burst 429s.
    const plans: TickPlanResult[] = [];
    if (input.plan ?? true) {
        tlog(`① plan — ${slice.length} characters…`);
        const settled = await mapPool(slice, RECALL_CONCURRENCY, async (c) => {
            try {
                const p = await runPlanAction(c.id, {
                    dryRun,
                    rosterContext: rosterContextById.get(c.id),
                    situation: situationByChar.get(c.id),
                    // §2.6: feed current relationships into planning so goals evolve from them.
                    relationshipPressure: await memoryContext.relationshipHints(c.id, 5),
                    // Own-character-only: never another character's row (character-secrets.ts).
                    innerSecret: getCharacterSecret(c.id),
                });
                tlog(`   · plan ${c.name} ✓${p.ok && p.longTermGoal ? `「${p.longTermGoal.slice(0, 36)}」` : ''}`);
                return { c, p };
            } catch (err) {
                tlog(`   · plan ${c.name} ✗`);
                return {
                    c,
                    p: { ok: false, error: err instanceof Error ? err.message : String(err) },
                };
            }
        });
        for (const { c, p } of settled) {
            if (p.ok && p.planText) memoryContext.setPlan(c.id, p.planText);
            plans.push({
                characterId: c.id,
                name: c.name,
                ok: p.ok,
                longTermGoal: p.longTermGoal,
                dailyPlanHint: p.dailyPlanHint,
                hadPrevious: p.hadPrevious,
                error: p.ok ? undefined : p.error,
            });
        }
    }

    // 2.5 MOVE — idle characters walk toward their goals, batched into one PTB.
    const moves: TickMoveResult[] = [];
    if (input.move ?? true) {
        tlog(`② autonomous moves…`);
        try {
            // Rival gravity (flag-gated): draw contenders toward their contest so
            // events reliably form; cooldown + holder exclusion keep it from gluing.
            let gravityTargets: Map<string, string> | undefined;
            if (rivalGravity && !dryRun) {
                try {
                    tickResourceCooldowns();
                    const resources = await readResourceLedger(admin.client, d.packageId, d.sagaId);
                    if (resources.length > 0) {
                        gravityTargets = computeGravityTargets(
                            resources,
                            slice.map((c) => ({
                                id: c.id,
                                name: c.name,
                                tags: publicTagsWithRole(c, roleById.get(c.id)),
                                sceneId: rosterById.get(c.id)?.currentSceneId,
                            })),
                        );
                        if (gravityTargets.size > 0) tlog(`②◦ gravity: ${gravityTargets.size} pulled toward the contest`);
                    }
                } catch (err) {
                    console.warn('[tick-loop] rival gravity failed:', err);
                }
            }
            // Spatial routing (§2.50): at night, place characters by residence;
            // pursuit + welcome come from the relationship graph so privacy emerges.
            // By day the router is silent and the LLM keeps agency.
            let routeTargets: Map<string, string> | undefined;
            if (!dryRun && isNight) {
                // G10: homes are authored canon (preset home_scene) — without
                // this the router's "home" fell back to stay-put and a private
                // pair could never form.
                const homed = await ensureHomesSeeded(
                    d.sagaId,
                    activeRoster.map((r) => ({ id: r.id, name: r.name })),
                    activeScenes.map((s) => ({ id: s.id, name: s.name })),
                ).catch(() => 0);
                if (homed > 0) tlog(`③′ 夜路由: ${homed} 人有家可歸`);
                const present = activeRoster.filter((r) => r.currentSceneId);
                const warm = await fetchWarmGraph(present.map((r) => r.id), {
                    feltNameToId: new Map(present.map((r) => [r.name, r.id])),
                });
                // 妒火夜隨 (G8b): a burning jealousy/grudge follows its target
                // into the night uninvited — obsession outranks warmth when both
                // pull. The router's intrude flag skips the welcome gate; what it
                // walks into (撞破) is decided by nightSceneKind downstream.
                const nightWants = wantEngine ? loadWants(d.sagaId) : [];
                const idByNightName = new Map(present.map((r) => [r.name, r.id]));
                const presentIds = new Set(present.map((r) => r.id));
                const actors = present.map((r) => {
                    const resolveTgt = (t: string) => (presentIds.has(t) ? t : idByNightName.get(t));
                    const jealous = wantEngine ? jealousNightPursuit(nightWants, r.id, resolveTgt) : null;
                    // 夜赴 (H1): a ripe love/debt want seeks its target so the
                    // private pair can form. Welcome-gated (unlike 妒火夜隨's
                    // intrude), and only when jealousy isn't already stalking.
                    const yearning = wantEngine ? yearningNightPursuit(nightWants, r.id, resolveTgt) : null;
                    return {
                        id: r.id,
                        sceneId: r.currentSceneId as string,
                        // Roster snapshots homes before this tick's seeding ran —
                        // re-read the live map so homes work the same night.
                        homeSceneId: r.homeSceneId ?? getHomeScene(r.id) ?? (r.currentSceneId as string),
                        pursue: jealous ?? yearning ?? warm.pursueByChar.get(r.id),
                    };
                });
                routeTargets = computeSpatialRouting(
                    actors,
                    activeScenes.map((s) => ({ id: s.id, privacyLevel: s.privacyLevel })),
                    true,
                    warm.welcome,
                );
                const relocating = [...routeTargets.entries()].filter(
                    ([id, sc]) => rosterById.get(id)?.currentSceneId !== sc,
                ).length;
                if (relocating > 0) tlog(`②◦ 夜路由: ${relocating} 人各歸其所（追隨/避讓依關係圖）`);
            } else if (!dryRun && worldTime?.tickOfDay === 0) {
                // G11 morning dispersal: the day starts at one's 崗位 (preset
                // work_scene) — the mechanical mirror of night homes. Breaks the
                // one-room magnet every dawn; the LLM keeps agency for the rest
                // of the day.
                await ensureHomesSeeded(
                    d.sagaId,
                    activeRoster.map((r) => ({ id: r.id, name: r.name })),
                    activeScenes.map((s) => ({ id: s.id, name: s.name })),
                ).catch(() => 0);
                const toWork = activeRoster.flatMap((r) => {
                    const w = getWorkScene(r.id);
                    return w && r.currentSceneId !== w ? ([[r.id, w]] as const) : [];
                });
                if (toWork.length > 0) {
                    routeTargets = new Map(toWork);
                    tlog(`②◦ 晨路由: ${toWork.length} 人各就崗位`);
                }
            }
            moves.push(
                ...(await runMovePhase({
                    admin,
                    sagaId: d.sagaId,
                    capId: d.storytellerCapId,
                    slice,
                    scenes: activeScenes,
                    nameById,
                    rosterById,
                    roleById,
                    memoryContext,
                    dryRun,
                    gravityTargets,
                    routeTargets,
                    // Spine events span many ticks — don't lock their cast in the scene.
                    pinBusy: !spineMode,
                })),
            );
            tlog(`   moved ${moves.filter((m) => m.ok && m.toSceneId).length}${dryRun ? ' (preview)' : ''}`);
            // Feed the handscroll's living stream from movement, so the world
            // never reads empty between dramas.
            if (!dryRun) {
                for (const m of moves) {
                    if (m.ok && m.toSceneId && m.reason) {
                        recordSceneLine(m.toSceneId, m.characterId, m.reason, 'move');
                    }
                }
            }
            if (moves.some((m) => m.ok && m.toSceneId)) {
                activeScenes = applyMoveResultsToScenes(activeScenes, moves);
                activeRoster = applyMoveResultsToRoster(activeRoster, activeScenes, moves);
                rosterById = new Map(activeRoster.map((r) => [r.id, r]));
                roleById = new Map(activeRoster.map((r) => [r.id, r.role || '—']));
                rosterContextById = buildRosterContextById(slice, activeRoster);
            }
        } catch (err) {
            console.warn('[tick-loop] move phase failed:', err);
        }
    }

    // 2.7 DRAMA (DR-6) — derive tension over contested on-chain resources and
    //    commit a self-verifying beat; hints steer decide/POV toward what each
    //    character lacks. Dormant no-op until resources exist; never blocks the tick.
    let dramaHints: Record<string, string> = {};
    let drama: TickDramaResult | undefined;
    if (slice.length > 0) {
        try {
            const r = await deriveAndCommitDramaBeat({
                sagaId: d.sagaId,
                cast: slice.map((c) => ({
                    id: c.id,
                    name: c.name,
                    tags: publicTagsWithRole(c, roleById.get(c.id)),
                })),
                // G1 single demand source: with the want engine on, a character
                // with wants contests exactly what their wants ache for (the
                // legacy role-ambition table covers only want-less characters).
                wantLedger: wantEngine ? loadWants(d.sagaId) : undefined,
                signer: dryRun ? undefined : admin.signer, // dry-run = derive, don't anchor
            });
            dramaHints = r.hints;
            // Attention budget couples each character's parallel desires so
            // neglected axes ache more — steering overlay only, the committed
            // beat is untouched.
            const allTop = r.tensions.map((t) => ({
                characterId: t.agentId,
                name: nameById.get(t.agentId),
                statement: t.statement,
                tension: tensionFraction(t.value),
            }));
            const steered = attentionBudget ? coupleAttention(allTop) : allTop;
            // When coupling flipped someone's dominant ache, replace their hint
            // with the torn line so the trade-off reaches behavior.
            if (attentionBudget) {
                for (const id of new Set(allTop.map((t) => t.characterId))) {
                    const torn = neglectHintFor(allTop, steered, id);
                    if (torn) dramaHints[id] = torn;
                }
            }
            steered.sort((a, b) => b.tension - a.tension);
            drama = {
                active: r.active,
                resourceCount: r.resourceCount,
                skipped: r.skipped,
                commitmentId: r.commitmentId,
                top: steered.slice(0, 6),
            };
            if (r.active) {
                tlog(
                    `②′ tension derived: ${r.resourceCount} contested resources · ${Object.keys(r.hints).length} feel tension${r.commitmentId ? ` · committed on-chain ${r.commitmentId}` : ''}${r.blobUrl ? ` · blob ${r.blobUrl}` : ''}`,
                );
            }
        } catch (err) {
            console.warn('[tick-loop] drama phase failed:', err);
        }
    }

    // 2.72 DIRECTOR SCARCITY — LLM director may add a contested resource
    //   mid-story (validated + rate-limited); it is desired and settled on a
    //   LATER tick, never read back this tick.
    if (resourceContest && directorResources && !dryRun && drama?.active && slice.length >= 2) {
        try {
            const r = await proposeResourceAction({
                sagaId: d.sagaId,
                capId: d.storytellerCapId,
                cast: slice.map((c) => ({ name: c.name, role: roleById.get(c.id) })),
                tensions: (drama?.top ?? []).map((t) => ({ statement: t.statement, tension: t.tension })),
                signer: admin.signer,
                client: admin.client,
            });
            if (r.ok && r.created) {
                tlog(`②² director adds stakes: new contest "${r.created.label}" (capacity ${r.created.capacity})${r.resourceId ? ' ✓on-chain' : ''}`);
            } else if (r.reason && r.reason !== 'cooldown') {
                tlog(`②² director holds back (${r.reason})`);
            }
        } catch (err) {
            console.warn('[tick-loop] director resource phase failed:', err);
        }
    }

    // 2.75 STORYLET — open the discrete event(s) the POV phase anchors to.
    //   `storylets` holds every event LIVE this tick; `spineSteps` the per-event
    //   plan. Single-mode paths fill length-1 arrays so downstream code is one path.
    let storylets: TickStoryletResult[] = [];
    let spineSteps: SpineStep[] = [];
    let spineCtx: SpineCtx | undefined;
    const verbFor = (action: SpineStep['action']) =>
        action === 'open' ? 'open' : action === 'resolve' ? 'resolve' : action === 'continue' ? 'continue' : '—';
    // LLM framing names the chosen incident; selection stays deterministic.
    const frameLabel = async (picked: { label: string; statement?: string }, cast?: string[], sceneName?: string): Promise<string> =>
        llmFraming && !dryRun
            ? await frameIncident({
                  statement: picked.statement,
                  fallback: picked.label,
                  cast: cast ?? slice.map((c) => c.name),
                  sceneName: sceneName ?? activeScenes[0]?.name ?? '戲班',
              })
            : picked.label;
    const sceneNameById = new Map(activeScenes.map((s) => [s.id, s.name]));
    // §2.51: rest everyone one notch, then build the SELECTION view. Settlement +
    // hints keep reading raw `drama.top` — fatigue steers staging, never who wins.
    let fatigueLedger: FatigueLedger = {};
    if (actorFatigue) {
        fatigueLedger = decayActorFatigue(actorFatigueBySaga.get(d.sagaId) ?? {});
        actorFatigueBySaga.set(d.sagaId, fatigueLedger);
    }
    const selectionRows = actorFatigue ? applyActorFatigue(drama?.top ?? [], fatigueLedger) : (drama?.top ?? []);
    if (parallelEvents && drama?.active && slice.length > 0) {
        // PARALLEL SPINE — open/linger/resolve many axis events at once.
        const occupancy = slice.flatMap((c) => {
            const sid = rosterById.get(c.id)?.currentSceneId;
            return sid ? [{ characterId: c.id, sceneId: sid }] : [];
        });
        let candidates = buildAxisCandidates(selectionRows, occupancy, framingForStatement);
        // [ch-diag] spine-plan: why events do/don't open (occupancy=0 → scene
        // reads failed; cand counts <2 → no quorum on any axis).
        console.log(
            `[ch-diag] spine-plan day=${worldTime?.day ?? '?'} acting=${slice.length} ` +
                `occupancy=${occupancy.length} tensionRows=${(drama?.top ?? []).length} ` +
                `candidates=${candidates.length} minCast=2 cand=[${candidates
                    .slice(0, 6)
                    .map((c) => `${c.templateId.replace('contention:', '')}:${c.participantIds.length}@${c.sceneId.slice(0, 6)}`)
                    .join(',')}]`,
        );
        // LLM-frame only the axes that could open this tick (bounds LLM spend).
        if (llmFraming && candidates.length > 0) {
            candidates = await Promise.all(
                candidates.map(async (c, i) =>
                    i < maxConcurrentEvents
                        ? {
                              ...c,
                              label: await frameLabel(
                                  { label: c.label, statement: c.statement },
                                  c.participantIds.map((id) => nameById.get(id) ?? '某人'),
                                  sceneNameById.get(c.sceneId),
                              ),
                          }
                        : c,
                ),
            );
        }
        spineCtx = {
            sagaId: d.sagaId,
            capId: d.storytellerCapId,
            contention: null,
            candidates,
            maxConcurrent: maxConcurrentEvents,
            occupancy,
            sceneNameById,
            nameById,
            roleById,
            tensions: (drama?.top ?? []).map((t) => ({
                characterId: t.characterId,
                statement: t.statement,
                tension: t.tension,
            })),
            attrsById,
        };
        // Rebuild the open set from chain BEFORE deciding, so events opened by a
        // recycled process still age and resolve instead of piling up OPEN.
        await reconcileOpenFromChain(admin.client, d.sagaId);
        const nowTick = spineClockTick();
        const mem = spineMemorySnapshot(d.sagaId, nowTick);
        tlog(
            `②‴ spine memory: clock-tick ${mem.tick} · ${mem.open.length} live${
                mem.open.length ? ` (${mem.open.map((e) => `${e.eventId.slice(0, 10)}…@${e.age}t`).join(', ')})` : ''
            }`,
        );
        const r = await spinePlanAndOpenAll(admin, spineCtx, nowTick);
        storylets = r.storylets;
        spineSteps = r.steps;
        const opened = spineSteps.filter((s) => s.action === 'open').length;
        const resolving = spineSteps.filter((s) => s.action === 'resolve').length;
        for (const st of storylets) tlog(`②‴ live: ${st.sceneName} · ${st.label} (${st.names.join(', ')}) · ${st.digest}`);
        tlog(`②‴ parallel events: ${storylets.length} live (this tick: ${opened} opened, ${resolving} resolving)`);
    } else if (eventSpine && drama?.active && slice.length > 0) {
        // SPINE MODE — open/linger/resolve ONE multi-tick BudgetEvent.
        const occupancy = slice.flatMap((c) => {
            const sid = rosterById.get(c.id)?.currentSceneId;
            return sid ? [{ characterId: c.id, sceneId: sid }] : [];
        });
        const recentTopics = recentTopicsBySaga.get(d.sagaId) ?? [];
        const picked = centrality
            ? await selectContentionByCentrality(selectionRows, recentTopics)
            : selectContention(selectionRows, recentTopics);
        recentTopicsBySaga.set(d.sagaId, pushRecentTemplate(recentTopics, picked.statement ?? picked.templateId));
        const spineLabel = await frameLabel(picked);
        spineCtx = {
            sagaId: d.sagaId,
            capId: d.storytellerCapId,
            contention: { templateId: picked.templateId, label: spineLabel, statement: picked.statement },
            occupancy,
            sceneNameById,
            nameById,
            roleById,
            tensions: (drama?.top ?? []).map((t) => ({
                characterId: t.characterId,
                statement: t.statement,
                tension: t.tension,
            })),
            attrsById,
        };
        await reconcileOpenFromChain(admin.client, d.sagaId);
        const nowTick = spineClockTick();
        const r = await spinePlanAndOpen(admin, spineCtx, nowTick);
        if (r.storylet) storylets = [r.storylet];
        spineSteps = [r.step];
        if (r.storylet) {
            tlog(`②‴ ${verbFor(r.step.action)}: ${r.storylet.sceneName} · ${r.storylet.label} (${r.storylet.names.join(', ')})`);
        }
    } else if ((input.storylet ?? true) && drama?.active && slice.length > 0) {
        const byScene = new Map<string, Character[]>();
        for (const c of slice) {
            const sid = rosterById.get(c.id)?.currentSceneId;
            if (!sid) continue;
            const arr = byScene.get(sid);
            if (arr) arr.push(c);
            else byScene.set(sid, [c]);
        }
        const busiest = [...byScene.entries()]
            .filter(([, cs]) => cs.length >= 2)
            .sort((a, b) => b[1].length - a[1].length)[0];
        if (busiest) {
            const [sid, cs] = busiest;
            const sceneName =
                rosterById.get(cs[0].id)?.currentSceneName ??
                activeScenes.find((s) => s.id === sid)?.name ??
                '戲班';
            const recentTopics = recentTopicsBySaga.get(d.sagaId) ?? [];
            const picked = centrality
            ? await selectContentionByCentrality(selectionRows, recentTopics)
            : selectContention(selectionRows, recentTopics);
            const framing = { templateId: picked.templateId, label: await frameLabel(picked) };
            recentTopicsBySaga.set(d.sagaId, pushRecentTemplate(recentTopics, picked.statement ?? picked.templateId));
            const st: TickStoryletResult = {
                sceneId: sid,
                sceneName,
                templateId: framing.templateId,
                label: framing.label,
                characterIds: cs.map((c) => c.id),
                names: cs.map((c) => c.name),
                opened: false,
            };
            if (!dryRun) {
                try {
                    const txb = new Transaction();
                    txb.add(
                        endlessTx.director.openStorylet({
                            cap: d.storytellerCapId,
                            saga: d.sagaId,
                            templateId: framing.templateId,
                            sceneId: sid,
                            characterIds: st.characterIds,
                        }),
                    );
                    const res = await execAdminTx(admin, txb);
                    st.opened = res.success;
                    st.digest = res.digest;
                } catch (err) {
                    st.error = err instanceof Error ? err.message : String(err);
                }
            }
            storylets = [st];
            tlog(
                `②‴ open: ${sceneName} · ${framing.label} (${st.names.join(', ')})` +
                    `${dryRun ? ' (preview)' : st.opened ? ' ✓on-chain' : ' ✗'}`,
            );
        }
    }

    // §2.51: everyone who carried a live event this tick tires, so the spotlight rotates.
    if (actorFatigue && storylets.length > 0) {
        const featured = [...new Set(storylets.flatMap((s) => s.characterIds))];
        const bumped = bumpActorFatigue(fatigueLedger, featured);
        actorFatigueBySaga.set(d.sagaId, bumped);
        const ledgerLine = Object.entries(bumped)
            .map(([id, v]) => `${nameById.get(id) ?? id.slice(0, 6)}:${v.toFixed(2)}`)
            .join(' ');
        tlog(`②⁵ actor fatigue: ${featured.length} featured tire, rows suppressed next tick (${ledgerLine})`);
    }

    // EVENT MOMENT + EVENT CUT are both StorytellerCap txs: captured as jobs and
    //   run SERIALLY after the POV phase, or they race on the cap's object version.
    const momentJobs: Array<() => Promise<void>> = [];
    const cutJobs: Array<() => Promise<void>> = [];
    // The event covering a character this tick: the event whose cast includes
    // them, else the one staged in their scene.
    const eventForChar = (charId: string, sceneId?: string): TickStoryletResult | undefined =>
        storylets.find((s) => s.characterIds.includes(charId)) ??
        (sceneId ? storylets.find((s) => s.sceneId === sceneId) : undefined);

    // 2.76 EVENT MOMENT — multi-character scene image per opened event (img2img
    //   off each participant's anchor so faces don't drift), appended as kind=4.
    //   One image per (scene, axis) per narrative day: the same contest re-opens
    //   tick after tick and repainting the same cast in the same room filled
    //   galleries with near-identical moments.
    const momentDay = worldTime?.day ?? 0;
    for (const st of storylets) {
        if (!((input.eventImage ?? narrativeProfile?.features.eventImage ?? true) && !dryRun && st.opened && st.characterIds.length >= 2)) continue;
        const mKey = momentKey(st.sceneId, st.templateId);
        if (hasMomentToday(d.sagaId, mKey, momentDay)) {
            console.log(`[tick-loop] event moment (${st.templateId}): skipped=already_rendered_today`);
            continue;
        }
        momentJobs.push(async () => {
            const r = await generateEventMomentAction({
                characterIds: st.characterIds,
                sceneName: st.sceneName,
                label: st.label,
                eventTx: st.digest,
            });
            if (r.appended > 0) recordMoment(d.sagaId, mKey, momentDay);
            console.log(
                `[tick-loop] event moment (${st.templateId}): appended=${r.appended}` +
                    (r.skipped ? ` skipped=${r.skipped}` : '') +
                    (r.error ? ` error=${r.error}` : ''),
            );
        });
    }

    // 2.8 SOCIAL — same-scene observation/talk; writes subjective memories the
    // next POV can recall.
    const socials: TickSocialResult[] = [];
    if (slice.length > 0) {
        tlog(`②″ light interactions…`);
        try {
            socials.push(
                ...(await runSocialPhase({
                    sagaId: d.sagaId,
                    slice,
                    scenes: activeScenes,
                    rosterById,
                    roleById,
                    memoryContext,
                    dramaHints,
                    dryRun,
                })),
            );
            tlog(`   talk ${socials.filter((s) => s.ok && s.kind !== 'idle').length}${dryRun ? ' (preview)' : ''}`);
        } catch (err) {
            console.warn('[tick-loop] social phase failed:', err);
        }
    }

    // 2.85 ASK — needy characters ask a solvent same-scene peer for help; asks
    // are handed to GIVE so the chosen giver sees an explicit request.
    const charactersById = new Map(characters.map((c) => [c.id, c]));
    const asks: TickAskResult[] = [];
    let asksByGiver = new Map<string, import('./tick-phases/give').IncomingAsk[]>();
    if (slice.length > 0) {
        tlog(`②⁗ asks for help…`);
        try {
            const askPhase = await runAskPhase({
                sagaId: d.sagaId,
                slice,
                charactersById,
                scenes: activeScenes,
                rosterById,
                roleById,
                memoryContext,
                dryRun,
            });
            asks.push(...askPhase.results);
            asksByGiver = askPhase.asksByGiver;
            tlog(`   asks ${asks.filter((a) => a.ok && a.asked).length}${dryRun ? ' (preview)' : ''}`);
        } catch (err) {
            console.warn('[tick-loop] ask phase failed:', err);
        }
    }

    // 2.9 GIVE — a solvent character may aid a same-scene peer; the balance move
    // is deferred to the settle shadow, recorded here as memory + scene line.
    const gives: TickGiveResult[] = [];
    if (slice.length > 0) {
        tlog(`②‴ giving aid…`);
        try {
            gives.push(
                ...(await runGivePhase({
                    sagaId: d.sagaId,
                    slice,
                    charactersById,
                    scenes: activeScenes,
                    rosterById,
                    roleById,
                    memoryContext,
                    asksByGiver,
                    dryRun,
                })),
            );
            tlog(`   aid ${gives.filter((g) => g.ok && g.gave).length}${dryRun ? ' (preview)' : ''}`);
        } catch (err) {
            console.warn('[tick-loop] give phase failed:', err);
        }
    }

    // 2.96 BOND — mechanical strengthening: an accepted gift deepens the pair's
    //   public tie via one relationship_seed, so the graph grows from what
    //   characters DO. Owned-cap tx → serial cutJobs (can't race the StorytellerCap).
    if (!dryRun) {
        const bondPairs = collectBondPairs(gives, (id) => rosterById.get(id)?.currentSceneId, d.sceneIds[0]);
        if (bondPairs.length > 0) {
            tlog(`②⁺ bonds: ${bondPairs.length} pair(s) deepened by accepted aid`);
            cutJobs.push(async () => {
                const r = await seedBondTies(bondPairs);
                console.log(
                    `[tick-loop] bond strengthen: seeded=${r.seeded}` +
                        (r.error ? ` error=${r.error}` : ''),
                );
            });
        }
    }

    // 2.95 SETTLE — advance the off-chain economy to today (wages → cost →
    // vitality → death) and apply accepted gifts as real transfers.
    let settle: TickSettleResult | undefined;
    if (!dryRun && slice.length > 0) {
        tlog(`②⁗ settle…`);
        try {
            settle = await runSettlePhase({
                sagaId: d.sagaId,
                characters,
                gives,
                today: worldTime?.day ?? 1,
                dryRun,
            });
            tlog(`   settled ${settle.settledCount} · wages ${settle.wagesPaid} · transfers ${settle.transfersApplied}${settle.dead.length ? ` · died ${settle.dead.length}` : ''}`);
        } catch (err) {
            console.warn('[tick-loop] settle phase failed:', err);
        }
    }

    // 3. ACT — characters play their hands in open events; fully-acted events
    //    auto-resolve (non-spine). Chain mutation → serial.
    const acts: TickActResult[] = [];
    const resolves: TickResolveResult[] = [];
    if (!dryRun) {
        tlog(`③ play cards + resolve…`);
        try {
            const phase = await runActPhase(
                admin,
                d.sagaId,
                d.storytellerCapId,
                nameById,
                (input.autoResolve ?? true) && !spineMode,
                dramaHints,
                rosterContextById,
                memoryContext,
                spineMode, // spine owns resolve+settlement; ACT only plays cards
            );
            acts.push(...phase.acts);
            resolves.push(...phase.resolves);
            tlog(`   plays ${acts.filter((a) => a.ok).length} · resolves ${resolves.filter((r) => r.ok).length}`);
        } catch (err) {
            console.warn('[tick-loop] act phase failed:', err);
        }
    }

    // Objective per-scene beat ledger: same-scene POVs receive the SAME facts so
    // chapters interpret one shared reality. Private observations are excluded.
    const beatsByScene = new Map<string, Array<{ actorId: string; text: string }>>();
    const pushBeat = (sceneId: string | undefined, actorId: string, text: string) => {
        if (!sceneId) return;
        const list = beatsByScene.get(sceneId);
        if (list) list.push({ actorId, text });
        else beatsByScene.set(sceneId, [{ actorId, text }]);
    };
    for (const m of moves) {
        if (!m.ok || !m.toSceneId) continue;
        pushBeat(m.toSceneId, m.characterId, `${m.name}自他處走了進來`);
        pushBeat(m.fromSceneId, m.characterId, `${m.name}往${m.toSceneName ?? '別處'}去了`);
    }
    for (const s of socials) {
        if (!s.ok || s.kind !== 'talk' || !s.line) continue;
        const sceneId = rosterById.get(s.characterId)?.currentSceneId;
        pushBeat(sceneId, s.characterId, `${s.name}${s.targetName ? `對${s.targetName}` : ''}說：「${s.line}」`);
    }
    for (const a of acts) {
        if (!a.ok || !a.cardLabel) continue;
        const sceneId = rosterById.get(a.characterId)?.currentSceneId;
        // Spoken line first (quotable), then the inner why.
        pushBeat(
            sceneId,
            a.characterId,
            `${a.name ?? '某人'}${cardActionPhrase(a.cardLabel)}${a.line ? `：「${a.line}」` : ''}${a.intent ? `（${a.intent}）` : ''}`,
        );
    }

    // 3.9 WANT SCENES (flag TICK_WANT_ENGINE) — per-scene interaction loops
    //   driven by each character's hottest want (§2.48). Beats join the shared
    //   objective ledger (scene records + POV sceneBeats + 手卷) exactly like
    //   move/social/act beats. Night ticks fast-forward (sleep consolidates).
    //   Failure-isolated; never blocks the tick.
    const wantActed: string[] = [];
    if (wantEngine && slice.length > 0 && !dryRun) {
        // Night is no longer a wholesale fast-forward: the night router is the
        // only thing that pulls a pair into a private room, so a 幽會-qualified
        // scene still plays (§2.45's private-pair machinery is unreachable
        // otherwise). Ledger upkeep (genesis/backfill/stirs/decay) stays
        // daytime-only; everyone outside a tryst sleeps.
        {
            try {
                const nowTick = spineClockTick();
                const wants = loadWants(d.sagaId);
                if (!isNight) {
                // 檯面上的爭奪 (lazy, once per tick) — genesis tags wants with the
                // stake they pursue, so demand stays single-sourced (G1).
                let stakeCache: Array<{ label: string }> | null = null;
                const contestedStakes = async () => {
                    // Contest off: hand genesis an EMPTY stake list so wants stay
                    // intrinsic and the 執念補判 backfill short-circuits (stakes
                    // length 0). The on-chain ledger is left untouched.
                    if (!resourceContest) return [];
                    if (stakeCache) return stakeCache;
                    stakeCache = await readResourceLedger(admin.client, d.packageId, d.sagaId)
                        .then((ledger) => ledger.map((r) => ({ label: r.label })))
                        .catch(() => []);
                    return stakeCache;
                };
                for (const c of slice) {
                    // Ripple/aftermath wants filling a vacuum do NOT count as an
                    // inner life — retry until genesis itself has run (a silent
                    // genesis failure once left the deepest persona uncharted
                    // while ambient ripples squatted in the void).
                    if (wants.some((w) => w.characterId === c.id && w.source === 'genesis')) continue;
                    const stakes = await contestedStakes();
                    const derived = await characterAgent.deriveGenesisWants({
                        name: c.name,
                        role: roleById.get(c.id) ?? '—',
                        gender: c.gender,
                        ageYears: c.age,
                        description: c.description,
                        castNames: slice.map((x) => x.name),
                        // Own-character-only: never another character's row (character-secrets.ts).
                        secret: getCharacterSecret(c.id),
                        contestedResources: stakes,
                    });
                    for (const g of derived) {
                        wants.push(
                            newWant({
                                characterId: c.id,
                                layer: g.layer,
                                desc: g.desc,
                                target: g.target,
                                // null = assessed against the stake list, tied to none.
                                resource: stakes.length > 0 ? (g.resource ?? null) : undefined,
                                weight: g.weight,
                                sat: g.sat,
                                resistance: g.resistance,
                                kind: 'narrative',
                                source: 'genesis',
                                bornTick: nowTick,
                            }),
                        );
                    }
                    if (derived.length > 0) tlog(`③⁹ genesis wants: ${c.name} ×${derived.length}`);
                }
                // G1 backfill: wants that pre-date the stake list get a one-time
                // affinity pass — tied wants take the exact label, the rest turn
                // null (= assessed) so this never re-runs for the character.
                for (const c of slice) {
                    const mine = wants.filter((w) => !w.retired && w.characterId === c.id);
                    if (mine.length === 0 || mine.some((w) => w.resource !== undefined)) continue;
                    const stakes = await contestedStakes();
                    if (stakes.length === 0) break;
                    const ties = await characterAgent.assessResourceAffinity({
                        name: c.name,
                        role: roleById.get(c.id) ?? '—',
                        description: c.description,
                        wants: mine.map((w) => ({ layer: w.layer, desc: w.desc })),
                        contestedResources: stakes,
                    });
                    mine.forEach((w, i) => {
                        w.resource = ties.get(i) ?? null;
                    });
                    const tied = [...ties.values()];
                    tlog(`③⁹ 執念補判: ${c.name} ${tied.length > 0 ? '→ ' + tied.join('、') : '不爭檯面'}`);
                }
                for (const cid of drainWantDreamStirs(d.sagaId)) {
                    const hit = applyDreamStirToWants(wants, cid);
                    if (hit) tlog(`③⁹ dream stir → ${nameById.get(cid) ?? cid.slice(0, 8)}「${hit.desc}」`);
                }
                decayWants(wants);
                for (const f of fadeStaleWants(wants, nowTick)) {
                    tlog(`③⁹ 淡了: ${nameById.get(f.characterId) ?? '?'}「${f.desc}」`);
                }
                } // end daytime ledger upkeep

                const clock = worldTime?.partOfDay ?? '白日';
                // Daily-life tint (§2.15-2.18; approach iii — derived, no store):
                // fatigue follows the day's arc, hunger the distance from the last
                // meal slot (早/午/晚飯). Undertone only — the state block itself
                // tells the beat not to narrate it as an event.
                const ticksPerDay = worldTime?.ticksPerDay ?? 6;
                const tickOfDay = worldTime?.tickOfDay ?? 0;
                const sinceMeal = Math.min(...[0, 1, 4].map((m) => (tickOfDay - m + ticksPerDay) % ticksPerDay));
                const stateLine =
                    runnerWorker.buildStateBlock({
                        hunger: Math.min(1, 0.1 + sinceMeal * 0.28),
                        // Same day-arc curve the POV state uses (dayFatigue, hoisted above).
                        fatigue: dayFatigue,
                        mood: 0,
                    }) || undefined;
                // G3: one relations read per tick — beats get each co-present
                // person's 行當 + canon tie so address forms stop drifting.
                const castTies = await fetchCastTies(slice.map((c) => ({ id: c.id, name: c.name }))).catch(
                    () => new Map<string, string>(),
                );
                // Perception rule: an actor knows only their OWN feeling toward a
                // co-present person — never the reverse edge (that is the other's
                // inner state; it reaches them only through enacted behavior).
                const tieLine = (selfId: string, otherId: string): string | undefined => {
                    const out = castTies.get(`${selfId}::${otherId}`);
                    return out ? `你對TA：${out}` : undefined;
                };
                const byScene = new Map<string, Character[]>();
                for (const c of slice) {
                    const sid = rosterById.get(c.id)?.currentSceneId;
                    if (!sid) continue;
                    const arr = byScene.get(sid);
                    if (arr) arr.push(c);
                    else byScene.set(sid, [c]);
                }
                // 幽會 (G8): at night only a private scene holding exactly the
                // pair the router pulled together — with a live love-want between
                // them — plays out. Everyone else sleeps, as before.
                if (isNight) {
                    let trysts = 0;
                    let reckonings = 0;
                    let confrontations = 0;
                    for (const [sceneId, cs] of [...byScene]) {
                        const info = activeScenes.find((sc) => sc.id === sceneId);
                        const kind = nightSceneKind(cs, info?.privacyLevel ?? 0, wants);
                        if (!kind) byScene.delete(sceneId);
                        else if (kind === 'tryst') trysts++;
                        else if (kind === 'reckoning') reckonings++;
                        else confrontations++;
                    }
                    tlog(
                        byScene.size > 0
                            ? `③⁹ 夜場: ${trysts} 幽會${reckonings > 0 ? ` · ${reckonings} 了結` : ''}${confrontations > 0 ? ` · ${confrontations} 撞破` : ''}`
                            : '③⁹ want scenes: night — 快轉, sleep consolidates',
                    );
                }
                let beatCount = 0;
                const privateSceneIds = new Set<string>();
                for (const [sceneId, cs] of byScene) {
                    const info = activeScenes.find((sc) => sc.id === sceneId);
                    const isPrivate = (info?.privacyLevel ?? 0) >= 3;
                    if (isPrivate) privateSceneIds.add(sceneId);
                    const sceneName = sceneNameById.get(sceneId) ?? '戲班';
                    // Memory channel: each member recalls against their hottest
                    // want (§2.45 暗號 echoes) AND about the co-present people
                    // they have ties to — facing someone surfaces your history
                    // with them, not just your current obsession. Capped small
                    // (2 others × 2 snippets); failure-safe.
                    const castWithMem = await Promise.all(
                        cs.map(async (c) => {
                            const mine = wants.filter((w) => !w.retired && w.characterId === c.id);
                            const hot = mine.sort((x, y) => y.weight * (1 - y.sat) - x.weight * (1 - x.sat))[0];
                            const tiedOthers = cs
                                .filter((o) => o.id !== c.id && castTies.has(`${c.id}::${o.id}`))
                                .slice(0, 2);
                            const [hotMem, ...aboutOthers] = await Promise.all([
                                hot ? recallForCharacter(c.id, hot.desc, 3).catch(() => []) : Promise.resolve([]),
                                ...tiedOthers.map((o) =>
                                    recallForCharacter(c.id, o.name, 2).catch(() => [] as string[]),
                                ),
                            ]);
                            const memories = [...new Set([...hotMem, ...aboutOthers.flat()])].slice(0, 6);
                            return {
                                characterId: c.id,
                                name: c.name,
                                persona: c.description,
                                memories: memories.length > 0 ? memories : undefined,
                                stateLine,
                                // Own-character-only: never another character's row (character-secrets.ts).
                                innerSecret: getCharacterSecret(c.id),
                                role: roleById.get(c.id),
                                ties: Object.fromEntries(
                                    cs
                                        .filter((o) => o.id !== c.id)
                                        .map((o) => [o.id, tieLine(c.id, o.id)] as const)
                                        .filter((pair): pair is [string, string] => Boolean(pair[1])),
                                ),
                            };
                        }),
                    );
                    const loop = await runSceneLoop({
                        sceneId,
                        sceneName,
                        isPrivate,
                        clock,
                        tone: narrativeProfile?.soul?.toneRegister,
                        etiquette: narrativeProfile?.etiquette,
                        emotionalStance: narrativeProfile?.soul?.emotionalStance,
                        cast: castWithMem,
                        wants,
                        tick: nowTick,
                    });
                    const acc = episodeDayBySaga.get(d.sagaId) ?? { lines: [], actorIds: new Set<string>(), sceneIds: [], povByName: new Map<string, string>() };
                    if (loop.beats.length > 0 && acc.lines[acc.lines.length - 1] !== `【${clock}】`) acc.lines.push(`【${clock}】`);
                    for (const b of loop.beats) {
                        pushBeat(sceneId, b.characterId, `${b.name}：${b.text}`);
                        recordSceneLine(sceneId, b.characterId, b.text, 'act');
                        // Enacted truth → the cut weaver's observations/intents
                        // (public scenes only; 窗內事 never reaches a public cut).
                        if (!isPrivate) {
                            recordSceneTruth(d.sagaId, sceneId, {
                                day: worldTime?.day,
                                name: b.name,
                                text: b.text,
                                inner: b.inner,
                            });
                        }
                        tlog(`③⁹ [${sceneName}] ${b.name}：${b.text}`);
                        // Private beats never reach the public episode weaver —
                        // they live in POV serials and the subscriber scene view.
                        if (!isPrivate) acc.lines.push(`[${sceneName}] ${b.name}：${b.text}`);
                        acc.actorIds.add(b.characterId);
                        if (!acc.sceneIds.includes(sceneId)) acc.sceneIds.push(sceneId);
                    }
                    if (isPrivate && loop.beats.length > 0) {
                        const who = cs.map((c) => c.name).join('、');
                        acc.lines.push(`[${sceneName}] ${who}掩門入內，燭影搖了半宿——窗內的來回，不入公開的日回。`);
                        // Ex-ante gate grants permission; the judge reports what
                        // actually happened (a gated pair may just talk all night).
                        const rating: SceneRating = loop.intimacyGateOpened
                            ? await characterAgent.judgeSceneIntimacy({
                                  beats: loop.beats.map((b) => `${b.name}：${b.text}`),
                              })
                            : 'talk';
                        recordSceneRating(d.sagaId, {
                            sceneId,
                            sceneName,
                            tick: nowTick,
                            rating,
                            gateOpened: loop.intimacyGateOpened,
                            beatCount: loop.beats.length,
                            atMs: Date.now(),
                        });
                        tlog(`③⁹ [${sceneName}] 私處：${loop.beats.length} 拍不入公開日回；分級=${rating}${loop.intimacyGateOpened ? '（閘門開）' : ''}`);
                    }
                    episodeDayBySaga.set(d.sagaId, acc);
                    beatCount += loop.beats.length;
                    wantActed.push(...loop.actedCharacterIds.filter((id) => !wantActed.includes(id)));
                    for (const rv of loop.resolved) {
                        tlog(
                            `③⁹ resolved: ${nameById.get(rv.want.characterId) ?? '?'}「${rv.want.desc}」${rv.note ? ` — ${rv.note}` : ''}`,
                        );
                        const owner = cs.find((c) => c.id === rv.want.characterId);
                        if (!owner) continue;
                        const after = await characterAgent.deriveAftermathWant({
                            name: owner.name,
                            persona: owner.description,
                            resolvedDesc: rv.want.desc,
                            resolvedNote: rv.note,
                            beats: loop.beats.map((b) => `${b.name}：${b.text}`),
                        });
                        if (after) {
                            wants.push(
                                newWant({
                                    characterId: owner.id,
                                    layer: after.layer,
                                    desc: after.desc,
                                    target: after.target,
                                    weight: after.weight,
                                    sat: after.sat,
                                    resistance: after.resistance,
                                    kind: 'narrative',
                                    source: 'aftermath',
                                    bornTick: nowTick,
                                }),
                            );
                            tlog(`③⁹ aftermath: ${owner.name}「${after.desc}」`);
                        }
                    }
                    if (loop.beats.length > 0) {
                        const deltas = await characterAgent.judgeRipples({
                            sceneName,
                            beats: loop.beats.map((b) => `${b.name}：${b.text}`),
                            roster: slice.map((c) => ({
                                characterId: c.id,
                                name: c.name,
                                wants: wants
                                    .filter((w) => !w.retired && w.characterId === c.id)
                                    .map((w) => w.desc),
                            })),
                        });
                        const spawned = applyRipples(wants, deltas, nowTick);
                        for (const sp of spawned) {
                            tlog(`③⁹ new thread: ${nameById.get(sp.characterId) ?? '?'}「${sp.desc}」`);
                        }
                    }
                }
                saveWants(d.sagaId, wants);
                const allBeatLines: string[] = [];
                for (const [sid, arr] of beatsByScene) {
                    if (privateSceneIds.has(sid)) continue; // 窗內事 stays off the public weave
                    const sn = sceneNameById.get(sid) ?? '戲班';
                    for (const b of arr) allBeatLines.push(`[${sn}] ${b.text}`);
                }
                if (allBeatLines.length >= 3) {
                    const woven = await sceneRecord.weaveTickChapter({
                        clock,
                        lines: allBeatLines,
                        tone: narrativeProfile?.soul?.toneRegister,
                    });
                    if (woven) {
                        dumpChapter({ kind: 'cut', day: worldTime?.day, name: 'want-回' }, woven);
                        tlog(`③⁹ 織回: ${woven.length} chars (dumped; anchor wiring in Wave 1.5)`);
                    }
                }
                if (actorFatigue && wantActed.length > 0) {
                    const bumped = bumpActorFatigue(actorFatigueBySaga.get(d.sagaId) ?? fatigueLedger, wantActed);
                    actorFatigueBySaga.set(d.sagaId, bumped);
                }
                const live = wants.filter((w) => !w.retired).length;
                tlog(`③⁹ want scenes: ${byScene.size} scene(s) · ${beatCount} beat(s) · ${live} live want(s)`);
            } catch (err) {
                console.warn('[tick-loop] want engine failed:', err);
            }
        }
    }

    const povs: TickPovResult[] = [];
    // POV enrichment (narrative-chain fix 2): each narrator knows their hottest
    // want (what this chapter's gaze circles) and their bible arc (承上) — read
    // once, applied per character below.
    const povWantsBySaga = wantEngine ? loadWants(d.sagaId) : [];
    const povArcByCharId = new Map<string, string>();
    try {
        for (const arc of loadBible(d.sagaId)?.arcs ?? []) {
            if (arc.characterId && arc.state) povArcByCharId.set(arc.characterId, arc.state);
        }
    } catch {
        /* no bible yet — POVs simply run without 承上 */
    }
    if (input.pov ?? true) {
        // 4. PRODUCE — POV chapter per character with a narratable beat this tick
        //    (event-driven cadence, not per-tick filler); `povAll` forces everyone.
        const narratable = new Set<string>();
        for (const st of storylets) for (const id of st.characterIds) narratable.add(id);
        for (const a of acts) if (a.ok) narratable.add(a.characterId);
        for (const id of wantActed) narratable.add(id);
        // Every participant of a just-closed event narrates the outcome — this is
        // where on-chain win/loss enters the story.
        const verdictByChar = new Map<string, string>();
        for (const rr of resolves) {
            if (rr.ok && rr.verdict) {
                for (const p of rr.participants ?? []) {
                    verdictByChar.set(p, rr.verdict);
                    narratable.add(p);
                }
            }
        }
        const povSlice = (input.povAll ?? false)
            ? slice
            : slice.filter((c) => narratable.has(c.id));
        const mapPov = (c: Character, r: Awaited<ReturnType<typeof runPovForCharacter>>): TickPovResult => ({
            characterId: c.id,
            name: c.name,
            ok: r.ok,
            anchored: r.anchored,
            skipReason: r.skipReason,
            chapter: r.chapter,
            recalledCount: r.recalledCount,
            digest: r.digest,
            error: r.error,
        });
        // Generate with bounded concurrency (unbounded SEAL bursts 429), then
        // anchor all chapters in ONE PTB. Per-item try/catch so one bad recall
        // can't kill the tick.
        tlog(
            povSlice.length === 0
                ? '④ POV skipped (no event drew characters this tick; use povAll to force one each)'
                : `④ POV — generating ${povSlice.length} (event-relevant characters; slow, one LLM call each)…`,
        );
        // §2.14: one objective scene record per scene feeds all its POVs as
        // shared sceneBeats, so they interpret the same physical facts instead
        // of confabulating. Falls back to raw per-actor beats when uncomposable.
        const povSceneIds = new Set(
            povSlice
                .map((c) => rosterById.get(c.id)?.currentSceneId)
                .filter((s): s is string => Boolean(s)),
        );
        const sceneRecordByScene = new Map<string, string>();
        await mapPool([...povSceneIds], RECALL_CONCURRENCY, async (sceneId) => {
            const presentNames = activeRoster
                .filter((rp) => rp.currentSceneId === sceneId)
                .map((rp) => rp.name);
            if (presentNames.length === 0) return;
            const record = await sceneRecord.composeSceneRecord({
                sceneName: sceneNameById.get(sceneId) ?? '戲班',
                presentNames,
                eventLabel: storylets.find((st) => st.sceneId === sceneId)?.label,
                beats: (beatsByScene.get(sceneId) ?? []).map((b) => b.text),
            });
            if (record) sceneRecordByScene.set(sceneId, record);
        });

        // §2.19 daily-life state (dayFatigue, hoisted above): tints the chapter's
        // texture, never who they are; omitting it keeps the prompt byte-identical.
        // §4d.2: contesters around the central character feel the pressure — the
        // central character is NEVER instructed to resolve (that would script the
        // turn); they resolve only by responding.
        const liveArc = arcConvergence ? currentArc(d.sagaId) : undefined;
        const arcCentralId = liveArc?.centralCharId;
        const arcCentralName = arcCentralId ? rosterById.get(arcCentralId)?.name ?? '' : '';
        const arcCentralScene = arcCentralId ? rosterById.get(arcCentralId)?.currentSceneId : undefined;
        const arcAwareness = liveArc ? pressureAwareness(forcingLevel(liveArc), arcCentralName) : '';
        const generated = await mapPool(povSlice, RECALL_CONCURRENCY, async (c) => {
            try {
                const sceneId = rosterById.get(c.id)?.currentSceneId;
                const objectiveRecord = sceneId ? sceneRecordByScene.get(sceneId) : undefined;
                const sceneBeats = objectiveRecord
                    ? [objectiveRecord]
                    : sceneId
                      ? (beatsByScene.get(sceneId) ?? [])
                            .filter((b) => b.actorId !== c.id)
                            .map((b) => b.text)
                      : [];
                // Event-anchored trigger; falls back to the ambient line.
                const triggerParts: string[] = [];
                const myEvent = eventForChar(c.id, sceneId);
                if (myEvent) {
                    const others = myEvent.names.filter((n) => n !== c.name);
                    triggerParts.push(
                        `在${myEvent.sceneName}，${myEvent.label}` +
                            (others.length ? `（同場還有${others.join('、')}）` : ''),
                    );
                }
                const myTalk = socials.find(
                    (s) => s.characterId === c.id && s.kind === 'talk' && s.line,
                );
                if (myTalk) {
                    triggerParts.push(
                        `你方才${myTalk.targetName ? `對${myTalk.targetName}` : ''}說過「${myTalk.line}」`,
                    );
                }
                for (const a of acts) {
                    if (a.characterId === c.id && a.ok && a.cardLabel) {
                        triggerParts.push(
                            `你${cardActionPhrase(a.cardLabel)}${a.line ? `，${a.line}` : ''}${a.intent ? `（${a.intent}）` : ''}`,
                        );
                    }
                }
                const myVerdict = verdictByChar.get(c.id);
                // A landed verdict counts as a fresh beat AND flags the POV as a
                // closing chapter; named once so the double use is explicit.
                const hasClosingVerdict = Boolean(myVerdict);
                if (myVerdict) {
                    triggerParts.push(
                        `這一局已見分曉：${myVerdict}。寫你對這個結果的真實反應——服氣或不服、得了什麼或失了什麼、下一步的打算`,
                    );
                }
                // Same open event + nothing new → don't re-narrate the same
                // moment (the duplicate-chapter bug).
                const eventKey = myEvent ? `${sceneId ?? ''}:${myEvent.label}` : null;
                const freshBeat =
                    Boolean(myTalk) ||
                    hasClosingVerdict ||
                    acts.some((a) => a.characterId === c.id && a.ok);
                if (eventKey && !freshBeat && lastPovEventByChar.get(c.id) === eventKey) {
                    tlog(`   · POV ${c.name} skipped (same event, no new beat)`);
                    return {
                        c,
                        r: {
                            ok: true,
                            chapter: '',
                            anchored: false,
                            recalledCount: 0,
                            skipReason: 'same_event_no_new_beat',
                        } satisfies Awaited<ReturnType<typeof runPovForCharacter>>,
                    };
                }
                const baseTrigger =
                    triggerParts.length > 0
                        ? `${dayLabel} — 今日，${triggerParts.join('；')}。請從你的視角，寫此刻你身在其中的一個具體場面：你看見誰、做了什麼、最在意什麼。不要複述事件，只寫你眼中的這一刻。`
                        : `${dayLabel} — 戲班又過了一段光景。請截取這個角色在此刻的一個具體場面：身在何處、看見誰或避開誰、手上正在做什麼、眼下有什麼利害。`;
                // §4d.2: only co-present contesters feel the mounting arc pressure.
                const feelsArc =
                    Boolean(arcAwareness) &&
                    c.id !== arcCentralId &&
                    rosterById.get(c.id)?.currentSceneId === arcCentralScene;
                const trigger = feelsArc ? `${baseTrigger}\n（${arcAwareness}）` : baseTrigger;
                const povState = {
                    hunger: 0.2,
                    fatigue: Math.min(1, dayFatigue + (freshBeat ? 0.1 : 0)),
                    mood: 0,
                };
                const r = await runPovForCharacter(admin, c.id, {
                    triggerNarrative: trigger,
                    forceRun: true,
                    dryRun: true,
                    closing: hasClosingVerdict,
                    dramaHint: dramaHints[c.id],
                    sceneBeats: sceneBeats.length > 0 ? sceneBeats : undefined,
                    rosterContext: rosterContextById.get(c.id),
                    rosterPeople: activeRoster.map((rp) => ({ name: rp.name, gender: rp.gender, role: rp.role })),
                    // Two recalls: 'pov' for serial continuity, 'life' for
                    // genesis-seeded non-work thickness. skipMemoryRecall because
                    // the tick owns recall (throttled SEAL budget).
                    recentMemorySnippets: [
                        ...new Set([
                            // Prior-chapter recalls skip their opening third: the
                            // prompt layer truncates snippets from the front, so a
                            // head slice hands the model last chapter's opening
                            // verbatim — the 承上-copy bug. A mid-window keeps the
                            // continuity detail without the copyable incipit.
                            ...(await memoryContext.recent(c.id, trigger, 4, 'pov')).map((m) =>
                                m.length > 280 ? m.slice(Math.floor(m.length * 0.3)) : m,
                            ),
                            ...(await memoryContext.recent(c.id, LIFE_QUERY, 2, 'life')),
                        ]),
                    ],
                    relationshipHints: await memoryContext.relationshipHints(c.id, 5),
                    planHint: await memoryContext.plan(c.id),
                    want: (() => {
                        const hot = povWantsBySaga
                            .filter((w) => !w.retired && w.characterId === c.id)
                            .sort((x, y) => y.weight * (1 - y.sat) - x.weight * (1 - x.sat))[0];
                        return hot ? { desc: hot.desc, target: hot.target } : undefined;
                    })(),
                    arcLine: povArcByCharId.get(c.id),
                    skipMemoryRecall: true,
                    state: povState,
                    // Own-character-only: never another character's row (character-secrets.ts).
                    innerSecret: getCharacterSecret(c.id),
                });
                tlog(`   · POV ${c.name} ✓ (${r.chapter?.length ?? 0} chars)`);
                dumpChapter(
                    {
                        kind: 'pov',
                        day: worldTime?.day,
                        name: c.name,
                        role: roleById.get(c.id),
                        scene: rosterById.get(c.id)?.currentSceneName,
                        dryRun,
                    },
                    r.chapter,
                );
                if (eventKey && r.ok && r.chapter?.trim()) lastPovEventByChar.set(c.id, eventKey);
                return { c, r };
            } catch (err) {
                tlog(`   · POV ${c.name} ✗`);
                return {
                    c,
                    r: {
                        ok: false,
                        chapter: '',
                        anchored: false,
                        recalledCount: 0,
                        error: err instanceof Error ? err.message : String(err),
                    } satisfies Awaited<ReturnType<typeof runPovForCharacter>>,
                };
            }
        });
        if (dryRun) {
            for (const { c, r } of generated) povs.push(mapPov(c, r));
        } else {
            const toAnchor = generated.filter(({ r }) => r.chapter.trim());
            for (const { c, r } of generated) {
                if (!r.chapter.trim()) povs.push(mapPov(c, r)); // generation failed
            }
            if (toAnchor.length > 0) tlog(`   anchoring chapters (${toAnchor.length}, one PTB)…`);
            const batch = await anchorPovChaptersBatch(
                admin,
                d.sagaId,
                toAnchor.map(({ c, r }) => {
                    const cSceneId = rosterById.get(c.id)?.currentSceneId;
                    // The on-chain event this chapter narrates; its id is the proof.
                    const ev = eventForChar(c.id, cSceneId);
                    const provenance: ChapterProvenance = {
                        v: 1,
                        day: worldTime?.day,
                        sceneId: cSceneId,
                        sceneName: rosterById.get(c.id)?.currentSceneName,
                        povCharacterId: c.id,
                        ...(ev
                            ? {
                                  eventKind: 'storylet',
                                  eventTemplate: ev.templateId,
                                  eventLabel: ev.label,
                                  eventTx: ev.digest,
                                  involvedIds: ev.characterIds,
                              }
                            : {}),
                    };
                    return { characterId: c.id, chapter: r.chapter, provenance };
                }),
            );
            const byChar = new Map(batch.map((b) => [b.characterId, b]));
            if (wantEngine) {
                const acc =
                    episodeDayBySaga.get(d.sagaId) ??
                    { lines: [], actorIds: new Set<string>(), sceneIds: [], povByName: new Map<string, string>() };
                for (const { c, r } of toAnchor) {
                    if (r.chapter.trim()) acc.povByName.set(c.name, r.chapter.trim().slice(0, 1100));
                }
                episodeDayBySaga.set(d.sagaId, acc);
            }
            for (const { c, r } of toAnchor) {
                const b = byChar.get(c.id);
                povs.push({
                    characterId: c.id,
                    name: c.name,
                    ok: b?.anchored ?? false,
                    anchored: b?.anchored ?? false,
                    chapter: r.chapter,
                    recalledCount: r.recalledCount,
                    commitmentId: b?.commitmentId,
                    digest: b?.digest,
                    error: b?.anchored ? undefined : b?.error,
                });
            }

            // 4.4 RELATIONSHIP EVOLVE (§2.1) — an LLM reads each event's POVs,
            //   infers directed feelings and seeds them on chain; cooling fades
            //   unreaffirmed ties. Owned-cap tx → serial cutJobs. Any co-present
            //   cast member is a valid edge target; needs ≥2 with POV prose.
            if (process.env.ES_RELATIONSHIP_EVOLVE !== '0') {
                const povByChar = new Map(
                    toAnchor.filter(({ r }) => r.chapter.trim()).map(({ c, r }) => [c.id, r.chapter.trim()]),
                );
                for (const st of storylets) {
                    if (!st.characterIds || st.characterIds.length < 2) continue;
                    // Include everyone the roster places in this scene, beyond the event's desirers.
                    const sceneCast = activeRoster
                        .filter((rp) => rp.currentSceneId === st.sceneId)
                        .map((rp) => rp.id);
                    const allIds = Array.from(new Set([...st.characterIds, ...sceneCast]));
                    // The contest-framed POV chapter buries the intimacy the scene
                    // actually enacted (a warm/act beat), so affection ties starve.
                    // Append each character's own enacted beats in THIS scene so the
                    // judge reads what played out, not just how the contest was framed.
                    const sceneBeats = getRecentSceneLines(st.sceneId, 40);
                    const participants = allIds.map((id) => {
                        const chapter = povByChar.get(id) ?? '';
                        const acted = sceneBeats
                            .filter(
                                (l) =>
                                    l.characterId === id &&
                                    (l.kind === 'act' || l.kind === 'warmth' || l.kind === 'social'),
                            )
                            .slice(0, 4)
                            .map((l) => l.text);
                        const pov = acted.length ? `${chapter}\n\n〔這場的實際舉止〕${acted.join('；')}` : chapter;
                        return { characterId: id, name: rosterById.get(id)?.name ?? id, pov };
                    });
                    if (participants.filter((p) => p.pov).length < 2) continue;
                    cutJobs.push(async () => {
                        const res = await evolveRelationshipsFromScene({
                            participants,
                            sceneId: st.sceneId,
                            eventLabel: st.label,
                        });
                        tlog(
                            `   ⤳ 關係演化 ← 〔${st.label}〕 seeded ${res.seeded}/${res.proposed}` +
                                (res.error ? ` err=${res.error}` : '') +
                                (res.skipReason ? ` skip=${res.skipReason}` : ''),
                        );
                    });
                }
            }

            // 4.6 ARC CONVERGENCE (§4d.2) — accumulate real pressing into forcing,
            //   judge each central beat, retire + spawn the aftermath on an
            //   irreversible answer. pressingCount is contester-count, never a tick index.
            if (arcConvergence) {
                try {
                    const framing =
                        storylets.find((s) => s.characterIds && s.characterIds.length >= 2)?.label ??
                        storylets[0]?.label ??
                        '';
                    const arc = await openArcIfNeeded(
                        d.sagaId,
                        framing,
                        activeRoster.map((r) => r.name),
                        (n) => activeRoster.find((r) => r.name === n)?.id,
                    );
                    if (arc) {
                        const centralSceneId = rosterById.get(arc.centralCharId)?.currentSceneId;
                        const pressingCount = centralSceneId
                            ? activeRoster.filter((r) => r.currentSceneId === centralSceneId && r.id !== arc.centralCharId).length
                            : 0;
                        const centralBeat = toAnchor.find(({ c }) => c.id === arc.centralCharId)?.r.chapter?.trim() ?? '';
                        const step = await stepArc(d.sagaId, pressingCount, centralBeat);
                        if (step) {
                            tlog(
                                `   ⟐ arc〔${step.question.slice(0, 22)}〕壓力${step.pressure.toFixed(1)}·逼${step.forcing}` +
                                    (step.retired
                                        ? ` → 答「${step.retired.answer}」退役` +
                                          (step.retired.aftermath ? `，牽出「${step.retired.aftermath.question.slice(0, 22)}」` : '')
                                        : ''),
                            );
                        }
                    }
                } catch (err) {
                    console.warn('[tick-loop] arc convergence failed:', err);
                }
            }

            // 4.5 EVENT CUT — weave the event's POVs into the canonical chapter
            //   (docs/narrative/CONTENT_PIPELINE.md §2). The cut is the commercial unit;
            //   POVs stay the per-character raw feed.
            if (input.eventChapter ?? true) {
                const povsFor = (st: TickStoryletResult) => {
                    const castSet = new Set(st.characterIds);
                    return toAnchor
                        .filter(({ c, r }) => castSet.has(c.id) && r.chapter.trim())
                        .map(({ c, r }) => {
                            const role = roleById.get(c.id);
                            return {
                                characterId: c.id,
                                characterName: c.name,
                                role: role && role !== '—' ? role : undefined,
                                body: r.chapter,
                            };
                        });
                };
                // Spine mode accumulates POVs under the event's stable id; a
                // non-spine storylet weaves immediately.
                for (const st of storylets) {
                    if (!st.opened) continue;
                    const cutPovs = povsFor(st);
                    // [ch-diag] accumulate: what material each live event gathered this tick.
                    console.log(
                        `[ch-diag] accumulate event=${(st.digest ?? 'none').slice(0, 10)} day=${worldTime?.day ?? '?'} ` +
                            `mode=${spineMode ? 'spine' : 'immediate'} tmpl=${st.templateId} cast=${st.characterIds.length} ` +
                            `povThisTick=${cutPovs.length} voicesThisTick=${new Set(cutPovs.map((p) => p.characterId)).size} ` +
                            `scene="${st.sceneName}"`,
                    );
                    if (spineMode && spineCtx && st.digest) {
                        spineAccumulatePovs(st.digest, cutPovs);
                    } else if (cutPovs.length >= 2) {
                        cutJobs.push(async () => {
                            const cut = await compileEventChapterAction({
                                sceneId: st.sceneId,
                                sceneName: st.sceneName,
                                eventTx: st.digest,
                                eventLabel: st.label,
                                day: worldTime?.day,
                                povs: cutPovs,
                                rosterPeople: activeRoster.map((rp) => ({ name: rp.name, gender: rp.gender, role: rp.role })),
                            });
                            console.log(
                                `[tick-loop] event cut (${st.templateId}): povCount=${cut.povCount}` +
                                    ` anchored=${cut.anchored}` +
                                    (cut.skipReason ? ` skipped=${cut.skipReason}` : '') +
                                    (cut.error ? ` error=${cut.error}` : ''),
                            );
                            dumpChapter(
                                { kind: 'cut', day: worldTime?.day, name: st.sceneName, note: st.label, dryRun },
                                cut.chapter,
                            );
                        });
                    }
                }
            }
        }
    } else {
        tlog(`④ POV skipped (pov=false)`);
    }

    // SPINE RESOLVE + SETTLE — runs regardless of POV/eventChapter: settlement is
    // a chain-state operation and must never be gated on narration (a pov=false
    // tick must still resolve and transfer). If no POVs accumulated, the weave is
    // simply empty while the settle still lands.
    if (spineMode && spineCtx) {
        const ctx = spineCtx;
        // [ch-diag] tick: one-line per-tick spine census.
        const count = (a: SpineStep['action']) => spineSteps.filter((s) => s.action === a).length;
        console.log(
            `[ch-diag] tick day=${worldTime?.day ?? '?'} mode=spine live=${storylets.length} ` +
                `open=${count('open')} continue=${count('continue')} resolve=${count('resolve')} idle=${count('idle')}`,
        );
        for (const step of spineSteps) {
            if (step.action !== 'resolve') continue;
            const s = step;
            cutJobs.push(async () => {
                await spineResolveAndWeave(admin, ctx, s, worldTime?.day);
            });
        }
    } else if (!spineMode) {
        console.log(
            `[ch-diag] tick day=${worldTime?.day ?? '?'} mode=immediate live=${storylets.length}`,
        );
    }

    // 4.7 ENCOUNTER — one autonomous relationship chapter per tick for the
    //   strongest co-present bonded pair. Generated dry here; the anchor is
    //   pushed into serial `cutJobs` so it can't race the other owned-cap txs.
    if ((input.pov ?? true) && slice.length >= 2) {
        try {
            const pair = await pickEncounterPair(
                slice,
                (id) => rosterById.get(id)?.currentSceneId,
                (id) => rosterById.get(id)?.name ?? nameById.get(id),
            );
            if (!pair) {
                // No qualifying co-present bonded pair this tick — quiet skip.
            } else if (lastEncounterPair === pair.pairKey) {
                tlog(`④· encounter skipped (cooldown: ${pair.otherName}・${pair.toneZh} same pair back-to-back)`);
            } else {
                const holder = slice.find((c) => c.id === pair.holderId);
                const holderName = holder?.name ?? rosterById.get(pair.holderId)?.name ?? '某人';
                // CONFESS branch — a strong, not-yet-confessed romance pair: the
                // holder may self-decide to say it now; otherwise the usual encounter.
                let trigger = buildEncounterTrigger(pair, dayLabel);
                let isConfession = false;
                if (
                    pair.tone === 'romance' &&
                    pair.count >= CONFESS_MIN_TIES &&
                    !confessedPairs.has(pair.pairKey)
                ) {
                    // The encounter is by definition a two-person private beat, so
                    // confession judges depth + willingness, not who else is around.
                    const decision = await characterAgent.decideConfessAction({
                        name: holderName,
                        role: roleById.get(pair.holderId) ?? '—',
                        toName: pair.otherName,
                        toRole: roleById.get(pair.otherId) ?? '—',
                        relationship: `戀慕很深（牽連 ${pair.count}），這份心思你揣了很久。`,
                        situation: `散場後安靜的時分，此刻你與${pair.otherName}恰好獨處一隅，沒有外人。`,
                    });
                    if (decision.confess) {
                        trigger = buildConfessTrigger(pair, dayLabel, decision.opening ?? '', decision.motive);
                        isConfession = true;
                        confessedPairs.add(pair.pairKey);
                        tlog(
                            `④· confess: ${holderName} → ${pair.otherName} ✓「${(decision.opening || decision.motive).slice(0, 28)}」`,
                        );
                    } else {
                        tlog(`④· confess held: ${holderName} → ${pair.otherName}（${decision.motive.slice(0, 22)}）`);
                    }
                }
                const enc = await runPovForCharacter(admin, pair.holderId, {
                    triggerNarrative: trigger,
                    mode: 'encounter',
                    forceRun: true,
                    dryRun: true,
                    rosterContext: rosterContextById.get(pair.holderId),
                    rosterPeople: activeRoster.map((rp) => ({ name: rp.name, gender: rp.gender, role: rp.role })),
                    relationshipHints: await memoryContext.relationshipHints(pair.holderId, 5),
                    // Own-character-only: never another character's row (character-secrets.ts).
                    innerSecret: getCharacterSecret(pair.holderId),
                });
                if (enc.ok && enc.chapter?.trim()) {
                    lastEncounterPair = pair.pairKey;
                    // Warmth beat → the handscroll's living stream: a short
                    // opening clause of the relationship chapter.
                    if (!dryRun) {
                        const warm = enc.chapter
                            .replace(/^#{1,6}\s.*$/m, '')
                            .trim()
                            .split(/[。！？\n]/)[0]
                            ?.replace(/\s+/g, '')
                            .slice(0, 22);
                        recordSceneLine(rosterById.get(pair.holderId)?.currentSceneId, pair.holderId, warm, 'warmth');
                    }
                    dumpChapter(
                        {
                            kind: 'encounter',
                            day: worldTime?.day,
                            name: holderName,
                            role: roleById.get(pair.holderId),
                            scene: rosterById.get(pair.holderId)?.currentSceneName,
                            note: isConfession
                                ? `向 ${pair.otherName} 表明心意 · ${pair.toneZh}（牽連 ${pair.count}）`
                                : `與 ${pair.otherName} · ${pair.toneZh}（牽連 ${pair.count}）`,
                            dryRun,
                        },
                        enc.chapter,
                    );
                    tlog(
                        `④· ${isConfession ? '攤牌' : 'encounter'}: ${holderName} ⇄ ${pair.otherName} (${pair.toneZh}・ties ${pair.count})` +
                            ` ✓ (${enc.chapter.length} chars)${dryRun ? ' (preview, not anchored)' : ''}`,
                    );
                    // Anchor in the background, serial with the other owned-cap jobs.
                    if (!dryRun) {
                        const chapter = enc.chapter;
                        const holderId = pair.holderId;
                        cutJobs.push(async () => {
                            const a = await anchorPovChapter(admin, holderId, d.sagaId, chapter);
                            console.log(
                                `[tick-loop] encounter (${pair.toneZh}): anchored=${a.anchored}` +
                                    (a.commitmentId ? ` commitment=${a.commitmentId}` : '') +
                                    (a.error ? ` error=${a.error}` : ''),
                            );
                        });
                    }
                } else {
                    tlog(`④· encounter skipped (generation failed${enc.error ? `: ${enc.error}` : ''})`);
                }
            }
        } catch (err) {
            console.warn('[tick-loop] encounter phase failed:', err);
        }
    }

    // Drain the captured StorytellerCap jobs SERIALLY (moment → cut), inline —
    // after() never fires inside the /api/tick mutex's detached promise chain.
    // Serial order preserves the single-cap object-version invariant; each job
    // is failure-isolated and timeout-bounded.
    if (!dryRun && (momentJobs.length > 0 || cutJobs.length > 0)) {
        tlog(`⑤′ inline background jobs: ${momentJobs.length} moment + ${cutJobs.length} cut/anchor…`);
        for (const job of momentJobs) {
            await runJobWithTimeout(job, MOMENT_JOB_TIMEOUT_MS, 'event moment', (err) =>
                console.warn('[tick-loop] event moment failed:', err),
            );
        }
        for (const job of cutJobs) {
            await runJobWithTimeout(job, CUT_JOB_TIMEOUT_MS, 'event cut', (err) =>
                console.warn('[tick-loop] event cut failed:', err),
            );
        }
    }

    // 5. REFLECT — periodic sleep / consolidation. Characters sleep at NIGHT,
    //    not every tick (Generative-Agents reflection is periodic, not per-
    //    tick — answering "should they all sleep every tick?": no). Sleep
    //    anchors via reflection::submit (Sui signing) → serial.
    //    (isNight is already derived above from the day-part labels — dev's
    //     label-based check is the same #75 fix, so it is not re-derived here.)
    const sleeps: TickSleepResult[] = [];
    let sleepNote: string | undefined;
    // Want engine: fatigue-driven gate (§2.19) — night lowers the bar, high day
    // fatigue can nap; memory floor stays inside runSleepAction. Derived fatigue
    // (approach iii): fresh at dawn, tired by day's end.
    const sleepFatigue = worldTime
        ? 0.15 + (worldTime.ticksPerDay > 1 ? worldTime.tickOfDay / (worldTime.ticksPerDay - 1) : 0.5) * 0.7
        : 0.3;
    const sleepGate = wantEngine
        ? sleepFatigue >= (isNight ? runnerWorker.NIGHT_SLEEP_FATIGUE : runnerWorker.DAY_SLEEP_FATIGUE)
        : isNight;
    if ((input.sleep ?? true) && !dryRun) {
        if (sleepGate) {
            tlog(`⑤ sleep consolidation (night)…`);
            for (const c of slice) {
                const r = await runSleepAction(c.id);
                if (r.anchored) tlog(`   · ${c.name} settled ${r.reflections?.length ?? 0} reflection(s)`);
                sleeps.push({
                    characterId: c.id,
                    name: c.name,
                    ok: r.ok,
                    reflections: r.reflections,
                    anchored: r.anchored,
                    skipReason: r.skipReason,
                    error: r.error,
                });
            }
        } else {
            sleepNote = wantEngine
                ? `疲勞未到（${sleepFatigue.toFixed(2)}，現為 ${worldTime?.partOfDay ?? '未知'}）— 還撐得住`
                : `非夜晚（現為 ${worldTime?.partOfDay ?? '未知'}），角色不整理記憶 — 推進到夜裡再睡`;
            tlog(wantEngine ? `⑤ sleep skipped (fatigue ${sleepFatigue.toFixed(2)} below bar)` : `⑤ sleep skipped (not night)`);
        }
    }

    // 6. NARRATE — compile the objective gazette, once per day: only the day's
    //    final tick compiles (compiling every tick produced near-identical gazettes).
    let gazette: TickGazetteResult | undefined;
    const isDayEnd = !worldTime || worldTime.tickOfDay >= worldTime.ticksPerDay - 1;
    if ((input.gazette ?? true) && !dryRun && !isDayEnd) {
        tlog(
            `⑥ gazette skipped (one per day; tick ${(worldTime?.tickOfDay ?? 0) + 1}/${worldTime?.ticksPerDay} today, compiled at day's end)`,
        );
    }
    // 5.5 EPISODE — at day's end the storyteller compresses the day's beats into
    //   ONE follow-along 回 with a 回目 title and an in-plot hook (presentation
    //   layer: it may compress and spotlight, never decide). Anchored through the
    //   es:cut channel as kind:'episode' (full-scan read → no read-window loss).
    if (wantEngine && !dryRun && isDayEnd) {
        try {
            const acc = episodeDayBySaga.get(d.sagaId);
            if (acc && acc.lines.length >= 3) {
                const wantsNow = loadWants(d.sagaId);
                const tensionLines = wantsNow
                    .filter((w) => !w.retired)
                    .sort((a, b) => b.weight * (1 - b.sat) - a.weight * (1 - a.sat))
                    .slice(0, 6)
                    .map((w) => `${nameById.get(w.characterId) ?? '某人'}：${w.desc}`);
                const prose = await runnerEventChapter.composeEpisode({
                    day: worldTime?.day ?? 0,
                    materialLines: acc.lines,
                    tensionLines,
                    povTexts: [...acc.povByName.entries()].map(([name, text]) => ({ name, text })),
                    etiquette: narrativeProfile?.etiquette,
                    soul: narrativeProfile?.soul,
                });
                if (prose) {
                    const withHeader = runnerEventChapter.embedCutHeader(prose, {
                        v: 1,
                        kind: 'episode',
                        day: worldTime?.day,
                        sceneId: acc.sceneIds[0],
                        sceneName: acc.sceneIds[0] ? sceneNameById.get(acc.sceneIds[0]) : undefined,
                        povCharacterIds: [...acc.actorIds],
                    });
                    try {
                        const anchor = await withAdminLock(() =>
                            signAndAnchor({
                                sagaId: d.sagaId,
                                subjectId: acc.sceneIds[0] ?? d.sagaId,
                                content: new TextEncoder().encode(withHeader),
                                contentType: 'text/markdown',
                                signer: admin.signer,
                            }),
                        );
                        tlog(`⑤⁵ episode anchored: ${prose.split('\n')[0]} (${prose.length} chars, ${anchor.commitmentId?.slice(0, 10)}…)`);
                    } catch (err) {
                        tlog(`⑤⁵ episode anchor failed (kept as dump): ${err instanceof Error ? err.message : err}`);
                    }
                    dumpChapter({ kind: 'cut', day: worldTime?.day, name: 'episode' }, prose);
                    episodeDayBySaga.delete(d.sagaId);
                }
            } else {
                tlog(`⑤⁵ episode skipped (day material ${acc?.lines.length ?? 0} lines)`);
            }
        } catch (err) {
            console.warn('[tick-loop] episode failed:', err);
        }
    }

    if ((input.gazette ?? true) && !dryRun && isDayEnd) {
        tlog(`⑥ compile gazette…`);
        const g = await compileGazetteAction({ day: worldTime?.day });
        gazette = {
            ok: g.ok,
            eventCount: g.eventCount,
            chapterCount: g.chapterCount,
            anchored: g.anchored,
            skipReason: g.skipReason,
            blobId: g.blobId,
            digest: g.digest,
            error: g.error,
        };
    }

    // Carry this tick's resolutions forward so next tick's PERCEIVE feeds them
    // as news — the delta that lets a plan respond instead of looping.
    if (situationPerceive) {
        const resolvedLite = resolves
            .filter((r) => r.ok)
            .map((r) => ({
                eventId: r.eventId,
                label:
                    storylets.find((s) => (r.participants ?? []).some((p) => s.characterIds.includes(p)))?.label ??
                    '一場爭奪',
                winner: r.winnerId ? (nameById.get(r.winnerId) ?? null) : null,
                stake: '',
                participants: r.participants ?? [],
            }));
        stashTickResolved(d.sagaId, resolvedLite);
    }

    const anyOk =
        plans.some((p) => p.ok) ||
        moves.some((m) => m.ok) ||
        socials.some((s) => s.ok && s.kind !== 'idle') ||
        acts.some((a) => a.ok) ||
        resolves.some((r) => r.ok) ||
        povs.some((p) => p.ok) ||
        sleeps.some((s) => s.ok && !s.skipReason) ||
        gazette?.ok === true;
    tlog(
        `◇ tick complete — plan ${plans.length} · move ${moves.filter((m) => m.ok && m.toSceneId).length} · talk ${socials.filter((s) => s.ok && s.kind !== 'idle').length} · act ${acts.filter((a) => a.ok).length} · chapter ${povs.filter((p) => p.anchored).length} · gazette ${gazette?.anchored ? '✓' : '—'}`,
    );
    const memoryWarnings = drainMemoryWarnings();
    return {
        ok: anyOk || (slice.length === 0),
        advanced,
        worldTime,
        plans,
        moves,
        drama,
        storylet: storylets[0],
        storylets,
        socials,
        asks,
        gives,
        settle,
        acts,
        resolves,
        povs,
        sleeps,
        sleepNote,
        gazette,
        memoryWarnings,
        memoryDegraded: memoryWarnings.length > 0,
    };
}

