/**
 * Event spine — drive an episode as a multi-tick BudgetEvent: open for a
 * contention, linger while POVs accumulate under its stable object id, then
 * resolve WITH a resource transfer (EVENT_LIFECYCLE.md §3 Phase 2). Pure
 * decisions live in `spine-core.ts`; this file is the chain glue. Every
 * settlement failure falls back to a plain `empty_outcomes` resolve so a wedged
 * settlement never stalls the loop.
 */

import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx, read, type SuiClient } from '@endless-story/sdk';
import { readResourceLedger, settleResolvedTransfers } from '@/lib/chain/drama';
import { coolResource } from '@/lib/chain/gravity-core';

/** Wall-clock window defining one spine "tick" for age math. Age derives from
 *  the on-chain push timestamp, not a per-process counter, so it survives
 *  restarts. Tune via ES_SPINE_TICK_WINDOW_MS. */
const SPINE_TICK_WINDOW_MS = Math.max(
    1000,
    Number(process.env.ES_SPINE_TICK_WINDOW_MS) || 120_000,
);

/** How long a just-settled resource stops pulling rivals — long enough that a
 *  ≥3-way contest disperses between rounds (gravity-sim.test.ts C). */
const GRAVITY_COOLDOWN_TICKS = 6;
import {
    decideSpineStep,
    decideSpineSteps,
    pickContestedResource,
    reconcileOpenEvents,
    clockTickOf,
    chooseSettlementWinner,
    planResourceTransfer,
    type SpineOpenEvent,
    type ChainOpenEvent,
    type SpineStep,
    type ContentionPick,
    type SceneOccupant,
    type TensionView,
    type AllocationView,
    type AxisCandidate,
} from '@/lib/chain/spine-core';
import { chooseContestWinner, resolveContestSpec, toContender } from '@/lib/chain/contest';
import type { WorldAttrs } from '@/lib/chain/saga-skills';
import { createBudgetEventAction, dealHandAction } from './budget-event';
import { compileEventChapterAction } from './compile-event-chapter';
import { dumpChapter } from '@/lib/chain/chapter-dump';
import type { TickStoryletResult } from './tick-loop-types';

type Admin = { client: SuiClient; signer: Keypair };

interface CutPov {
    characterId: string;
    characterName: string;
    role?: string;
    body: string;
}

/* Per-process registries. A saga may hold many open events (one per contention
 * axis); single-mode keeps the array at length ≤ 1. */
const openBySaga = new Map<string, SpineOpenEvent[]>();
const povsByEvent = new Map<string, CutPov[]>();

const openList = (sagaId: string): SpineOpenEvent[] => openBySaga.get(sagaId) ?? [];
function addOpen(sagaId: string, ev: SpineOpenEvent): void {
    const arr = openBySaga.get(sagaId) ?? [];
    arr.push(ev);
    openBySaga.set(sagaId, arr);
}
function removeOpen(sagaId: string, eventId: string): void {
    const arr = openBySaga.get(sagaId);
    if (arr) openBySaga.set(sagaId, arr.filter((e) => e.eventId !== eventId));
}

/** Clock-derived spine tick — restart-proof: any process at the same wall-clock
 *  computes the same value (unlike an in-memory counter). */
export function spineClockTick(nowMs = Date.now()): number {
    return clockTickOf(nowMs, SPINE_TICK_WINDOW_MS);
}

/**
 * Reconcile the in-memory open list against the chain's authoritative open set:
 * adopt events orphaned by a process restart (so they age + resolve instead of
 * hanging open) and drop events already resolved on chain. Any read error
 * leaves the in-memory list untouched.
 */
export async function reconcileOpenFromChain(
    client: SuiClient,
    sagaId: string,
): Promise<SpineOpenEvent[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return openList(sagaId);
    try {
        const summaries = await read.event.listBudgetEvents(client, pkg, { sagaId, maxEvents: 25 });
        const chainOpen: ChainOpenEvent[] = [];
        for (const s of summaries) {
            let parsed: {
                meta?: { status?: number | string; scene_id?: string; title?: string };
                deck?: { participants?: string[] };
            };
            try {
                const res = await read.event.getBudgetEvent(client, s.eventId);
                parsed = res.json as typeof parsed;
            } catch {
                continue;
            }
            if (Number(parsed.meta?.status ?? 0) !== 0) continue; // 0 = OPEN
            chainOpen.push({
                eventId: s.eventId,
                sceneId: parsed.meta?.scene_id ?? s.sceneId,
                createdAtMs: Number(s.createdAtMs) || Date.now(),
                participantIds: parsed.deck?.participants ?? [],
                label: parsed.meta?.title ?? '一場戲',
            });
        }
        const reconciled = reconcileOpenEvents(chainOpen, openList(sagaId), SPINE_TICK_WINDOW_MS);
        openBySaga.set(sagaId, reconciled);
        return reconciled;
    } catch (err) {
        console.warn('[event-spine] reconcile from chain failed:', err);
        return openList(sagaId);
    }
}

/** Diagnostic snapshot of the spine open set with per-event age in clock-ticks.
 *  Call AFTER reconcileOpenFromChain so it reflects chain truth. */
export function spineMemorySnapshot(
    sagaId: string,
    nowTick: number,
): { tick: number; open: { eventId: string; age: number }[] } {
    return {
        tick: nowTick,
        open: openList(sagaId).map((e) => ({ eventId: e.eventId, age: nowTick - e.openedAtTick })),
    };
}

export interface SpineCtx {
    sagaId: string;
    capId: string;
    /** single-mode contention (spinePlanAndOpen). */
    contention: ContentionPick | null;
    /** parallel-mode axis candidates, highest priority first. */
    candidates?: AxisCandidate[];
    /** parallel-mode concurrency cap (default 2). */
    maxConcurrent?: number;
    occupancy: SceneOccupant[];
    sceneNameById: Map<string, string>;
    nameById: Map<string, string>;
    roleById: Map<string, string>;
    tensions: TensionView[];
    /** Innate world attrs per character, for the skill-weighted contest. When
     *  absent, settlement falls back to the tension-only winner. */
    attrsById?: Map<string, WorldAttrs>;
    minTicks?: number;
    maxTicks?: number;
    minCast?: number;
}

/** Shaped so downstream POV/provenance/cut code is reused verbatim — `digest`
 *  carries the STABLE BudgetEvent id (eventTx across ticks). */
function descriptorFor(ev: SpineOpenEvent, ctx: SpineCtx): TickStoryletResult {
    return {
        sceneId: ev.sceneId,
        sceneName: ctx.sceneNameById.get(ev.sceneId) ?? '戲班',
        templateId: ev.templateId,
        label: ev.label,
        characterIds: ev.participantIds,
        names: ev.participantIds.map((id) => ctx.nameById.get(id) ?? '某人'),
        opened: true,
        digest: ev.eventId,
    };
}

/** Plan this tick's spine step; on OPEN, push a BudgetEvent + deal hands.
 *  Returns the storylet descriptor plus the step (resolve+weave due or not). */
export async function spinePlanAndOpen(
    admin: Admin,
    ctx: SpineCtx,
    nowTick: number,
): Promise<{ storylet?: TickStoryletResult; step: SpineStep }> {
    const step = decideSpineStep({
        recentSceneIds: recentStagedScenes(ctx.sagaId),
        open: openList(ctx.sagaId)[0] ?? null,
        nowTick,
        minTicks: ctx.minTicks ?? 2,
        maxTicks: ctx.maxTicks ?? 4,
        contention: ctx.contention,
        occupancy: ctx.occupancy,
        minCast: ctx.minCast ?? 2,
    });

    if (step.action === 'open') {
        const ev = await openOneEvent(ctx, step, nowTick);
        if (!ev) return { step: { action: 'idle', reason: 'open failed' } };
        return { storylet: descriptorFor(ev, ctx), step };
    }

    const open = openList(ctx.sagaId)[0];
    if (open) return { storylet: descriptorFor(open, ctx), step };
    return { step };
}

/** Push a BudgetEvent + deal hands for one OPEN step; null on chain failure. */

/** G12 — last few scenes that staged an event, per saga (in-process ring). */
const recentStagedBySaga = new Map<string, string[]>();
function recentStagedScenes(sagaId: string): string[] {
    return recentStagedBySaga.get(sagaId) ?? [];
}
function recordStagedScene(sagaId: string, sceneId: string): void {
    const ring = recentStagedBySaga.get(sagaId) ?? [];
    ring.push(sceneId);
    if (ring.length > 4) ring.splice(0, ring.length - 4);
    recentStagedBySaga.set(sagaId, ring);
}

async function openOneEvent(
    ctx: SpineCtx,
    step: Extract<SpineStep, { action: 'open' }>,
    nowTick: number,
): Promise<SpineOpenEvent | null> {
    const created = await createBudgetEventAction({
        sceneId: step.sceneId,
        title: step.label,
        summary: '',
        scale: 3,
    });
    if (!created.ok || !created.eventId) {
        console.warn('[event-spine] open failed:', created.error);
        return null;
    }
    for (const id of step.participantIds) {
        const dealt = await dealHandAction({ eventId: created.eventId, characterId: id });
        if (!dealt.ok) console.warn(`[event-spine] deal ${id} failed:`, dealt.error);
    }
    const ev: SpineOpenEvent = {
        eventId: created.eventId,
        sceneId: step.sceneId,
        templateId: step.templateId,
        label: step.label,
        participantIds: step.participantIds,
        openedAtTick: nowTick,
    };
    addOpen(ctx.sagaId, ev);
    recordStagedScene(ctx.sagaId, ev.sceneId);
    return ev;
}

/**
 * Parallel mode: plan every axis this tick — linger/resolve open events by age,
 * open the highest-priority quorum axes up to the cap. Returns a descriptor per
 * LIVE event (not the resolving ones) plus the full step list. Chain opens run
 * serially (one keypair).
 */
export async function spinePlanAndOpenAll(
    admin: Admin,
    ctx: SpineCtx,
    nowTick: number,
): Promise<{ storylets: TickStoryletResult[]; steps: SpineStep[] }> {
    const steps = decideSpineSteps({
        recentSceneIds: recentStagedScenes(ctx.sagaId),
        openEvents: openList(ctx.sagaId),
        nowTick,
        minTicks: ctx.minTicks ?? 2,
        maxTicks: ctx.maxTicks ?? 4,
        maxConcurrent: ctx.maxConcurrent ?? 2,
        candidates: ctx.candidates ?? [],
        minCast: ctx.minCast ?? 2,
    });

    const storylets: TickStoryletResult[] = [];
    const byId = new Map(openList(ctx.sagaId).map((e) => [e.eventId, e]));
    for (const step of steps) {
        if (step.action === 'open') {
            const ev = await openOneEvent(ctx, step, nowTick);
            if (ev) storylets.push(descriptorFor(ev, ctx));
        } else if (step.action === 'continue') {
            const ev = byId.get(step.eventId);
            if (ev) storylets.push(descriptorFor(ev, ctx));
        }
        // resolve / idle → no live descriptor (resolve weaves from accumulated POVs)
    }
    return { storylets, steps };
}

/** Accumulate a tick's cast POVs under the event so the cut covers the whole episode. */
export function spineAccumulatePovs(eventId: string, povs: CutPov[]): void {
    if (povs.length === 0) return;
    const list = povsByEvent.get(eventId);
    if (list) list.push(...povs);
    else povsByEvent.set(eventId, [...povs]);
}

/** On a RESOLVE step: settle the contested resource to the winner (plain-resolve
 *  fallback), then weave the accumulated POVs into one chapter. No-op otherwise. */
export async function spineResolveAndWeave(
    admin: Admin,
    ctx: SpineCtx,
    step: SpineStep,
    day?: number,
): Promise<{ resolved: boolean; settled: boolean; cutPovCount: number }> {
    if (step.action !== 'resolve') return { resolved: false, settled: false, cutPovCount: 0 };
    const ev = openList(ctx.sagaId).find((e) => e.eventId === step.eventId);
    if (!ev) return { resolved: false, settled: false, cutPovCount: 0 };

    const ev8 = ev.eventId.slice(0, 10);
    const age = spineClockTick() - ev.openedAtTick;
    const tSettle = Date.now();
    console.log(`[ch-timing] resolve=${ev8} enter settle — resolve tx + apply tx + 2× waitForTx`);
    const { resolved, settled } = await settleEvent(admin, ctx, ev);
    console.log(`[ch-timing] resolve=${ev8} settle=${((Date.now() - tSettle) / 1000).toFixed(1)}s resolved=${resolved}`);
    if (!resolved) {
        // Resolve tx didn't land: do NOT removeOpen — leave the event OPEN so the
        // next tick retries. Dropping it from memory was the orphan-loop bug
        // (open on chain, forgotten locally, re-adopted, re-failing forever).
        console.warn(
            `[ch-diag] resolve event=${ev8} day=${day ?? '?'} age=${age} resolved=false ` +
                `wove=false reason=resolve_tx_failed — left OPEN to retry`,
        );
        return { resolved: false, settled: false, cutPovCount: 0 };
    }

    // Weave the cut. Prefer the in-memory POV accumulation, but the registries
    // are per-process: a tick resolving an event it didn't open sees an empty
    // POV map, so with <2 in-memory voices recover the POVs from chain by
    // matching each cast member's es:prov header to this eventTx.
    const cutPovs = povsByEvent.get(ev.eventId) ?? [];
    const memoryVoices = new Set(cutPovs.map((p) => p.characterId)).size;
    const path = memoryVoices >= 2 ? 'memory' : 'chain';
    const base = {
        sceneId: ev.sceneId,
        sceneName: ctx.sceneNameById.get(ev.sceneId) ?? '戲班',
        eventTx: ev.eventId,
        eventLabel: ev.label,
        day,
    };
    let cutPovCount = 0;
    let wove = false;
    let skip = '';
    let errMsg = '';
    const tWeave = Date.now();
    console.log(`[ch-timing] resolve=${ev8} enter weave path=${path}`);
    try {
        const cut = await compileEventChapterAction(
            path === 'memory'
                ? { ...base, povs: cutPovs }
                : { ...base, castCharacterIds: ev.participantIds },
        );
        console.log(`[ch-timing] resolve=${ev8} weave=${((Date.now() - tWeave) / 1000).toFixed(1)}s anchored=${cut.anchored} skip=${cut.skipReason ?? ''}`);
        cutPovCount = cut.povCount;
        wove = cut.anchored;
        skip = cut.skipReason ?? '';
        errMsg = cut.error ?? '';
        // Mirror the immediate-mode cut onto the chapter-dump channel; no-op
        // unless ES_CHAPTER_DUMP_DIR is set.
        dumpChapter(
            { kind: 'cut', day, name: base.sceneName, note: ev.label },
            cut.chapter,
        );
    } catch (err) {
        errMsg = err instanceof Error ? err.message : String(err);
    }

    // [ch-diag] resolve: one line per resolved event explaining its chapter outcome.
    console.log(
        `[ch-diag] resolve event=${ev8} day=${day ?? '?'} age=${age} cast=${ev.participantIds.length} ` +
            `resolved=true settled=${settled} memVoices=${memoryVoices} path=${path} ` +
            `wove=${wove} povCount=${cutPovCount}` +
            (skip ? ` skip=${skip}` : '') +
            (errMsg ? ` err="${errMsg.slice(0, 120)}"` : '') +
            ` scene="${base.sceneName}" label="${(ev.label ?? '').slice(0, 24)}"`,
    );

    removeOpen(ctx.sagaId, ev.eventId);
    povsByEvent.delete(ev.eventId);
    return { resolved: true, settled, cutPovCount };
}

/** Skill-weighted contest: intent (tension) gates participation, ability gates
 *  success. Falls back to the tension-only winner when innate attrs are absent. */
function pickContestWinner(ctx: SpineCtx, participantIds: string[], resource: AllocationView): string | null {
    const label = resource.label;
    const colon = label.indexOf(':');
    const kind = colon >= 0 ? label.slice(0, colon) : '';
    const name = colon >= 0 ? label.slice(colon + 1) : label; // display name, always in the statement
    // A tension belongs to this resource if its statement carries the display
    // name or the ascii kind.
    const matches = (s: string) => (name !== '' && s.includes(name)) || (kind !== '' && s.includes(kind));
    if (!ctx.attrsById) return chooseSettlementWinner(participantIds, ctx.tensions, name);
    // Intent per participant = max tension toward this resource.
    const intentById = new Map<string, number>();
    for (const t of ctx.tensions) {
        if (!participantIds.includes(t.characterId)) continue;
        if (!matches(t.statement)) continue;
        if (t.tension <= 0) continue;
        intentById.set(t.characterId, Math.max(intentById.get(t.characterId) ?? 0, t.tension));
    }
    const spec = resolveContestSpec(kind);
    const contenders = participantIds
        .map((id) => {
            const attrs = ctx.attrsById!.get(id);
            if (!attrs) return null;
            return toContender(id, intentById.get(id) ?? 0, ctx.roleById.get(id) ?? '', attrs, spec);
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
    if (contenders.length === 0) return chooseSettlementWinner(participantIds, ctx.tensions, name);
    return chooseContestWinner(contenders, spec.abilityGate);
}

/** Resolve the event with a resource transfer to the winner; on any problem
 *  fall back to a plain `empty_outcomes` resolve so the event still closes. */
async function settleEvent(
    admin: Admin,
    ctx: SpineCtx,
    ev: SpineOpenEvent,
): Promise<{ resolved: boolean; settled: boolean }> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    const ev8 = ev.eventId.slice(0, 10);
    try {
        const tLedger = Date.now();
        console.log(`[ch-timing] settle=${ev8} → readResourceLedger`);
        const resources = await readResourceLedger(admin.client, d.packageId, ctx.sagaId);
        console.log(`[ch-timing] settle=${ev8} readResourceLedger=${((Date.now() - tLedger) / 1000).toFixed(1)}s (${resources.length} res)`);
        const views: AllocationView[] = resources.map((r) => ({
            resourceId: r.id,
            label: r.label,
            capacity: r.capacity,
            allocations: r.allocations,
        }));
        // Warm path matches by templateId; an adopted orphan has none, so fall
        // back to the resource the cast most wants (by tension).
        const resource = pickContestedResource(views, ev.templateId, ev.participantIds, ctx.tensions);
        // Contest decided — stop drawing rivals here for a while (else a ≥3-way slot thrashes).
        if (resource) coolResource(resource.resourceId, GRAVITY_COOLDOWN_TICKS);
        const winner = resource ? pickContestWinner(ctx, ev.participantIds, resource) : null;
        const plan = resource && winner ? planResourceTransfer(resource, winner, ev.participantIds) : null;

        if (resource && plan) {
            const tx = new Transaction();
            // `outcomes_with_resource_transfers` takes `vector<event::ResourceTransferOp>`
            // (NOT `resource::Transfer` — Move has no structural subtyping).
            // `from: null` = acquire from free capacity; a holder id = reallocate.
            const op = tx.add(
                endlessTx.event.newResourceTransferOp({
                    resourceId: resource.resourceId,
                    from: plan.from,
                    to: plan.to,
                    amount: plan.amount,
                }),
            );
            const transfersVec = tx.makeMoveVec({
                type: `${d.packageId}::event::ResourceTransferOp`,
                elements: [op],
            });
            const outcomes = tx.add(
                endlessTx.event.outcomesWithResourceTransfers({ resourceTransfers: transfersVec }),
            );
            tx.add(
                endlessTx.event.resolveEvent({
                    cap: ctx.capId,
                    saga: ctx.sagaId,
                    budgetEvent: ev.eventId,
                    scene: ev.sceneId,
                    outcomes,
                }),
            );
            console.log(`[ch-timing] settle=${ev8} → resolve tx (transfer path, entering admin lock)`);
            const res = await admin.client.signAndExecuteTransaction({
                transaction: tx,
                signer: admin.signer,
                options: { showEffects: true },
            });
            if (res.effects?.status?.status === 'success') {
                await admin.client.waitForTransaction({ digest: res.digest }).catch(() => {});
                // Apply the validated transfers to the resource.
                const applied = await settleResolvedTransfers({
                    sagaId: ctx.sagaId,
                    capId: ctx.capId,
                    eventId: ev.eventId,
                    resourceIds: [resource.resourceId],
                    signer: admin.signer,
                    client: admin.client,
                });
                if (applied.ok) return { resolved: true, settled: true };
                console.warn('[event-spine] apply_resource_transfers failed:', applied.error);
                return { resolved: true, settled: false };
            }
            console.warn('[event-spine] settling resolve aborted, falling back:', res.effects?.status?.error);
        }
    } catch (err) {
        console.warn('[event-spine] settlement errored, falling back to plain resolve:', err);
    }

    // Fallback: plain resolve so the event closes. Report whether it actually
    // landed — the caller leaves the event OPEN to retry if not.
    console.log(`[ch-timing] settle=${ev8} → plainResolve (fallback, entering admin lock)`);
    const resolved = await plainResolve(admin, ctx, ev).catch((err) => {
        console.warn('[event-spine] plain resolve threw:', err);
        return false;
    });
    return { resolved, settled: false };
}

/** `empty_outcomes` resolve — the safety net that closes the event. An aborted
 *  tx must NOT be reported as resolved (that orphaned the event). */
async function plainResolve(admin: Admin, ctx: SpineCtx, ev: SpineOpenEvent): Promise<boolean> {
    const tx = new Transaction();
    const outcomes = tx.add(endlessTx.event.emptyOutcomes());
    tx.add(
        endlessTx.event.resolveEvent({
            cap: ctx.capId,
            saga: ctx.sagaId,
            budgetEvent: ev.eventId,
            scene: ev.sceneId,
            outcomes,
        }),
    );
    const res = await admin.client.signAndExecuteTransaction({
        transaction: tx,
        signer: admin.signer,
        options: { showEffects: true },
    });
    if (res.effects?.status?.status !== 'success') {
        console.warn('[event-spine] plain resolve aborted:', res.effects?.status?.error);
        return false;
    }
    await admin.client.waitForTransaction({ digest: res.digest }).catch(() => {});
    return true;
}
