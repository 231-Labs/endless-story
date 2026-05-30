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

import type { Character } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { runPovForCharacter, anchorPovChaptersBatch } from '@/lib/chain/pov-core';
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
import { resolveEventAction } from './budget-event';

/**
 * Max characters whose memory-recall work (PLAN / POV generate) runs at
 * once. Each recall SEAL-decrypts ~18 blobs against a SHARED key server +
 * Walrus aggregator; an all-at-once burst across the cast 429s them and
 * recall silently returns empty. 2 keeps a real speedup without tripping
 * the limit. Tune up if you move off the staging relayer.
 */
const RECALL_CONCURRENCY = 2;

export interface TickLoopInput {
    /** Advance a tick before the pass. Default true (ignored on dry-run). */
    advance?: boolean;
    /** Cap characters processed for POV/sleep (LLM cost guard). Default 6. */
    maxCharacters?: number;
    /** Update each character's standing plan first (N6). Default true. */
    plan?: boolean;
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

export interface TickLoopResult {
    ok: boolean;
    advanced: boolean;
    worldTime?: WorldTimeSnapshot;
    plans: TickPlanResult[];
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
            acts: [],
            resolves: [],
            povs: [],
            sleeps: [],
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    const dryRun = input.dryRun ?? false;
    const cap = input.maxCharacters ?? 6;

    // 1. ADVANCE (chain mutation — skipped on dry-run).
    let advanced = false;
    if ((input.advance ?? true) && !dryRun) {
        const adv = await advanceTickAction();
        advanced = adv.ok;
    }
    const worldTime = (await getWorldTimeSnapshot()) ?? undefined;
    const dayLabel = worldTime ? `第 ${worldTime.day} 日 · ${worldTime.partOfDay}` : '某日';

    // Character roster (saga-scoped, with fallback).
    let characters: Character[] = await charactersApi.listSagaCharacters(d.sagaId).catch(() => []);
    if (characters.length === 0) {
        characters = await charactersApi.listCharacters().catch(() => []);
    }
    const nameById = new Map(characters.map((c) => [c.id, c.name]));
    const slice = characters.slice(0, cap);

    // 2. PLAN — each character updates its standing goal first (N6), so the
    //    fresh plan is recalled by the decide/POV steps below. PLAN does NO
    //    Sui signing (MemWal reads + writes only). Run with BOUNDED
    //    concurrency: each plan SEAL-decrypts a recall, and the shared SEAL
    //    key server / Walrus aggregator 429s under an all-at-once burst.
    const plans: TickPlanResult[] = [];
    if (input.plan ?? true) {
        const settled = await mapPool(slice, RECALL_CONCURRENCY, async (c) => {
            try {
                return { c, p: await runPlanAction(c.id, { dryRun }) };
            } catch (err) {
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

    // 3. ACT — characters play their own hands in open events; events that
    //    everyone has acted in auto-resolve (judge). Chain mutation → serial
    //    (single StorytellerCap, no parallel signing).
    const acts: TickActResult[] = [];
    const resolves: TickResolveResult[] = [];
    if (!dryRun) {
        try {
            const phase = await runActPhase(d.sagaId, nameById, input.autoResolve ?? true);
            acts.push(...phase.acts);
            resolves.push(...phase.resolves);
        } catch (err) {
            // Non-fatal: a failed ACT phase shouldn't block POV/narrate.
            console.warn('[tick-loop] act phase failed:', err);
        }
    }

    // 4. PRODUCE — POV chapter per character.
    //    Dry-run does NO chain writes → generate every chapter CONCURRENTLY
    //    (this is the big preview speedup). A real run anchors via
    //    commitment::commit (Sui signing) → must stay serial.
    const trigger = `${dayLabel} — 戲班又過了一段光景。把你此刻的心境、所見、未說出口的念頭，寫成一段獨白。`;
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
    const generated = await mapPool(slice, RECALL_CONCURRENCY, async (c) => {
        try {
            return {
                c,
                r: await runPovForCharacter(admin, c.id, {
                    triggerNarrative: trigger,
                    forceRun: true,
                    dryRun: true,
                }),
            };
        } catch (err) {
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
            for (const c of slice) {
                const r = await runSleepAction(c.id);
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
        }
    }

    // 6. NARRATE — compile the objective gazette for the day.
    let gazette: TickGazetteResult | undefined;
    if ((input.gazette ?? true) && !dryRun) {
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
        acts.some((a) => a.ok) ||
        resolves.some((r) => r.ok) ||
        povs.some((p) => p.ok) ||
        sleeps.some((s) => s.ok && !s.skipReason) ||
        gazette?.ok === true;
    return {
        ok: anyOk || (slice.length === 0),
        advanced,
        worldTime,
        plans,
        acts,
        resolves,
        povs,
        sleeps,
        sleepNote,
        gazette,
    };
}

/* ── ACT phase ─────────────────────────────────────────────────────────
 * For every OPEN budget event in the saga, find participants who haven't
 * acted yet (not in resolution.submitted_actions) and have a non-empty
 * hand, then let each one DECIDE + submit on its own. Sequential — one
 * keypair. Already-acted participants are skipped (idempotent re-runs).
 *
 * After acting, if every participant has now acted, the event auto-resolves
 * (N5 judge) so it concludes on its own instead of waiting for an admin. */
async function runActPhase(
    sagaId: string,
    nameById: Map<string, string>,
    autoResolve: boolean,
): Promise<{ acts: TickActResult[]; resolves: TickResolveResult[] }> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return { acts: [], resolves: [] };
    const client = makeSuiClient({ network: resolveNetwork() });
    const summaries = await read.event
        .listBudgetEvents(client, pkg, { sagaId, maxEvents: 20 })
        .catch(() => []);

    const acts: TickActResult[] = [];
    const resolves: TickResolveResult[] = [];
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
        const sceneId = parsed.meta?.scene_id ?? s.sceneId;
        const participants = parsed.deck?.participants ?? [];
        const hands = parsed.deck?.hands ?? [];
        if (participants.length === 0) continue;
        const acted = new Set(
            (parsed.resolution?.submitted_actions ?? [])
                .map((a) => a.character_id)
                .filter((x): x is string => typeof x === 'string'),
        );
        for (let i = 0; i < participants.length; i += 1) {
            const charId = participants[i];
            if (!charId || acted.has(charId)) continue;
            if ((hands[i]?.length ?? 0) === 0) continue; // no hand to play
            const r = await runCharacterTurnAction(s.eventId, charId);
            acts.push({
                eventId: s.eventId,
                characterId: charId,
                name: nameById.get(charId),
                ok: r.ok,
                cardLabel: r.cardLabel,
                intent: r.intent,
                error: r.ok ? undefined : r.error,
            });
            if (r.ok) acted.add(charId);
        }

        // Judge: every participant has acted → conclude the event.
        const allActed = participants.every((p) => p && acted.has(p));
        if (autoResolve && allActed && sceneId) {
            const rr = await resolveEventAction({ eventId: s.eventId, sceneId });
            resolves.push({
                eventId: s.eventId,
                ok: rr.ok,
                digest: rr.digest,
                error: rr.ok ? undefined : rr.error,
            });
        }
    }
    return { acts, resolves };
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
