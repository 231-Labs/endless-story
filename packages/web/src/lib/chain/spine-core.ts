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
    /** monotonic tick at which this event opened. CLOCK-DERIVED (clockTickOf of
     *  the on-chain createdAtMs) so age survives process restarts — see clockTickOf. */
    openedAtTick: number;
}

/** A live open event as read back from chain (BudgetEventPushed + the object's
 *  meta.status/title/deck.participants). The authoritative open set; the in-memory
 *  registry is only a warm cache reconciled against this each tick. */
export interface ChainOpenEvent {
    eventId: string;
    sceneId: string;
    /** on-chain clock::timestamp_ms at push (event.move). */
    createdAtMs: number;
    participantIds: string[];
    /** meta.title — the reader-facing 回 heading. */
    label: string;
}

/**
 * Derive a monotonic "tick" from a wall-clock timestamp (ms). This REPLACES the
 * per-process in-memory tick counter: age = clockTickOf(now) − clockTickOf(createdAtMs),
 * so an event's age is a function of the on-chain push timestamp, not of how many
 * times THIS process has looped. A restarted/replaced process therefore computes
 * the same age and resolves the event on schedule instead of leaving it open forever.
 */
export function clockTickOf(ms: number, windowMs: number): number {
    return Math.floor(ms / Math.max(1, windowMs));
}

/**
 * Reconcile the chain's authoritative open set with the in-memory cache. Events
 * already cached keep their rich metadata (templateId + label + the POVs this
 * process has accumulated). Events open on chain but missing from the cache —
 * orphaned when the process was recycled between ticks — are adopted from chain
 * truth with a clock-derived `openedAtTick` so they age and resolve like any
 * other (settlement falls back to a cast-tension-derived resource when the
 * templateId is unknown). Pure.
 */
export function reconcileOpenEvents(
    chainOpen: ReadonlyArray<ChainOpenEvent>,
    cached: ReadonlyArray<SpineOpenEvent>,
    windowMs: number,
): SpineOpenEvent[] {
    const cachedById = new Map(cached.map((e) => [e.eventId, e]));
    return chainOpen.map((c) => {
        const hit = cachedById.get(c.eventId);
        if (hit) return hit;
        return {
            eventId: c.eventId,
            sceneId: c.sceneId,
            templateId: '', // orphan: unknown axis → settle derives the resource from cast tension
            label: c.label || '一場戲',
            participantIds: c.participantIds,
            openedAtTick: clockTickOf(c.createdAtMs, windowMs),
        };
    });
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

/* ── PARALLEL events (Stage 1): many open events per saga, one per axis ────── */

/** A potential event to open: one contention AXIS, its best quorum scene, and
 *  the co-located characters who actually ache for it. Built by the glue from
 *  the (attention-coupled) tension rows + occupancy. */
export interface AxisCandidate {
    templateId: string;
    label: string;
    statement?: string;
    sceneId: string;
    participantIds: string[];
    /** max tension across this axis's desirers — candidates are tried in this order. */
    priority: number;
}

export interface MultiSpineInput {
    /** every event currently tracked OPEN for this saga (one per axis). */
    openEvents: ReadonlyArray<SpineOpenEvent>;
    nowTick: number;
    minTicks: number;
    maxTicks: number;
    /** at most this many events may be OPEN at once (after this tick). */
    maxConcurrent: number;
    /** axis candidates, highest priority first. */
    candidates: ReadonlyArray<AxisCandidate>;
    minCast: number;
}

/**
 * Decide EVERY spine step this tick across all axes (Stage 1 parallel events).
 * Each open event lingers/​resolves by age independently; then, while under the
 * concurrency cap, the highest-priority axes that have NO open event and meet
 * quorum are opened. One event per axis at a time (you can't hold two
 * simultaneous fights over the SAME slot); orthogonal axes (e.g. recording vs
 * partnership) run concurrently. An axis being resolved this tick is NOT
 * reopened the same tick (anti-flap). Pure.
 */
export function decideSpineSteps(input: MultiSpineInput): SpineStep[] {
    const { openEvents, nowTick, minTicks, maxTicks } = input;
    const steps: SpineStep[] = [];
    const openAxes = new Set<string>();
    let live = 0; // events still OPEN after this tick (continued + newly opened)

    for (const ev of openEvents) {
        openAxes.add(ev.templateId);
        const age = nowTick - ev.openedAtTick;
        if (age >= maxTicks) steps.push({ action: 'resolve', eventId: ev.eventId, reason: 'maxAge' });
        else if (age >= minTicks) steps.push({ action: 'resolve', eventId: ev.eventId, reason: 'settled' });
        else {
            steps.push({ action: 'continue', eventId: ev.eventId, age });
            live++;
        }
    }

    const minCast = Math.max(2, input.minCast);
    const cap = Math.max(1, input.maxConcurrent);
    for (const c of input.candidates) {
        if (live >= cap) break;
        if (openAxes.has(c.templateId)) continue; // one event per axis (or just resolved)
        if (c.participantIds.length < minCast) continue;
        steps.push({
            action: 'open',
            sceneId: c.sceneId,
            templateId: c.templateId,
            label: c.label,
            participantIds: c.participantIds,
        });
        openAxes.add(c.templateId);
        live++;
    }

    if (steps.length === 0) steps.push({ action: 'idle', reason: 'no open events, no quorum axis' });
    return steps;
}

/** A tension row as seen by candidate-building (post attention-coupling). */
export interface AxisTensionRow {
    characterId: string;
    statement: string;
    tension: number;
}

/**
 * Group tension rows into per-axis candidates: map each desire statement to its
 * contention framing, gather the co-located desirers, and stage each axis in the
 * scene holding the most of them. Returns candidates sorted by priority (max
 * tension on the axis) desc. Pure — `framingOf` is injected (event-planner's
 * `framingForStatement`) so this stays unit-testable without that import.
 */
export function buildAxisCandidates(
    rows: ReadonlyArray<AxisTensionRow>,
    occupancy: ReadonlyArray<SceneOccupant>,
    framingOf: (statement?: string) => { templateId: string; label: string },
): AxisCandidate[] {
    const sceneOf = new Map<string, string>();
    for (const o of occupancy) sceneOf.set(o.characterId, o.sceneId);

    // axis → { label, statement, priority, per-scene desirer ids }
    interface Acc {
        templateId: string;
        label: string;
        statement?: string;
        priority: number;
        byScene: Map<string, Set<string>>;
    }
    const axes = new Map<string, Acc>();
    for (const r of rows) {
        if (r.tension <= 0) continue;
        const sceneId = sceneOf.get(r.characterId);
        if (!sceneId) continue; // not co-located anywhere this tick
        const framing = framingOf(r.statement);
        let acc = axes.get(framing.templateId);
        if (!acc) {
            acc = { templateId: framing.templateId, label: framing.label, statement: r.statement, priority: r.tension, byScene: new Map() };
            axes.set(framing.templateId, acc);
        }
        if (r.tension > acc.priority) {
            acc.priority = r.tension;
            acc.label = framing.label;
            acc.statement = r.statement;
        }
        const set = acc.byScene.get(sceneId) ?? new Set<string>();
        set.add(r.characterId);
        acc.byScene.set(sceneId, set);
    }

    const candidates: AxisCandidate[] = [];
    for (const acc of axes.values()) {
        // stage the axis in the scene with the most of its desirers
        let best: { sceneId: string; ids: string[] } | null = null;
        for (const [sceneId, ids] of acc.byScene) {
            if (!best || ids.size > best.ids.length) best = { sceneId, ids: [...ids] };
        }
        if (!best) continue;
        candidates.push({
            templateId: acc.templateId,
            label: acc.label,
            statement: acc.statement,
            sceneId: best.sceneId,
            participantIds: best.ids,
            priority: acc.priority,
        });
    }
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates;
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
 * Pick which resource an event was contesting. Prefer the templateId mapping
 * (the warm path); when that's unknown — an orphan event adopted from chain after
 * a restart has no templateId — fall back to the resource the event's cast most
 * wants, summing each participant's tension toward each resource (label keyword in
 * the tension statement). Returns null only when nobody in the cast pushes for
 * anything (then settlement is a no-op plain resolve). Pure.
 */
export function pickContestedResource(
    resources: ReadonlyArray<AllocationView>,
    templateId: string,
    participantIds: ReadonlyArray<string>,
    tensions: ReadonlyArray<TensionView>,
): AllocationView | null {
    const byTemplate = resourceForContention(resources, templateId);
    if (byTemplate) return byTemplate;
    const cast = new Set(participantIds);
    let best: { resource: AllocationView; pull: number } | null = null;
    for (const r of resources) {
        const keyword = r.label.split(':')[1] ?? r.label;
        let pull = 0;
        for (const t of tensions) {
            if (!cast.has(t.characterId)) continue;
            if (t.tension <= 0) continue;
            if (!t.statement.includes(keyword) && !t.statement.includes(r.label)) continue;
            pull += t.tension;
        }
        if (pull > 0 && (!best || pull > best.pull)) best = { resource: r, pull };
    }
    return best?.resource ?? null;
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
