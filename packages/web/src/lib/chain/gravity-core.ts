/**
 * Gravity core — the pure "rivals are drawn to the contest" rule (no chain, no
 * LLM, no I/O). This is the mechanism the move phase will use so contested
 * events reliably FORM: every contender of a resource computes the SAME global
 * attractor — the scene holding the plurality of that resource's contenders,
 * with a deterministic tiebreak — so they converge on ONE stage instead of
 * chasing each other around.
 *
 * Why a GLOBAL plurality (not "move toward the nearest rival"): if each agent
 * chased a specific rival, two rivals in scenes A and B would swap places every
 * tick (A→B, B→A) and never meet — an oscillation. Because `attractorScene` is a
 * function of the whole contender distribution + a deterministic tiebreak, ALL
 * contenders of a resource compute the *identical* target, so they collapse onto
 * one scene. That is the convergence guarantee.
 *
 * Decoupled mathematical verification of attraction / cohesion / dispersal lives
 * in gravity-core.test.ts (mechanism) and gravity-sim.test.ts (macro dynamics).
 */

export type SceneId = string;
export type AgentId = string;

/**
 * The plurality attractor: the scene holding the most of `contenderScenes`,
 * ties broken by smallest sceneId. A GLOBAL deterministic rule — every contender
 * fed the same distribution returns the same scene, so they converge (never
 * oscillate). Returns null only for an empty input.
 */
export function attractorScene(contenderScenes: ReadonlyArray<SceneId>): SceneId | null {
    const count = new Map<SceneId, number>();
    for (const s of contenderScenes) count.set(s, (count.get(s) ?? 0) + 1);
    let best: SceneId | null = null;
    let bestN = -1;
    for (const [s, n] of count) {
        if (n > bestN || (n === bestN && best !== null && s < best)) {
            best = s;
            bestN = n;
        }
    }
    return best;
}

/** One desire pulling an agent: a contested resource, how badly it's wanted, and
 *  where THIS resource's contenders currently sit (including the agent itself). */
export interface ActiveDesire {
    resourceId: string;
    /** 0..1 unmet-ness. */
    tension: number;
    /** current scenes of every contender of this resource. */
    contenderScenes: SceneId[];
}

/**
 * Where agent `here` is pulled this tick: the attractor of its DOMINANT active
 * desire (tension ≥ `threshold`), or null when nothing pulls it (every desire is
 * settled / below threshold) — in which case the caller leaves the agent to its
 * ordinary idle motion. Dominant desire = highest tension, ties broken by
 * resourceId (deterministic). The returned scene may equal `here` (already on the
 * stage → stay put, which is the cohesion fixed point).
 */
export function gravityTarget(
    here: SceneId,
    desires: ReadonlyArray<ActiveDesire>,
    threshold: number,
): SceneId | null {
    let dom: ActiveDesire | null = null;
    for (const d of desires) {
        if (d.tension < threshold) continue;
        if (
            !dom ||
            d.tension > dom.tension ||
            (d.tension === dom.tension && d.resourceId < dom.resourceId)
        ) {
            dom = d;
        }
    }
    if (!dom) return null;
    return attractorScene(dom.contenderScenes);
}

/* ── settled-resource cooldown (relief term #1, verified in gravity-sim) ─────
 * After a contest settles, its resource must STOP pulling for a while or a
 * ≥3-way rivalry thrashes the slot and never disperses (gravity-sim.test.ts (C)).
 * Process-level: the spine cools a resource on resolve; the move phase ticks the
 * countdown once per loop and skips cooled resources. */
const cooldownTicks = new Map<string, number>();

/** Put a just-settled resource on cooldown for `ticks` (exerts no pull). */
export function coolResource(resourceId: string, ticks: number): void {
    if (ticks > 0) cooldownTicks.set(resourceId, ticks);
}
/** Decrement every cooldown by one (call exactly once per tick). */
export function tickResourceCooldowns(): void {
    for (const [id, n] of cooldownTicks) {
        if (n <= 1) cooldownTicks.delete(id);
        else cooldownTicks.set(id, n - 1);
    }
}
export function resourceOnCooldown(resourceId: string): boolean {
    return (cooldownTicks.get(resourceId) ?? 0) > 0;
}
/** Test-only: clear all cooldowns. */
export function _resetResourceCooldowns(): void {
    cooldownTicks.clear();
}

/** Inputs for `gravityTargetsForContenders` — plain data, no app/chain types. */
export interface ContenderInputs {
    /** characterId → current sceneId (only characters with a known scene). */
    sceneByChar: Map<string, SceneId>;
    /** resourceId → the characterIds that contend for it. */
    contendersByResource: Map<string, string[]>;
    /** characterId → resourceIds they already HOLD (a holder isn't pulled). */
    heldByChar: Map<string, Set<string>>;
}

/**
 * The live binding: for every character, derive its active desires (resources it
 * contends, not on cooldown, not already held) with their contenders' current
 * scenes, then resolve the gravity attractor. Returns characterId → attractor
 * sceneId — which MAY equal the character's current scene (meaning "stay", the
 * cohesion fixed point). Pure (the cooldown registry is the only process state).
 */
export function gravityTargetsForContenders(inp: ContenderInputs): Map<string, SceneId> {
    const out = new Map<string, SceneId>();
    for (const [charId, here] of inp.sceneByChar) {
        const desires: ActiveDesire[] = [];
        for (const [resourceId, contenders] of inp.contendersByResource) {
            if (!contenders.includes(charId)) continue;
            if (resourceOnCooldown(resourceId)) continue;
            if (inp.heldByChar.get(charId)?.has(resourceId)) continue;
            const contenderScenes = contenders
                .map((id) => inp.sceneByChar.get(id))
                .filter((s): s is SceneId => s !== undefined);
            if (contenderScenes.length === 0) continue;
            desires.push({ resourceId, tension: 1, contenderScenes });
        }
        const target = gravityTarget(here, desires, 0.5);
        if (target) out.set(charId, target);
    }
    return out;
}
