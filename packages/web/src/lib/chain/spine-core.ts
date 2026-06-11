/**
 * Event-spine core — pure lifecycle + settlement planning (no chain, no I/O).
 *
 * The ratified unit of a 回 is a **multi-tick BudgetEvent** (EVENT_LIFECYCLE.md).
 * A hard constraint shapes what "multi-tick" can mean on the DEPLOYED contract:
 * `event::resolve_event` flips the moment `participants.every(acted)`, and a
 * participant counts as "acted" after submitting ONE card (act.ts). So the chain
 * mechanic is **single-round** — true multi-round card play needs a redeploy.
 *
 * The achievable model this engine drives:
 *   tick T   open   — pushEvent + deal hands; the cast plays its one round
 *   T..T+n   linger — event stays OPEN (autoResolve off); POVs / reactions /
 *                     social beats accumulate, all keyed to the SAME event id
 *   T+n      resolve— resolve_event WITH resource transfers (the winner seizes
 *                     the contested DramaResource) → demand moves → world steps;
 *                     the cut weaves the whole event's accumulated POVs into one 回.
 *
 * This module is the deterministic brain: WHEN to open / linger / resolve, WHO
 * seizes the resource, and WHICH transfer to propose. The chain glue
 * (event-spine.ts) executes these decisions with existing tx helpers. Pure +
 * unit-tested (`spine-core.test.ts`).
 */

export interface SpineOpenEvent {
    eventId: string;
    sceneId: string;
    templateId: string;
    label: string;
    participantIds: string[];
    /** monotonic tick at which this event opened. */
    openedAtTick: number;
}

export interface SceneOccupant {
    characterId: string;
    sceneId: string;
}

export interface ContentionPick {
    templateId: string;
    label: string;
    statement?: string;
}

export interface SpineDecisionInput {
    /** the spine event currently tracked as OPEN for this saga, or null. */
    open: SpineOpenEvent | null;
    /** monotonic tick counter (advances once per loop run). */
    nowTick: number;
    /** linger at least this many ticks before settling (lets reactions land). */
    minTicks: number;
    /** force-resolve once this old (never hang an event open forever). */
    maxTicks: number;
    /** the contention to stage when opening a fresh event (from selectContention). */
    contention: ContentionPick | null;
    /** who is in which scene this tick (drives quorum + participant set). */
    occupancy: ReadonlyArray<SceneOccupant>;
    /** minimum co-located cast required to open an event (default 2). */
    minCast: number;
}

export type SpineStep =
    | { action: 'open'; sceneId: string; templateId: string; label: string; participantIds: string[] }
    | { action: 'continue'; eventId: string; age: number }
    | { action: 'resolve'; eventId: string; reason: 'settled' | 'maxAge' }
    | { action: 'idle'; reason: string };

/**
 * Decide the spine's single step this tick. One open event per saga at a time:
 * linger an open one until it has aged enough to settle (or hit max age), else
 * open a fresh event on the busiest quorum scene for the chosen contention.
 */
export function decideSpineStep(input: SpineDecisionInput): SpineStep {
    const { open, nowTick, minTicks, maxTicks } = input;

    if (open) {
        const age = nowTick - open.openedAtTick;
        if (age >= maxTicks) return { action: 'resolve', eventId: open.eventId, reason: 'maxAge' };
        if (age >= minTicks) return { action: 'resolve', eventId: open.eventId, reason: 'settled' };
        return { action: 'continue', eventId: open.eventId, age };
    }

    if (!input.contention) return { action: 'idle', reason: 'no contention' };

    // Busiest scene meeting quorum becomes the stage; its occupants are the cast.
    const byScene = new Map<string, string[]>();
    for (const o of input.occupancy) {
        const arr = byScene.get(o.sceneId);
        if (arr) arr.push(o.characterId);
        else byScene.set(o.sceneId, [o.characterId]);
    }
    const minCast = Math.max(2, input.minCast);
    const busiest = [...byScene.entries()]
        .filter(([, ids]) => ids.length >= minCast)
        .sort((a, b) => b[1].length - a[1].length)[0];
    if (!busiest) return { action: 'idle', reason: 'no scene with quorum' };

    return {
        action: 'open',
        sceneId: busiest[0],
        templateId: input.contention.templateId,
        label: input.contention.label,
        participantIds: busiest[1],
    };
}

/* ── settlement: who seizes the contested resource, and the transfer ──────── */

export interface AllocationView {
    resourceId: string;
    label: string;
    capacity: bigint;
    /** holder character id → units currently held. */
    allocations: Record<string, bigint>;
}

export interface TensionView {
    characterId: string;
    /** the desire statement (carries the contested resource label). */
    statement: string;
    /** 0..1 unmet-ness; higher = wants it more. */
    tension: number;
}

/** Map a contention template id to its DramaResource (by label keyword). */
export function resourceForContention(
    resources: ReadonlyArray<AllocationView>,
    templateId: string,
): AllocationView | null {
    const keyword = templateId.split(':')[1]; // 'contention:recording' → 'recording'
    if (!keyword) return null;
    return (
        resources.find((r) => r.label.startsWith(keyword) || r.label.includes(keyword)) ?? null
    );
}

/**
 * Choose who seizes the contested resource at settlement: among the event's
 * participants, the one with the highest tension toward THIS resource. Ties and
 * "nobody wants it" resolve to null (settle nothing — don't move a slot no one
 * is pushing for). Pure.
 */
export function chooseSettlementWinner(
    participantIds: ReadonlyArray<string>,
    tensions: ReadonlyArray<TensionView>,
    resourceLabelKeyword: string,
): string | null {
    const cast = new Set(participantIds);
    let best: { id: string; tension: number } | null = null;
    let tied = false;
    for (const t of tensions) {
        if (!cast.has(t.characterId)) continue;
        if (!t.statement.includes(resourceLabelKeyword)) continue;
        if (t.tension <= 0) continue;
        if (!best || t.tension > best.tension) {
            best = { id: t.characterId, tension: t.tension };
            tied = false;
        } else if (t.tension === best.tension && t.characterId !== best.id) {
            tied = true;
        }
    }
    if (!best || tied) return null;
    return best.id;
}

export interface ResourceTransferPlan {
    resourceId: string;
    /** current holder to take a unit from, or null to draw from free capacity. */
    from: string | null;
    to: string;
    amount: bigint;
}

/**
 * Plan ONE unit transfer of the contested resource to the winner. Draws from
 * free capacity if any; otherwise reallocates a unit from the largest current
 * holder that isn't the winner. Returns null when the winner already holds it
 * and there's nothing to move, or the resource is at zero capacity. Pure — the
 * Move side re-validates conservation, so this only PROPOSES.
 */
export function planResourceTransfer(
    resource: AllocationView,
    winnerId: string,
): ResourceTransferPlan | null {
    const held = Object.values(resource.allocations).reduce((s, v) => s + v, 0n);
    const free = resource.capacity - held;
    if (free > 0n) {
        return { resourceId: resource.resourceId, from: null, to: winnerId, amount: 1n };
    }
    // Fully allocated: take from the largest holder who isn't the winner.
    let donor: { id: string; size: bigint } | null = null;
    for (const [id, size] of Object.entries(resource.allocations)) {
        if (id === winnerId || size <= 0n) continue;
        if (!donor || size > donor.size) donor = { id, size };
    }
    if (!donor) return null; // nobody to take from (winner already holds it all)
    return { resourceId: resource.resourceId, from: donor.id, to: winnerId, amount: 1n };
}
