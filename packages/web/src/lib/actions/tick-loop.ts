'use server';

/**
 * N4 — autonomous tick loop. One press = the saga lives one tick on its own.
 *
 * This is the integrative step (docs/NARRATIVE_AGENTS.md §6): it chains the
 * pieces N1–N3 + R-era services into a single self-driving pass, in order:
 *
 *   1. ADVANCE   World tick moves (narrative time) — unless dry-run.
 *   2. ACT       Every character in an open event PLAYS its hand on its own
 *                (N1 decideCardPlay → submit_action). The world acts without
 *                an admin clicking each card.
 *   3. PRODUCE   Each character writes a day-aware POV chapter (subscriber-
 *                gated unless forced) — recall + relationships threaded in.
 *   4. REFLECT   Periodic sleep (N2): consolidate scattered memories into
 *                dense anchored reflections so recall doesn't degrade.
 *   5. NARRATE   Compile the objective gazette for the day (director side).
 *
 * Sequential throughout — one admin keypair can't sign in parallel without
 * object-version conflicts on the shared StorytellerCap. Demo driver is the
 * SchedulerPanel button; a standalone CLI can call this on an interval.
 *
 * Dry-run produces POV prose only (steps that mutate chain are skipped),
 * matching the existing daily-batch "preview" semantics.
 */

import { Transaction } from '@mysten/sui/transactions';
import type { Character, Scene } from '@endless-story/shared';
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
    tx as endlessTx,
} from '@endless-story/sdk';
import { characterAgent } from '@endless-story/runner';
import { getAdminContext, type AdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { runPovForCharacter, anchorPovChaptersBatch } from '@/lib/chain/pov-core';
import { deriveAndCommitDramaBeat, tensionFraction } from '@/lib/chain/drama';
import {
    recallCurrentPlanText,
    recallForCharacter,
    rememberForCharacter,
} from '@/lib/chain/memory';
import { fetchOnChainScenesForSaga } from '@/lib/chain/scene-read';
import { recordSceneLine } from '@/lib/chain/scene-lines';
import { fetchRelationshipHints } from '@/lib/chain/relationships';
import {
    buildSagaRoster,
    rosterLines,
    type SagaRosterEntry,
} from '@/lib/chain/roster';
import { charactersApi } from '@/lib/api/index';
import {
    advanceTickAction,
    getWorldTimeSnapshot,
    type WorldTimeSnapshot,
} from './world-time';
import { runCharacterTurnAction } from './character-turn';
import { runSleepAction } from './sleep';
import { runPlanAction } from './plan';
import { compileGazetteAction } from './compile-gazette';

/**
 * Max characters whose memory-recall work (PLAN / MOVE / ACT decide / POV)
 * runs at once. Each recall SEAL-decrypts ~18 blobs against a SHARED key
 * server + Walrus aggregator; an all-at-once burst across the cast 429s them
 * and recall silently returns empty. 2 keeps a real speedup without tripping
 * the limit; drop to 1 via MEMWAL_RECALL_CONCURRENCY if the relayer is tight
 * (e.g. running the world-loop continuously), raise it off the staging relayer.
 */
const RECALL_CONCURRENCY = Math.max(
    1,
    Number(process.env.MEMWAL_RECALL_CONCURRENCY) || 2,
);

export interface TickLoopInput {
    /** Advance a tick before the pass. Default true (ignored on dry-run). */
    advance?: boolean;
    /** Cap characters processed for POV/sleep (LLM cost guard). Default 6. */
    maxCharacters?: number;
    /** Update each character's standing plan first (N6). Default true. */
    plan?: boolean;
    /** Let idle characters walk between scenes toward their goals. Default true. */
    move?: boolean;
    /** Run the consolidation/sleep pass. Default true. */
    sleep?: boolean;
    /** Compile the gazette at the end. Default true. */
    gazette?: boolean;
    /** Auto-resolve (judge) an event once every participant has acted.
     *  Default true — events conclude on their own (N5). */
    autoResolve?: boolean;
    /** Preview: produce POV prose but don't advance / act / anchor. */
    dryRun?: boolean;
}

export interface TickActResult {
    eventId: string;
    characterId: string;
    name?: string;
    ok: boolean;
    cardLabel?: string;
    intent?: string;
    skipped?: boolean;
    error?: string;
}

export interface TickPovResult {
    characterId: string;
    name: string;
    ok: boolean;
    anchored: boolean;
    skipReason?: string;
    chapter?: string;
    recalledCount?: number;
    commitmentId?: string;
    digest?: string;
    error?: string;
}

export interface TickPlanResult {
    characterId: string;
    name: string;
    ok: boolean;
    longTermGoal?: string;
    dailyPlanHint?: string;
    hadPrevious?: boolean;
    error?: string;
}

export interface TickResolveResult {
    eventId: string;
    ok: boolean;
    digest?: string;
    error?: string;
}

export interface TickMoveResult {
    characterId: string;
    name: string;
    ok: boolean;
    fromSceneId?: string;
    toSceneId?: string;
    toSceneName?: string;
    reason?: string;
    error?: string;
}

export interface TickSocialResult {
    characterId: string;
    name: string;
    ok: boolean;
    kind: 'observe' | 'talk' | 'idle';
    targetCharacterId?: string;
    targetName?: string;
    line?: string;
    observation?: string;
    relationshipMemory?: string;
    reason?: string;
    error?: string;
}

export interface TickSleepResult {
    characterId: string;
    name: string;
    ok: boolean;
    reflections?: string[];
    anchored?: boolean;
    skipReason?: string;
    error?: string;
}

export interface TickGazetteResult {
    ok: boolean;
    eventCount: number;
    chapterCount: number;
    anchored: boolean;
    skipReason?: string;
    blobId?: string;
    digest?: string;
    error?: string;
}

/** DR-6 — drama-engine tension derived this tick from the on-chain ledger. */
export interface TickDramaResult {
    /** true when contested resources existed and tension was derived. */
    active: boolean;
    /** number of contested resources read. */
    resourceCount: number;
    /** why drama was dormant (when active === false), e.g. 'no-resources'. */
    skipped?: string;
    /** commitment id of the self-verifying beat anchored on chain (real runs). */
    commitmentId?: string;
    /** top tension rows for the UI (capped), highest-first. */
    top?: { characterId: string; name?: string; statement: string; tension: number }[];
}

export interface TickLoopResult {
    ok: boolean;
    advanced: boolean;
    worldTime?: WorldTimeSnapshot;
    plans: TickPlanResult[];
    moves: TickMoveResult[];
    /** DR-6: scarce-resource tension derived (+ committed) before decisions. */
    drama?: TickDramaResult;
    socials: TickSocialResult[];
    acts: TickActResult[];
    resolves: TickResolveResult[];
    povs: TickPovResult[];
    sleeps: TickSleepResult[];
    /** Set when sleep was enabled but skipped (e.g. not night yet). */
    sleepNote?: string;
    gazette?: TickGazetteResult;
    error?: string;
}

export async function runTickLoopAction(input: TickLoopInput = {}): Promise<TickLoopResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return {
            ok: false,
            advanced: false,
            plans: [],
            moves: [],
            socials: [],
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
            acts: [],
            resolves: [],
            povs: [],
            sleeps: [],
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    const dryRun = input.dryRun ?? false;
    const cap = input.maxCharacters ?? 6;
    const t0 = Date.now();
    const since = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
    const tlog = (m: string) => console.log(`[tick ${since()}] ${m}`);
    tlog(`◆ 開始一輪${dryRun ? '（dry-run）' : ''}`);

    // 1. ADVANCE (chain mutation — skipped on dry-run).
    let advanced = false;
    if ((input.advance ?? true) && !dryRun) {
        const adv = await advanceTickAction();
        advanced = adv.ok;
    }
    const worldTime = (await getWorldTimeSnapshot()) ?? undefined;
    const dayLabel = worldTime ? `第 ${worldTime.day} 日 · ${worldTime.partOfDay}` : '某日';
    tlog(`⏱  ${advanced ? '已推進 → ' : ''}${dayLabel}`);

    // Character roster (saga-scoped, with fallback).
    let characters: Character[] = await charactersApi.listSagaCharacters(d.sagaId).catch(() => []);
    if (characters.length === 0) {
        characters = await charactersApi.listCharacters().catch(() => []);
    }
    const nameById = new Map(characters.map((c) => [c.id, c.name]));
    const slice = characters.slice(0, cap);
    const scenes = await fetchOnChainScenesForSaga(d.sagaId).catch(() => []);
    const roster = await buildSagaRoster(d.sagaId, { characters, scenes }).catch(
        () => [] as SagaRosterEntry[],
    );
    let activeScenes = scenes;
    let activeRoster = roster;
    let rosterById = new Map(activeRoster.map((r) => [r.id, r]));
    let roleById = new Map(activeRoster.map((r) => [r.id, r.role || '—']));
    let rosterContextById = buildRosterContextById(slice, activeRoster);
    tlog(`登場 ${slice.length} 角色：${slice.map((c) => c.name).join('、')}`);

    // 2. PLAN — each character updates its standing goal first (N6), so the
    //    fresh plan is recalled by the decide/POV steps below. PLAN does NO
    //    Sui signing (MemWal reads + writes only). Run with BOUNDED
    //    concurrency: each plan SEAL-decrypts a recall, and the shared SEAL
    //    key server / Walrus aggregator 429s under an all-at-once burst.
    const plans: TickPlanResult[] = [];
    if (input.plan ?? true) {
        tlog(`① 規劃 ${slice.length} 角色…`);
        const settled = await mapPool(slice, RECALL_CONCURRENCY, async (c) => {
            try {
                const p = await runPlanAction(c.id, {
                    dryRun,
                    rosterContext: rosterContextById.get(c.id),
                });
                tlog(`   · 規劃 ${c.name} ✓`);
                return { c, p };
            } catch (err) {
                tlog(`   · 規劃 ${c.name} ✗`);
                return {
                    c,
                    p: { ok: false, error: err instanceof Error ? err.message : String(err) },
                };
            }
        });
        for (const { c, p } of settled) {
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

    // 2.5 MOVE — idle characters walk toward their goals (autonomous
    //    movement completes the N1 action space). Batched into one PTB.
    const moves: TickMoveResult[] = [];
    if (input.move ?? true) {
        tlog(`② 自主移動…`);
        try {
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
                    dryRun,
                })),
            );
            tlog(`   移動 ${moves.filter((m) => m.ok).length} 人${dryRun ? '（預演）' : ''}`);
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

    // 2.7 DRAMA — derive each character's tension over scarce, CONTESTED
    //    on-chain resources (DR-6), and commit a self-verifying beat. The
    //    SUPPLY (who holds the slot) is on chain; the DEMAND (how badly each
    //    character aches for it) is recomputed deterministically here. The
    //    returned hints steer decide + POV toward what each character LACKS,
    //    not just what the scene offers. Dormant no-op until resource.move is
    //    deployed + resources instantiated — never blocks the tick.
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
                signer: dryRun ? undefined : admin.signer, // dry-run = derive, don't anchor
            });
            dramaHints = r.hints;
            drama = {
                active: r.active,
                resourceCount: r.resourceCount,
                skipped: r.skipped,
                commitmentId: r.commitmentId,
                top: r.tensions.slice(0, 6).map((t) => ({
                    characterId: t.agentId,
                    name: nameById.get(t.agentId),
                    statement: t.statement,
                    tension: tensionFraction(t.value),
                })),
            };
            if (r.active) {
                tlog(
                    `②′ 張力推導：${r.resourceCount} 個爭用資源 · ${Object.keys(r.hints).length} 人有張力${r.commitmentId ? ' · 已上鏈承諾' : ''}`,
                );
            }
        } catch (err) {
            console.warn('[tick-loop] drama phase failed:', err);
        }
    }

    // 2.8 SOCIAL — idle, same-scene lightweight observation / talk. This
    // writes subjective observations/relationship memories (unless dry-run),
    // which the next POV can recall without turning Director facts into
    // private feelings.
    const socials: TickSocialResult[] = [];
    if (slice.length > 0) {
        tlog(`②″ 輕量互動…`);
        try {
            socials.push(
                ...(await runSocialPhase({
                    sagaId: d.sagaId,
                    slice,
                    scenes: activeScenes,
                    rosterById,
                    roleById,
                    dramaHints,
                    dryRun,
                })),
            );
            tlog(`   互動 ${socials.filter((s) => s.ok && s.kind !== 'idle').length} 件${dryRun ? '（預演）' : ''}`);
        } catch (err) {
            console.warn('[tick-loop] social phase failed:', err);
        }
    }

    // 3. ACT — characters play their own hands in open events; events that
    //    everyone has acted in auto-resolve (judge). Chain mutation → serial
    //    (single StorytellerCap, no parallel signing).
    const acts: TickActResult[] = [];
    const resolves: TickResolveResult[] = [];
    if (!dryRun) {
        tlog(`③ 出牌決策 + 收尾…`);
        try {
            const phase = await runActPhase(
                admin,
                d.sagaId,
                d.storytellerCapId,
                nameById,
                input.autoResolve ?? true,
                dramaHints,
                rosterContextById,
            );
            acts.push(...phase.acts);
            resolves.push(...phase.resolves);
            tlog(`   出牌 ${acts.filter((a) => a.ok).length} · 收尾 ${resolves.filter((r) => r.ok).length}`);
        } catch (err) {
            // Non-fatal: a failed ACT phase shouldn't block POV/narrate.
            console.warn('[tick-loop] act phase failed:', err);
        }
    }

    // 4. PRODUCE — POV chapter per character.
    //    Dry-run does NO chain writes → generate every chapter CONCURRENTLY
    //    (this is the big preview speedup). A real run anchors via
    //    commitment::commit (Sui signing) → must stay serial.
    const trigger = `${dayLabel} — 戲班又過了一段光景。請截取這個角色在此刻的一個具體場面：他身在何處、看見誰或避開誰、手上正在做什麼、眼下有什麼利害。`;
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
    const povs: TickPovResult[] = [];
    // Generate chapters with BOUNDED concurrency (each recalls memory →
    // SEAL decrypt; an unbounded burst 429s the key server), then — for a
    // real run — anchor them ALL IN ONE PTB (one signature). Generation is
    // the slow part (primary LLM); the anchor is now a single transaction.
    // Per-item try/catch so one bad recall (e.g. aggregator DNS blip) can't
    // reject the whole batch and kill the tick.
    tlog(`④ POV 生成 ${slice.length} 篇（慢，每篇一段 LLM）…`);
    const generated = await mapPool(slice, RECALL_CONCURRENCY, async (c) => {
        try {
            const r = await runPovForCharacter(admin, c.id, {
                triggerNarrative: trigger,
                forceRun: true,
                dryRun: true,
                dramaHint: dramaHints[c.id],
                rosterContext: rosterContextById.get(c.id),
            });
            tlog(`   · POV ${c.name} ✓ (${r.chapter?.length ?? 0} 字)`);
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
        if (toAnchor.length > 0) tlog(`   章回上鏈（${toAnchor.length} 篇，一個 PTB）…`);
        const batch = await anchorPovChaptersBatch(
            admin,
            d.sagaId,
            toAnchor.map(({ c, r }) => ({ characterId: c.id, chapter: r.chapter })),
        );
        const byChar = new Map(batch.map((b) => [b.characterId, b]));
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
    }

    // 5. REFLECT — periodic sleep / consolidation. Characters sleep at NIGHT,
    //    not every tick (Generative-Agents reflection is periodic, not per-
    //    tick — answering "should they all sleep every tick?": no). Sleep
    //    anchors via reflection::submit (Sui signing) → serial.
    const isNight = worldTime?.partOfDay === 'night';
    const sleeps: TickSleepResult[] = [];
    let sleepNote: string | undefined;
    if ((input.sleep ?? true) && !dryRun) {
        if (isNight) {
            tlog(`⑤ 睡眠整理（夜）…`);
            for (const c of slice) {
                const r = await runSleepAction(c.id);
                if (r.anchored) tlog(`   · ${c.name} 沉澱 ${r.reflections?.length ?? 0} 條`);
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
            sleepNote = `非夜晚（現為 ${worldTime?.partOfDay ?? '未知'}），角色不整理記憶 — 推進到夜裡再睡`;
            tlog(`⑤ 睡眠跳過（非夜晚）`);
        }
    }

    // 6. NARRATE — compile the objective gazette for the day.
    let gazette: TickGazetteResult | undefined;
    if ((input.gazette ?? true) && !dryRun) {
        tlog(`⑥ 編公報…`);
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
        `◇ 本輪完成 — 規劃${plans.length}·移動${moves.filter((m) => m.ok).length}·互動${socials.filter((s) => s.ok && s.kind !== 'idle').length}·出牌${acts.filter((a) => a.ok).length}·章回${povs.filter((p) => p.anchored).length}·公報${gazette?.anchored ? '✓' : '—'}`,
    );
    return {
        ok: anyOk || (slice.length === 0),
        advanced,
        worldTime,
        plans,
        moves,
        drama,
        socials,
        acts,
        resolves,
        povs,
        sleeps,
        sleepNote,
        gazette,
    };
}

function buildRosterContextById(
    slice: Character[],
    roster: SagaRosterEntry[],
): Map<string, string[]> {
    return new Map(
        slice.map((c) => [c.id, rosterLines(roster.filter((r) => r.id !== c.id), 12)]),
    );
}

function applyMoveResultsToScenes(scenes: Scene[], moves: TickMoveResult[]): Scene[] {
    const applied = moves.filter((m) => m.ok && m.fromSceneId && m.toSceneId);
    if (applied.length === 0) return scenes;
    const byId = new Map(scenes.map((scene) => [
        scene.id,
        { ...scene, currentCharacterIds: [...(scene.currentCharacterIds ?? [])] },
    ]));
    for (const move of applied) {
        const from = byId.get(move.fromSceneId as string);
        const to = byId.get(move.toSceneId as string);
        if (!from || !to) continue;
        from.currentCharacterIds = from.currentCharacterIds.filter((id) => id !== move.characterId);
        if (!to.currentCharacterIds.includes(move.characterId)) {
            to.currentCharacterIds.push(move.characterId);
        }
    }
    return scenes.map((scene) => byId.get(scene.id) ?? scene);
}

function applyMoveResultsToRoster(
    roster: SagaRosterEntry[],
    scenes: Scene[],
    moves: TickMoveResult[],
): SagaRosterEntry[] {
    const moved = new Set(moves.filter((m) => m.ok && m.toSceneId).map((m) => m.characterId));
    if (moved.size === 0) return roster;
    const sceneByChar = new Map<string, { id: string; name: string }>();
    for (const scene of scenes) {
        for (const cid of scene.currentCharacterIds ?? []) {
            sceneByChar.set(cid, { id: scene.id, name: scene.name });
        }
    }
    return roster.map((entry) => {
        if (!moved.has(entry.id)) return entry;
        const scene = sceneByChar.get(entry.id);
        return scene
            ? { ...entry, currentSceneId: scene.id, currentSceneName: scene.name }
            : entry;
    });
}

/* ── MOVE phase (autonomous movement, batched into one PTB) ────────────
 * Idle characters (not bound to an open event) decide — from their plan +
 * who's where — whether to walk to another scene. All moves go in ONE PTB
 * (move_character takes cap/saga/scenes/character by ref). Per-item fallback
 * if the batch aborts (a stale current_scene_id reverts the whole PTB).
 * The live handscroll reflects the new positions on its next poll. */
async function runMovePhase(input: {
    admin: AdminContext;
    sagaId: string;
    capId: string;
    slice: Character[];
    scenes: Scene[];
    nameById: Map<string, string>;
    rosterById: Map<string, SagaRosterEntry>;
    roleById: Map<string, string>;
    dryRun: boolean;
}): Promise<TickMoveResult[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    if (input.scenes.length < 2) return []; // nowhere to go

    // character → current scene (from each scene's current_character_ids).
    const sceneByChar = new Map<string, Scene>();
    for (const s of input.scenes) {
        for (const cid of s.currentCharacterIds ?? []) sceneByChar.set(cid, s);
    }
    const sceneNameById = new Map(input.scenes.map((s) => [s.id, s.name]));
    const presentCharacters = (s: Scene): Array<{ id: string; name: string; role: string }> =>
        (s.currentCharacterIds ?? [])
            .map((cid) => {
                const roster = input.rosterById.get(cid);
                const name = roster?.name ?? input.nameById.get(cid);
                if (!name) return null;
                return {
                    id: cid,
                    name,
                    role: roster?.role ?? input.roleById.get(cid) ?? '—',
                };
            })
            .filter((p): p is { id: string; name: string; role: string } => p != null);

    // Characters on stage in an open event stay put.
    const busy = await fetchBusyCharacterIds(input.sagaId);

    const candidates = input.slice.filter((c) => sceneByChar.has(c.id) && !busy.has(c.id));
    if (candidates.length === 0) return [];

    // DECIDE moves (bounded concurrency — recalls plan → SEAL).
    const decided = await mapPool(candidates, RECALL_CONCURRENCY, async (c) => {
        try {
            const cur = sceneByChar.get(c.id)!;
            const options = input.scenes
                .filter((s) => s.id !== cur.id)
                .map((s) => ({
                    sceneId: s.id,
                    name: s.name,
                    description: s.description,
                    presentCharacters: presentCharacters(s),
                }));
            const planHint = await recallCurrentPlanText(c.id).catch(() => null);
            const dcs = await characterAgent.decideMove({
                name: c.name,
                role: input.roleById.get(c.id) ?? '—',
                planHint: planHint ?? undefined,
                currentSceneName: cur.name,
                options,
            });
            return { c, fromId: cur.id, dcs };
        } catch (err) {
            return {
                c,
                fromId: '',
                dcs: {
                    move: false,
                    reason: err instanceof Error ? err.message : String(err),
                } as characterAgent.MoveDecideResult,
            };
        }
    });

    const movers = decided.filter(
        (x) => x.dcs.move && x.dcs.targetSceneId && x.fromId && x.fromId !== x.dcs.targetSceneId,
    );
    if (movers.length === 0) return [];

    const buildMove = (m: (typeof movers)[number]) =>
        endlessTx.character.moveCharacter({
            cap: input.capId,
            saga: input.sagaId,
            fromScene: m.fromId,
            toScene: m.dcs.targetSceneId as string,
            character: m.c.id,
        });

    const out: TickMoveResult[] = [];
    if (input.dryRun) {
        for (const m of movers) {
            out.push({
                characterId: m.c.id,
                name: m.c.name,
                ok: true,
                fromSceneId: m.fromId,
                toSceneId: m.dcs.targetSceneId as string,
                toSceneName: sceneNameById.get(m.dcs.targetSceneId as string),
                reason: m.dcs.reason,
            });
        }
        return out;
    }

    const batch = await trySend(input.admin, (txb) => {
        for (const m of movers) txb.add(buildMove(m));
    });
    if (batch.ok) {
        for (const m of movers) {
            out.push({
                characterId: m.c.id,
                name: m.c.name,
                ok: true,
                fromSceneId: m.fromId,
                toSceneId: m.dcs.targetSceneId as string,
                toSceneName: sceneNameById.get(m.dcs.targetSceneId as string),
                reason: m.dcs.reason,
            });
            // 手卷 Step 3: the character arrives at the target voicing why.
            recordSceneLine(m.dcs.targetSceneId, m.c.id, m.dcs.reason, 'move');
        }
    } else {
        // Fallback: isolate each move (a stale scene reverts the whole PTB).
        for (const m of movers) {
            const one = await trySend(input.admin, (txb) => txb.add(buildMove(m)));
            out.push({
                characterId: m.c.id,
                name: m.c.name,
                ok: one.ok,
                fromSceneId: m.fromId,
                toSceneId: m.dcs.targetSceneId as string,
                toSceneName: sceneNameById.get(m.dcs.targetSceneId as string),
                reason: m.dcs.reason,
                error: one.ok ? undefined : one.error,
            });
            if (one.ok) recordSceneLine(m.dcs.targetSceneId, m.c.id, m.dcs.reason, 'move');
        }
    }
    return out;
}

async function runSocialPhase(input: {
    sagaId: string;
    slice: Character[];
    scenes: Scene[];
    rosterById: Map<string, SagaRosterEntry>;
    roleById: Map<string, string>;
    dramaHints: Record<string, string>;
    dryRun: boolean;
}): Promise<TickSocialResult[]> {
    if (input.scenes.length === 0) return [];
    const busy = await fetchBusyCharacterIds(input.sagaId);
    const sceneByChar = new Map<string, Scene>();
    for (const scene of input.scenes) {
        for (const cid of scene.currentCharacterIds ?? []) sceneByChar.set(cid, scene);
    }
    const candidates = input.slice.filter((c) => sceneByChar.has(c.id) && !busy.has(c.id));
    if (candidates.length === 0) return [];

    return mapPool(candidates, RECALL_CONCURRENCY, async (c) => {
        const scene = sceneByChar.get(c.id);
        if (!scene) {
            return { characterId: c.id, name: c.name, ok: false, kind: 'idle', error: 'no_scene' };
        }
        const othersInScene = (scene.currentCharacterIds ?? [])
            .filter((cid) => cid !== c.id)
            .map((cid) => {
                const r = input.rosterById.get(cid);
                if (!r) return null;
                return { id: cid, name: r.name, role: r.role ?? '—' };
            })
            .filter((r): r is { id: string; name: string; role: string } => r != null);
        if (othersInScene.length === 0) {
            return {
                characterId: c.id,
                name: c.name,
                ok: true,
                kind: 'idle',
                reason: '此刻同場無人',
            };
        }

        try {
            const names = othersInScene.map((o) => o.name).join(' ');
            const [planHint, recentMemories, relationshipHints] = await Promise.all([
                recallCurrentPlanText(c.id).catch(() => null),
                recallForCharacter(c.id, `${scene.name} ${names} 人物印象 關係 今日觀察`, 5),
                fetchRelationshipHints(c.id, 5).catch(() => [] as string[]),
            ]);
            const raw = await characterAgent.decideSocialAction({
                name: c.name,
                role: input.roleById.get(c.id) ?? '—',
                sceneName: scene.name,
                planHint: planHint ?? undefined,
                recentMemories,
                relationshipHints,
                dramaHint: input.dramaHints[c.id],
                othersInScene,
            });
            const target = raw.targetCharacterId
                ? othersInScene.find((o) => o.id === raw.targetCharacterId)
                : undefined;
            const kind = raw.kind === 'talk' && !target
                ? raw.observation
                    ? 'observe'
                    : 'idle'
                : raw.kind;

            if (!input.dryRun) {
                const speakerObservation = buildSpeakerObservation({
                    speakerName: c.name,
                    sceneName: scene.name,
                    kind,
                    targetName: target?.name,
                    line: raw.line,
                    observation: raw.observation,
                    reason: raw.reason,
                });
                if (speakerObservation) {
                    await rememberForCharacter(c.id, speakerObservation, {
                        kind: 'observation',
                        importance: kind === 'talk' ? 5 : 4,
                    }).catch(() => false);
                }
                if (raw.relationshipMemory) {
                    await rememberForCharacter(c.id, raw.relationshipMemory, {
                        kind: 'relationship',
                        importance: 8,
                    }).catch(() => false);
                }
                if (kind === 'talk' && target) {
                    const heard = `[聽見：${c.name}] ${raw.line ?? raw.observation ?? raw.reason ?? '向我搭了一句話'}`;
                    await rememberForCharacter(target.id, heard, {
                        kind: 'observation',
                        importance: 5,
                    }).catch(() => false);
                    recordSceneLine(scene.id, c.id, raw.line ?? raw.observation ?? raw.reason, 'social');
                } else if (kind === 'observe') {
                    recordSceneLine(scene.id, c.id, raw.observation ?? raw.reason, 'social');
                }
            }

            return {
                characterId: c.id,
                name: c.name,
                ok: true,
                kind,
                targetCharacterId: target?.id,
                targetName: target?.name,
                line: kind === 'talk' ? raw.line : undefined,
                observation: raw.observation,
                relationshipMemory: raw.relationshipMemory,
                reason: raw.reason,
            };
        } catch (err) {
            return {
                characterId: c.id,
                name: c.name,
                ok: false,
                kind: 'idle',
                error: err instanceof Error ? err.message : String(err),
            };
        }
    });
}

function buildSpeakerObservation(input: {
    speakerName: string;
    sceneName: string;
    kind: TickSocialResult['kind'];
    targetName?: string;
    line?: string;
    observation?: string;
    reason?: string;
}): string | null {
    if (input.observation) return input.observation;
    if (input.kind === 'talk' && input.targetName && input.line) {
        return `我在「${input.sceneName}」向「${input.targetName}」搭了一句：「${input.line}」`;
    }
    if (input.kind === 'observe' && input.reason) {
        return `我在「${input.sceneName}」留意到一點：${input.reason}`;
    }
    return null;
}

function publicTagsWithRole(character: Character, role: string | undefined): string[] {
    const tags = new Set(character.publicTags?.map((t) => t.label).filter(Boolean) ?? []);
    if (role && role !== '—') tags.add(`role:${role}`);
    return [...tags];
}

async function fetchBusyCharacterIds(sagaId: string): Promise<Set<string>> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    const busy = new Set<string>();
    if (!pkg) return busy;
    const client = makeSuiClient({ network: resolveNetwork() });
    const summaries = await read.event
        .listBudgetEvents(client, pkg, { sagaId, maxEvents: 20 })
        .catch(() => []);
    for (const ev of summaries) {
        try {
            const res = await read.event.getBudgetEvent(client, ev.eventId);
            const j = res.json as unknown as {
                meta?: { status?: number | string };
                deck?: { participants?: string[] };
            };
            if (Number(j.meta?.status ?? 0) !== 0) continue;
            for (const p of j.deck?.participants ?? []) busy.add(p);
        } catch {
            /* ignore one event read */
        }
    }
    return busy;
}

/* ── ACT phase (batched into PTBs) ─────────────────────────────────────
 * For every OPEN event, characters DECIDE concurrently (bounded — decide
 * recalls memory), then:
 *   PTB-1: every submit_action in ONE transaction (one signature).
 *   PTB-2: resolve_event for every now-fully-acted event in ONE transaction.
 * Was 2N serial signs (submit + resolve per participant/event); now ≤2.
 * Already-acted participants are skipped (idempotent re-runs via status +
 * resolution.submitted_actions). */
interface EventActState {
    eventId: string;
    sceneId: string;
    participants: string[];
    acted: Set<string>;
    pending: string[]; // participant ids that still need to act (have a hand)
}

async function runActPhase(
    admin: AdminContext,
    sagaId: string,
    capId: string,
    nameById: Map<string, string>,
    autoResolve: boolean,
    dramaHints: Record<string, string> = {},
    rosterContextById: Map<string, string[]> = new Map(),
): Promise<{ acts: TickActResult[]; resolves: TickResolveResult[] }> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return { acts: [], resolves: [] };
    const client = makeSuiClient({ network: resolveNetwork() });
    const summaries = await read.event
        .listBudgetEvents(client, pkg, { sagaId, maxEvents: 20 })
        .catch(() => []);

    // Gather open events + who still needs to act.
    const events: EventActState[] = [];
    for (const s of summaries) {
        let parsed;
        try {
            const res = await read.event.getBudgetEvent(client, s.eventId);
            parsed = res.json as unknown as {
                meta?: { status?: number | string; scene_id?: string };
                deck?: { participants?: string[]; hands?: Array<Array<number | string>> };
                resolution?: { submitted_actions?: Array<{ character_id?: string }> };
            };
        } catch {
            continue;
        }
        if (Number(parsed.meta?.status ?? 0) !== 0) continue; // resolved/closed
        const participants = parsed.deck?.participants ?? [];
        const hands = parsed.deck?.hands ?? [];
        if (participants.length === 0) continue;
        const acted = new Set(
            (parsed.resolution?.submitted_actions ?? [])
                .map((a) => a.character_id)
                .filter((x): x is string => typeof x === 'string'),
        );
        const pending = participants.filter(
            (p, i) => p && !acted.has(p) && (hands[i]?.length ?? 0) > 0,
        );
        events.push({
            eventId: s.eventId,
            sceneId: parsed.meta?.scene_id ?? s.sceneId,
            participants,
            acted,
            pending,
        });
    }

    // DECIDE (bounded concurrency — each decide recalls memory → SEAL).
    const tasks = events.flatMap((e) => e.pending.map((charId) => ({ e, charId })));
    const decided = await mapPool(tasks, RECALL_CONCURRENCY, async ({ e, charId }) => {
        try {
            const r = await runCharacterTurnAction(e.eventId, charId, {
                decideOnly: true,
                dramaHint: dramaHints[charId],
                rosterContext: rosterContextById.get(charId),
            });
            return { e, charId, r };
        } catch (err) {
            return {
                e,
                charId,
                r: {
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                } as Awaited<ReturnType<typeof runCharacterTurnAction>>,
            };
        }
    });

    const acts: TickActResult[] = [];
    const submittable = decided.filter(
        (d) => d.r.ok && typeof d.r.cardIndex === 'number',
    );
    // Failed decisions surface immediately.
    for (const d of decided) {
        if (!d.r.ok || typeof d.r.cardIndex !== 'number') {
            acts.push({
                eventId: d.e.eventId,
                characterId: d.charId,
                name: nameById.get(d.charId),
                ok: false,
                error: d.r.error ?? 'decide failed',
            });
        }
    }

    // PTB-1: all submit_action calls in ONE signature. If the batch aborts
    // (one bad card reverts the whole PTB), fall back to per-item submits so
    // a single failure doesn't block the rest. Happy path = one tx.
    if (submittable.length > 0) {
        const batch = await trySend(admin, (txb) => {
            for (const d of submittable) {
                txb.add(
                    buildSubmitCall(capId, sagaId, d.e.eventId, d.charId, d.r.cardIndex as number),
                );
            }
        });
        if (batch.ok) {
            for (const d of submittable) {
                acts.push({
                    eventId: d.e.eventId,
                    characterId: d.charId,
                    name: nameById.get(d.charId),
                    ok: true,
                    cardLabel: d.r.cardLabel,
                    intent: d.r.intent,
                });
                d.e.acted.add(d.charId);
                // 手卷 Step 3: surface the first-person intent as a ghost quote.
                recordSceneLine(d.e.sceneId, d.charId, d.r.intent, 'act');
            }
        } else {
            // Fallback: isolate each submit (serial — only on the rare abort).
            for (const d of submittable) {
                const one = await trySend(admin, (txb) =>
                    txb.add(
                        buildSubmitCall(capId, sagaId, d.e.eventId, d.charId, d.r.cardIndex as number),
                    ),
                );
                acts.push({
                    eventId: d.e.eventId,
                    characterId: d.charId,
                    name: nameById.get(d.charId),
                    ok: one.ok,
                    cardLabel: d.r.cardLabel,
                    intent: d.r.intent,
                    error: one.ok ? undefined : one.error,
                });
                if (one.ok) {
                    d.e.acted.add(d.charId);
                    recordSceneLine(d.e.sceneId, d.charId, d.r.intent, 'act');
                }
            }
        }
    }

    // PTB-2: resolve every now-fully-acted event, one signature.
    const resolves: TickResolveResult[] = [];
    if (autoResolve) {
        const toResolve = events.filter(
            (e) => e.sceneId && e.participants.every((p) => p && e.acted.has(p)),
        );
        if (toResolve.length > 0) {
            const r = await trySend(admin, (txb) => {
                for (const e of toResolve) {
                    const outcomes = txb.add(endlessTx.event.emptyOutcomes());
                    txb.add(
                        endlessTx.event.resolveEvent({
                            cap: capId,
                            saga: sagaId,
                            budgetEvent: e.eventId,
                            scene: e.sceneId,
                            outcomes,
                        }),
                    );
                }
            });
            for (const e of toResolve) {
                resolves.push({
                    eventId: e.eventId,
                    ok: r.ok,
                    digest: r.digest,
                    error: r.ok ? undefined : r.error,
                });
            }
        }
    }

    return { acts, resolves };
}

/**
 * Build + sign + execute one PTB. `build` adds the move-calls. Returns
 * {ok,digest,error} — never throws (a thrown signer/RPC error is captured),
 * so callers can branch on ok (e.g. batch → per-item fallback).
 */
async function trySend(
    admin: AdminContext,
    build: (txb: Transaction) => void,
): Promise<{ ok: boolean; digest?: string; error?: string }> {
    try {
        const txb = new Transaction();
        build(txb);
        const res = await admin.client.signAndExecuteTransaction({
            transaction: txb,
            signer: admin.signer,
            options: { showEffects: true },
        });
        const ok = res.effects?.status?.status === 'success';
        await admin.client.waitForTransaction({ digest: res.digest }).catch(() => {});
        return { ok, digest: res.digest, error: ok ? undefined : res.effects?.status?.error };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** Build one submit_action move-call for the batch PTB. */
function buildSubmitCall(
    capId: string,
    sagaId: string,
    eventId: string,
    characterId: string,
    cardIndex: number,
) {
    return endlessTx.event.submitAction({
        cap: capId,
        saga: sagaId,
        budgetEvent: eventId,
        characterId,
        cardIndex: BigInt(cardIndex),
    });
}

/* ── concurrency pool ──────────────────────────────────────────────────
 * Run `fn` over `items` with at most `concurrency` in flight, preserving
 * input order. Used to throttle recall-heavy phases (PLAN / POV generate)
 * so the shared SEAL key server + Walrus aggregator don't 429 under an
 * all-at-once burst. `fn` must not throw — wrap per-item work in try/catch
 * (a throw rejects the pool). */
async function mapPool<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        for (;;) {
            const i = next;
            next += 1;
            if (i >= items.length) return;
            results[i] = await fn(items[i], i);
        }
    };
    const lanes = Array.from({ length: Math.min(Math.max(1, concurrency), items.length || 1) }, () =>
        worker(),
    );
    await Promise.all(lanes);
    return results;
}
