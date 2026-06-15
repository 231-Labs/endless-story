/**
 * Drama engine — off-chain DEMAND core (pure; no chain, no I/O).
 *
 * This is the deterministic half of the Desire/Resource drama engine, sitting
 * on the product side. It imports ONLY `@endless-story/drama` (the pure
 * transition + types) — never the SDK, memwal, or any chain code — so every
 * function here is unit-testable and byte-reproducible.
 *
 * Division of labour (the load-bearing design):
 *   - SUPPLY  (scarcity)        = on-chain `resource.move` ledger. Authoritative.
 *   - DEMAND  (felt satisfaction) = THIS layer. A deterministic function of the
 *     allocation history + tuning. NOT stored on chain; recomputable by anyone.
 *
 * Each tick we read the *current* on-chain allocation, relax every desire's
 * satisfaction one step toward the target that allocation implies (`applyTick`
 * with NO actions — the transfers already happened on chain via
 * `event::resolve_event`), and derive tension. The off-chain engine never
 * moves supply; it only feels it. That keeps the two sides independent and the
 * whole thing verifiable: re-run `applyTick(beat.input, [], TUNING)` and you
 * reproduce `beat.output` byte-for-byte.
 */
import {
    applyTickVerbose,
    tension,
    SCALE,
    type Action,
    type AgentState,
    type Desire,
    type Resource,
    type TuningConfig,
    type WorldState,
} from '@endless-story/drama';

/** One desire's derived tension, narrative-labelled + display-ready. Distinct
 *  from the engine's bare `TensionPoint` (we carry the statement + sort). */
export interface DramaTensionRow {
    agentId: string;
    desireId: string;
    statement: string;
    /** scaled [0..SCALE]; use `tensionFraction` for a 0..1 display value. */
    value: bigint;
}

/** Schema version stamped into every committed beat blob. */
export const DRAMA_BEAT_VERSION = 1 as const;
export const DRAMA_BEAT_KIND = 'drama-beat' as const;

/**
 * The tuning the product COMMITS to. Pinned to the conformance test
 * (`packages/drama/test/onchain-conformance.test.ts`) + the simulator
 * writeup so the live beats reproduce the calibrated curve. Loss aversion:
 * alphaDown (fall) > alphaUp (rise). Habituation: gamma > 0.
 */
export const DRAMA_TUNING: TuningConfig = {
    alphaUp: 300_000n,
    alphaDown: 600_000n,
    gamma: 50_000n,
};

/* ── plain-data snapshots (what the chain layer hands us) ──────────────── */

/** A DramaResource as read off chain — supply truth for one beat. */
export interface ResourceSnapshot {
    /** on-chain object id of the DramaResource. */
    id: string;
    /** structural "bone" kind (e.g. "capacity-1-slot"). */
    archetype: string;
    /** human label (e.g. "partnership:Meng"). */
    label: string;
    capacity: bigint;
    /** holder (Character id) -> units held, straight from the on-chain Table. */
    allocations: Record<string, bigint>;
}

/**
 * A character's declared desire. `ref` in each claim names a resource by
 * (id | label | archetype) — resolved to a live resource id at world-build
 * time, so desires stay stable while the underlying on-chain object id varies.
 */
export interface DesireSpec {
    id: string;
    statement: string;
    weight: bigint;
    baseline: bigint;
    volatility: bigint;
    claims: { ref: string; claim: bigint }[];
}

export interface AgentSpec {
    id: string;
    /** display name (narrative-facing; used for prompt hints). */
    name?: string;
    /** Public chain tags such as `role:<role-type>`. */
    tags?: string[];
    desires: DesireSpec[];
}

/* ── default desires (deterministic, zero-config contention) ───────────── */

export interface DefaultDesireOptions {
    /** Current agent display name. Used to avoid giving a named target a self-partnership desire. */
    agentName?: string;
    /** Public chain tags such as `role:<role-type>`. */
    agentTags?: string[];
}

/**
 * With no authored desires, every cast member is given ONE desire per contested
 * resource: "I want to hold this scarce thing." That is the purest contention —
 * N performers, a capacity-1 partnership slot, whoever lacks it is tenser. The
 * LLM director can later author richer per-character desires (the `skin`); this
 * is the structural floor (the `bone`).
 *
 * A "contested" resource = capacity small enough that not everyone can hold it.
 * We treat capacity ≤ cast-size as contested; in practice the partnership slot
 * (capacity 1) always qualifies.
 */
/**
 * 行當 → how strongly it WANTS each resource kind (0..1). Ambition, not ability —
 * a 武旦 can want 唱片 (weakly) and lose on competence; a 花旦 can be pressed into
 * 武戲 (rarely, via the contest floor). Substring match on role, most specific
 * first; unknown role/kind → AMBITION_FALLBACK. This is the deterministic backbone
 * of intent; richer per-character (memory-derived) desire can modulate it later.
 */
const ROLE_AMBITION: { match: string[]; a: Record<string, number> }[] = [
    { match: ['刀馬旦', '武旦', '武生', '武小生'], a: { martial: 0.95, spotlight: 0.6, partnership: 0.6, naming: 0.5, patronage: 0.4, recording: 0.3 } },
    { match: ['花旦', '青衣', '正旦', '坤伶', '旦'], a: { spotlight: 0.9, recording: 0.8, naming: 0.7, partnership: 0.6, patronage: 0.5, martial: 0.2 } },
    { match: ['坤生', '乾生', '小生'], a: { spotlight: 0.85, recording: 0.8, partnership: 0.7, naming: 0.6, patronage: 0.5, martial: 0.5 } },
    { match: ['老生', '鬚生', '老旦'], a: { recording: 0.7, spotlight: 0.7, naming: 0.6, patronage: 0.6, partnership: 0.5, martial: 0.3 } },
    { match: ['丑'], a: { naming: 0.6, patronage: 0.6, spotlight: 0.5, partnership: 0.4, martial: 0.4, recording: 0.3 } },
    { match: ['淨', '大面', '花臉', '銅錘'], a: { martial: 0.7, spotlight: 0.6, patronage: 0.5, partnership: 0.5, naming: 0.5, recording: 0.4 } },
    { match: ['班主', '掌事', '當家', '東家'], a: { patronage: 0.5, naming: 0.4, spotlight: 0.3, partnership: 0.2, martial: 0.2, recording: 0.2 } },
];
const AMBITION_FALLBACK = 0.5;
const AMBITION_MIN = 0.15;

function primaryRoleFromTags(tags: string[] | undefined): string {
    const roleTag = (tags ?? []).find((t) => t.startsWith('role:'));
    return roleTag ? roleTag.slice('role:'.length) : '';
}

function roleResourceAmbition(role: string, kind: string): number {
    const row = ROLE_AMBITION.find((g) => g.match.some((kw) => role.includes(kw)));
    if (!row) return AMBITION_FALLBACK;
    return row.a[kind] ?? AMBITION_FALLBACK;
}

/** Scale the unit weight (SCALE) by ambition 0..1 → the desire's intent magnitude. */
function scaleByAmbition(ambition: number): bigint {
    const pct = Math.max(0, Math.min(100, Math.round(ambition * 100)));
    return (SCALE * BigInt(pct)) / 100n;
}

export function defaultDesiresForCast(
    resources: ResourceSnapshot[],
    castSize: number,
    opts: DefaultDesireOptions = {},
): DesireSpec[] {
    const specs: DesireSpec[] = [];
    const role = primaryRoleFromTags(opts.agentTags);
    for (const r of resources) {
        // skip resources nobody has to compete for (capacity ≥ cast → everyone fits)
        if (castSize > 0 && r.capacity >= BigInt(castSize)) continue;
        // A named partnership slot is something other performers desire; the
        // named star should not want a partnership with themself.
        if (opts.agentName && isSelfPartnership(r, opts.agentName)) continue;
        if (isPartnership(r) && !isEligiblePartnershipAgent(opts)) continue;
        // Stage-performer resources (headliner spotlight / recording) are contested
        // only among on-stage actors. A confirmed backstage role (musician / wardrobe /
        // business / press) never competes for them — a lead-fiddle desiring the
        // headliner spotlight was the role-resource mismatch bug (partnership is already
        // gated to the young-male-lead side above).
        if (isPerformerResource(r) && isBackstageAgent(opts)) continue;
        const want = r.capacity > 0n ? 1n : 0n; // want one unit of the scarce thing
        if (want === 0n) continue;
        // 行當-shaped intent (the "skin" the comment promised): how much THIS 行當
        // wants THIS kind of resource (0..1). It scales the desire WEIGHT, which is
        // linear into tension (= the contest's intent), so a 花旦 burns for 頭牌/唱片
        // but barely for 武戲, and a 武旦 the reverse. Below AMBITION_MIN ⇒ not a
        // contender for it (the contest's 臨危受命 floor can still thrust an able
        // event-participant in). Uniform desire was the old structural floor (bone);
        // this is the role-shaped skin, kept deterministic + data-driven.
        const kind = (r.label.split(':')[0] || '').trim();
        const ambition = roleResourceAmbition(role, kind);
        if (ambition < AMBITION_MIN) continue;
        specs.push({
            id: `hold:${r.label || r.archetype || r.id}`,
            statement: desireStatementFor(r),
            weight: scaleByAmbition(ambition),
            baseline: 200_000n,
            volatility: SCALE,
            claims: [{ ref: r.id, claim: want }],
        });
    }
    return specs;
}

function isPartnership(r: ResourceSnapshot): boolean {
    return r.label.startsWith('partnership:');
}

/** Resources only on-stage actors compete for: the headliner spotlight, the
 *  recording slot, the old-world 堂會 patronage circuit, and the press's naming
 *  power. (partnership is handled by its own young-male-lead gate.) Backstage
 *  roles — musicians / wardrobe / business / press — never compete for these. */
function isPerformerResource(r: ResourceSnapshot): boolean {
    return (
        r.label.startsWith('spotlight:') ||
        r.label.startsWith('recording:') ||
        r.label.startsWith('patronage:') ||
        r.label.startsWith('naming:') ||
        r.label.startsWith('martial:')
    );
}

/** True only when a role tag POSITIVELY marks the agent as backstage —
 *  musicians, wardrobe, or business/press (see isBackstageRole regex). We never
 *  infer backstage from absence of a tag, so real performers are never excluded. */
function isBackstageAgent(opts: DefaultDesireOptions): boolean {
    return (opts.agentTags ?? [])
        .filter((tag) => tag.startsWith('role:'))
        .map((tag) => tag.slice('role:'.length))
        .some(isBackstageRole);
}

function isBackstageRole(role: string): boolean {
    return /胡|琴|鼓|笛|嗩吶|鑼|鈸|弦|場面|文場|武場|樂師|樂工|伴奏|箱管|管箱|衣箱|盔箱|梳頭|檢場|跟包|經理|帳房|賬房|票房|掮客|副刊|寫手|記者|報人|攝影|影戲/.test(
        role,
    );
}

function isEligiblePartnershipAgent(opts: DefaultDesireOptions): boolean {
    const roleTags = (opts.agentTags ?? [])
        .filter((tag) => tag.startsWith('role:'))
        .map((tag) => tag.slice('role:'.length));
    // New tagged characters are strict: only young-male-lead-side roles can desire a
    // partnership slot with a female-lead target.
    if (roleTags.length > 0) return roleTags.some(isXiaoshengRole);
    // If tags are present but none says role, do not infer eligibility from
    // unrelated public status labels.
    if ((opts.agentTags ?? []).length > 0) return false;
    // Legacy fallback for older untagged demo characters. Keeps old mints from
    // going fully inert until their public tags are migrated.
    return opts.agentName ? /生|柳/.test(opts.agentName) : true;
}

function isXiaoshengRole(role: string): boolean {
    return ['小生', '文小生', '武小生', '武生', '坤生', '女小生'].some((r) => role.includes(r));
}

function isSelfPartnership(r: ResourceSnapshot, agentName: string): boolean {
    if (!r.label.startsWith('partnership:')) return false;
    return compactName(r.label.slice('partnership:'.length)) === compactName(agentName);
}

function compactName(name: string): string {
    return name.trim().replace(/\s+/g, '');
}

function desireStatementFor(r: ResourceSnapshot): string {
    // The statement MUST carry a matchable token so the storylet opener
    // (framingForStatement → parseDirectorContention) and the settlement matchers
    // can tie a tension back to its resource: partnership uses 「…搭戲」 (caught by
    // framingForStatement); every other kind keeps the 「<kind>:<display>」 label so
    // `parseDirectorContention` recovers the kind. Prose-facing consumers strip the
    // label via `humanResourceFromStatement`, so the raw token never reaches readers.
    if (r.label.startsWith('partnership:')) return `與${r.label.slice('partnership:'.length)}搭戲`;
    if (r.label) return `爭得「${r.label}」`;
    return `爭得一席（${r.archetype || '稀缺資源'}）`;
}

/* ── resolve specs → engine world ─────────────────────────────────────── */

function resolveRef(ref: string, byId: Map<string, ResourceSnapshot>): string | null {
    if (byId.has(ref)) return ref;
    for (const r of byId.values()) {
        if (r.label === ref || r.archetype === ref) return r.id;
    }
    return null;
}

/** Stable key for one desire's satisfaction across beats. */
export function satKey(agentId: string, desireId: string): string {
    return `${agentId} ${desireId}`;
}

/** Pull every desire's satisfaction out of a world into a flat carry-over map. */
export function extractSatisfaction(world: WorldState): Map<string, bigint> {
    const m = new Map<string, bigint>();
    for (const a of world.agents) for (const d of a.desires) m.set(satKey(a.id, d.id), d.satisfaction);
    return m;
}

/**
 * Build the engine `WorldState` from supply snapshots + declared desires,
 * seeding each desire's satisfaction from the carry-over map (prior beat) or
 * its baseline on first sight. Desires whose claims resolve to no live
 * resource are dropped (graceful: the character simply has no structural
 * tension on that axis yet).
 */
export function buildWorld(
    resources: ResourceSnapshot[],
    agents: AgentSpec[],
    priorSatisfaction: Map<string, bigint>,
    tick: bigint,
): WorldState {
    const byId = new Map(resources.map((r) => [r.id, r]));
    const engineResources: Record<string, Resource> = {};
    for (const r of resources) {
        const allocations: Record<string, bigint> = {};
        for (const [holder, units] of Object.entries(r.allocations)) allocations[holder] = units;
        engineResources[r.id] = { id: r.id, capacity: r.capacity, allocations };
    }

    const engineAgents: AgentState[] = agents.map((a) => {
        const desires: Desire[] = [];
        for (const spec of a.desires) {
            const draws_from = spec.claims
                .map((c) => ({ resource_id: resolveRef(c.ref, byId), claim: c.claim }))
                .filter((c): c is { resource_id: string; claim: bigint } => c.resource_id !== null);
            if (draws_from.length === 0) continue; // nothing on chain feeds this desire
            const prior = priorSatisfaction.get(satKey(a.id, spec.id));
            desires.push({
                id: spec.id,
                statement: spec.statement,
                weight: spec.weight,
                satisfaction: prior ?? spec.baseline,
                baseline: spec.baseline,
                volatility: spec.volatility,
                draws_from,
            });
        }
        return { id: a.id, desires };
    });

    return { agents: engineAgents, resources: engineResources, tick };
}

/* ── derive one beat ──────────────────────────────────────────────────── */

export interface DerivedBeat {
    /** the world AFTER relaxation (next satisfaction). */
    next: WorldState;
    /** derived tension per (agent, desire), highest first within each agent. */
    tensions: DramaTensionRow[];
}

/**
 * Advance the DEMAND side by one beat: relax satisfaction toward the target the
 * current allocation implies. `actions` defaults to NONE — supply moved on
 * chain already; here we only feel it. (Off-chain-only budget resources with a
 * `refill` could pass actions, but the on-chain ledger never does.)
 */
export function deriveBeat(world: WorldState, actions: Action[] = []): DerivedBeat {
    const { world: next } = applyTickVerbose(world, actions, DRAMA_TUNING);
    const tensions: DramaTensionRow[] = [];
    for (const a of next.agents) {
        const rows = a.desires
            .map((d) => ({ agentId: a.id, desireId: d.id, statement: d.statement, value: tension(d) }))
            .sort((x, y) => (y.value > x.value ? 1 : y.value < x.value ? -1 : 0));
        tensions.push(...rows);
    }
    return { next, tensions };
}

/* ── prompt hint ──────────────────────────────────────────────────────── */

/** tension bigint ([0..SCALE]) → 0..1 fraction for display. */
export function tensionFraction(t: bigint): number {
    return Number((t * 10_000n) / SCALE) / 10_000;
}

function tensionBand(frac: number): string {
    if (frac >= 0.75) return '熾烈而未得償';
    if (frac >= 0.5) return '灼人';
    if (frac >= 0.25) return '隱隱作痛';
    return '尚可按捺';
}

/**
 * A short Chinese line describing the agent's dominant unmet desire, for
 * injection into decide/POV prompts. Returns null when the agent has no
 * structural tension (no resolved desires) — callers omit the hint entirely.
 */
export function dramaHintForAgent(world: WorldState, agentId: string): string | null {
    const agent = world.agents.find((a) => a.id === agentId);
    if (!agent || agent.desires.length === 0) return null;
    let top: Desire | null = null;
    let topT = -1n;
    for (const d of agent.desires) {
        const t = tension(d);
        if (t > topT) {
            topT = t;
            top = d;
        }
    }
    if (!top) return null;
    const frac = tensionFraction(topT);
    return `【內在張力】你對「${top.statement}」的渴望此刻${tensionBand(frac)}（張力 ${frac.toFixed(2)}）。`;
}

/* ── serialize / parse / verify a committed beat ──────────────────────── */

interface SerializedResource {
    id: string;
    capacity: string;
    allocations: Record<string, string>;
    refill?: { to: string; amount: string };
}
interface SerializedDesire {
    id: string;
    statement: string;
    weight: string;
    satisfaction: string;
    baseline: string;
    volatility: string;
    draws_from: { resource_id: string; claim: string }[];
}
interface SerializedWorld {
    tick: string;
    resources: Record<string, SerializedResource>;
    agents: { id: string; desires: SerializedDesire[] }[];
}

export interface SerializedBeat {
    v: typeof DRAMA_BEAT_VERSION;
    kind: typeof DRAMA_BEAT_KIND;
    sagaId: string;
    tick: string;
    tuning: { alphaUp: string; alphaDown: string; gamma: string };
    /** the world BEFORE relaxation (prior satisfaction + the on-chain allocation). */
    input: SerializedWorld;
    /** always empty for on-chain-settled supply; recorded for completeness. */
    actions: never[];
    /** the world AFTER relaxation + the derived tensions. */
    output: { world: SerializedWorld; tensions: { agentId: string; desireId: string; value: string }[] };
    /** commitment id of the prior beat (chains the history); null at genesis. */
    prevCommitmentId: string | null;
}

function serWorld(w: WorldState): SerializedWorld {
    const resources: Record<string, SerializedResource> = {};
    for (const [id, r] of Object.entries(w.resources)) {
        const allocations: Record<string, string> = {};
        for (const [h, u] of Object.entries(r.allocations)) allocations[h] = u.toString();
        resources[id] = {
            id: r.id,
            capacity: r.capacity.toString(),
            allocations,
            ...(r.refill ? { refill: { to: r.refill.to, amount: r.refill.amount.toString() } } : {}),
        };
    }
    return {
        tick: w.tick.toString(),
        resources,
        agents: w.agents.map((a) => ({
            id: a.id,
            desires: a.desires.map((d) => ({
                id: d.id,
                statement: d.statement,
                weight: d.weight.toString(),
                satisfaction: d.satisfaction.toString(),
                baseline: d.baseline.toString(),
                volatility: d.volatility.toString(),
                draws_from: d.draws_from.map((c) => ({ resource_id: c.resource_id, claim: c.claim.toString() })),
            })),
        })),
    };
}

function parseWorld(s: SerializedWorld): WorldState {
    const resources: Record<string, Resource> = {};
    for (const [id, r] of Object.entries(s.resources)) {
        const allocations: Record<string, bigint> = {};
        for (const [h, u] of Object.entries(r.allocations)) allocations[h] = BigInt(u);
        resources[id] = {
            id: r.id,
            capacity: BigInt(r.capacity),
            allocations,
            ...(r.refill ? { refill: { to: r.refill.to, amount: BigInt(r.refill.amount) } } : {}),
        };
    }
    return {
        tick: BigInt(s.tick),
        resources,
        agents: s.agents.map((a) => ({
            id: a.id,
            desires: a.desires.map((d) => ({
                id: d.id,
                statement: d.statement,
                weight: BigInt(d.weight),
                satisfaction: BigInt(d.satisfaction),
                baseline: BigInt(d.baseline),
                volatility: BigInt(d.volatility),
                draws_from: d.draws_from.map((c) => ({ resource_id: c.resource_id, claim: BigInt(c.claim) })),
            })),
        })),
    };
}

/** Build the self-verifying beat record from an input world + its derivation. */
export function buildBeat(
    sagaId: string,
    input: WorldState,
    derived: DerivedBeat,
    prevCommitmentId: string | null,
): SerializedBeat {
    return {
        v: DRAMA_BEAT_VERSION,
        kind: DRAMA_BEAT_KIND,
        sagaId,
        tick: input.tick.toString(),
        tuning: {
            alphaUp: DRAMA_TUNING.alphaUp.toString(),
            alphaDown: DRAMA_TUNING.alphaDown.toString(),
            gamma: DRAMA_TUNING.gamma.toString(),
        },
        input: serWorld(input),
        actions: [],
        output: {
            world: serWorld(derived.next),
            tensions: derived.tensions.map((t) => ({
                agentId: t.agentId,
                desireId: t.desireId,
                value: t.value.toString(),
            })),
        },
        prevCommitmentId,
    };
}

export function encodeBeat(beat: SerializedBeat): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(beat));
}

/**
 * Re-run the committed transition and confirm the output matches byte-for-byte.
 * This is the "anyone can re-run and get the same tension" guarantee, applied
 * to a live beat: parse `input`, `applyTick([], tuning)`, compare to `output`.
 */
export function verifyBeat(beat: SerializedBeat): boolean {
    const tuning: TuningConfig = {
        alphaUp: BigInt(beat.tuning.alphaUp),
        alphaDown: BigInt(beat.tuning.alphaDown),
        gamma: BigInt(beat.tuning.gamma),
    };
    const input = parseWorld(beat.input);
    const { world: recomputed } = applyTickVerbose(input, [], tuning);
    return JSON.stringify(serWorld(recomputed)) === JSON.stringify(beat.output.world);
}

export type { WorldState };
