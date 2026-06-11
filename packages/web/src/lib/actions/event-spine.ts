/**
 * Event spine (flag-gated) — drive a 回 as a multi-tick BudgetEvent.
 *
 * OFF by default (`eventSpine` tick input). When ON, this REPLACES the per-tick
 * storylet opener: one BudgetEvent is opened for a contention, lingers OPEN
 * across several ticks while POVs accumulate (all keyed to its stable object id),
 * then resolves WITH a resource transfer so the contested slot changes hands —
 * the lever that finally moves the world (EVENT_LIFECYCLE.md §3 Phase 2).
 *
 * Pure decisions live in `spine-core.ts` (unit-tested). This file is the chain
 * glue: it reuses the existing, working tx helpers (createBudgetEventAction /
 * dealHandAction / settleResolvedTransfers / compileEventChapterAction) and adds
 * exactly ONE new tx shape — resolve_event WITH `outcomes_with_resource_transfers`.
 *
 * SAFETY: every settlement step is wrapped so that ANY failure (bad proposal,
 * resource.move not applying, RPC blip) falls back to a plain `empty_outcomes`
 * resolve. The event therefore ALWAYS closes — a wedged-open event can never
 * stall the loop. The world just doesn't settle that round.
 *
 * ⚠️ Type-checked, not chain-verified here (no live tick in this container). The
 * settlement path — proposal validity, `snapshot.id` vs object id for apply,
 * cadence — must be exercised in a chain-capable session before flipping the flag
 * on for a demo.
 */

import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx, type SuiClient } from '@endless-story/sdk';
import { readResourceLedger, settleResolvedTransfers } from '@/lib/chain/drama';
import {
    decideSpineStep,
    resourceForContention,
    chooseSettlementWinner,
    planResourceTransfer,
    type SpineOpenEvent,
    type SpineStep,
    type ContentionPick,
    type SceneOccupant,
    type TensionView,
    type AllocationView,
} from '@/lib/chain/spine-core';
import { createBudgetEventAction, dealHandAction } from './budget-event';
import { compileEventChapterAction } from './compile-event-chapter';
import type { TickStoryletResult } from './tick-loop-types';

type Admin = { client: SuiClient; signer: Keypair };

interface CutPov {
    characterId: string;
    characterName: string;
    role?: string;
    body: string;
}

/* ── per-process registries (same lifetime model as recentTopicsBySaga) ───── */
const openBySaga = new Map<string, SpineOpenEvent>();
const tickBySaga = new Map<string, number>();
const povsByEvent = new Map<string, CutPov[]>();

/** Advance the saga's monotonic spine tick (call once per loop run). */
export function spineNextTick(sagaId: string): number {
    const next = (tickBySaga.get(sagaId) ?? 0) + 1;
    tickBySaga.set(sagaId, next);
    return next;
}

export interface SpineCtx {
    sagaId: string;
    capId: string;
    contention: ContentionPick | null;
    occupancy: SceneOccupant[];
    sceneNameById: Map<string, string>;
    nameById: Map<string, string>;
    roleById: Map<string, string>;
    tensions: TensionView[];
    minTicks?: number;
    maxTicks?: number;
    minCast?: number;
}

/** TickStoryletResult shaped so all downstream POV/provenance/cut code is reused
 *  verbatim — `digest` carries the STABLE BudgetEvent id (eventTx across ticks). */
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

/**
 * Plan this tick's spine step and, when it says OPEN, push a BudgetEvent +
 * deal hands. Returns the storylet-shaped descriptor to drive POV/cut, plus the
 * step (so the caller knows whether a resolve+weave is due this tick).
 */
export async function spinePlanAndOpen(
    admin: Admin,
    ctx: SpineCtx,
    nowTick: number,
): Promise<{ storylet?: TickStoryletResult; step: SpineStep }> {
    const step = decideSpineStep({
        open: openBySaga.get(ctx.sagaId) ?? null,
        nowTick,
        minTicks: ctx.minTicks ?? 2,
        maxTicks: ctx.maxTicks ?? 4,
        contention: ctx.contention,
        occupancy: ctx.occupancy,
        minCast: ctx.minCast ?? 2,
    });

    if (step.action === 'open') {
        const created = await createBudgetEventAction({
            sceneId: step.sceneId,
            title: step.label,
            summary: '',
            scale: 3,
        });
        if (!created.ok || !created.eventId) {
            console.warn('[event-spine] open failed:', created.error);
            return { step: { action: 'idle', reason: 'open failed' } };
        }
        // Deal each participant their hand so the ACT phase sees pending hands.
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
        openBySaga.set(ctx.sagaId, ev);
        return { storylet: descriptorFor(ev, ctx), step };
    }

    const open = openBySaga.get(ctx.sagaId);
    if (open) return { storylet: descriptorFor(open, ctx), step };
    return { step };
}

/** Accumulate a tick's cast POVs under the event so the cut covers the whole 回. */
export function spineAccumulatePovs(eventId: string, povs: CutPov[]): void {
    if (povs.length === 0) return;
    const list = povsByEvent.get(eventId);
    if (list) list.push(...povs);
    else povsByEvent.set(eventId, [...povs]);
}

/**
 * When the step is RESOLVE: settle the contested resource to the winner (with a
 * plain-resolve fallback), then weave the event's accumulated POVs into one 回.
 * Clears the registries for this event. No-op for non-resolve steps.
 */
export async function spineResolveAndWeave(
    admin: Admin,
    ctx: SpineCtx,
    step: SpineStep,
    day?: number,
): Promise<{ resolved: boolean; settled: boolean; cutPovCount: number }> {
    if (step.action !== 'resolve') return { resolved: false, settled: false, cutPovCount: 0 };
    const ev = openBySaga.get(ctx.sagaId);
    if (!ev || ev.eventId !== step.eventId) {
        return { resolved: false, settled: false, cutPovCount: 0 };
    }

    const settled = await settleEvent(admin, ctx, ev);

    // Weave the cut from everything accumulated across the event's ticks.
    const cutPovs = povsByEvent.get(ev.eventId) ?? [];
    let cutPovCount = 0;
    if (cutPovs.length >= 2) {
        try {
            const cut = await compileEventChapterAction({
                sceneId: ev.sceneId,
                sceneName: ctx.sceneNameById.get(ev.sceneId) ?? '戲班',
                eventTx: ev.eventId,
                eventLabel: ev.label,
                day,
                povs: cutPovs,
            });
            cutPovCount = cut.povCount;
        } catch (err) {
            console.warn('[event-spine] cut weave failed:', err);
        }
    }

    openBySaga.delete(ctx.sagaId);
    povsByEvent.delete(ev.eventId);
    return { resolved: true, settled, cutPovCount };
}

/**
 * Resolve the event, proposing a resource transfer to the winner. Falls back to
 * a plain `empty_outcomes` resolve on ANY problem so the event always closes.
 * Returns whether a real settlement (transfer) was applied.
 */
async function settleEvent(admin: Admin, ctx: SpineCtx, ev: SpineOpenEvent): Promise<boolean> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    try {
        const resources = await readResourceLedger(admin.client, d.packageId, ctx.sagaId);
        const views: AllocationView[] = resources.map((r) => ({
            resourceId: r.id,
            label: r.label,
            capacity: r.capacity,
            allocations: r.allocations,
        }));
        const resource = resourceForContention(views, ev.templateId);
        const keyword = ev.templateId.split(':')[1] ?? '';
        const winner = resource
            ? chooseSettlementWinner(ev.participantIds, ctx.tensions, keyword)
            : null;
        const plan = resource && winner ? planResourceTransfer(resource, winner) : null;

        if (resource && plan) {
            const tx = new Transaction();
            const transfer =
                plan.from === null
                    ? tx.add(endlessTx.resource.acquire({ to: plan.to, amount: plan.amount }))
                    : tx.add(
                          endlessTx.resource.reallocate({
                              from: plan.from,
                              to: plan.to,
                              amount: plan.amount,
                          }),
                      );
            const transfersVec = tx.makeMoveVec({
                type: `${d.packageId}::resource::ResourceTransfer`,
                elements: [transfer],
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
            const res = await admin.client.signAndExecuteTransaction({
                transaction: tx,
                signer: admin.signer,
                options: { showEffects: true },
            });
            if (res.effects?.status?.status === 'success') {
                await admin.client.waitForTransaction({ digest: res.digest }).catch(() => {});
                // Disposal half: apply the validated transfers to the resource.
                const applied = await settleResolvedTransfers({
                    sagaId: ctx.sagaId,
                    capId: ctx.capId,
                    eventId: ev.eventId,
                    resourceIds: [resource.resourceId],
                    signer: admin.signer,
                    client: admin.client,
                });
                if (applied.ok) return true;
                console.warn('[event-spine] apply_resource_transfers failed:', applied.error);
                return false; // resolved, but settlement didn't land
            }
            console.warn('[event-spine] settling resolve aborted, falling back:', res.effects?.status?.error);
        }
    } catch (err) {
        console.warn('[event-spine] settlement errored, falling back to plain resolve:', err);
    }

    // Fallback: plain resolve so the event closes no matter what.
    await plainResolve(admin, ctx, ev).catch((err) =>
        console.warn('[event-spine] plain resolve failed:', err),
    );
    return false;
}

/** `empty_outcomes` resolve — the safety net that guarantees the event closes. */
async function plainResolve(admin: Admin, ctx: SpineCtx, ev: SpineOpenEvent): Promise<void> {
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
    await admin.client.signAndExecuteTransaction({
        transaction: tx,
        signer: admin.signer,
        options: { showEffects: true },
    });
}
