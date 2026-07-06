/**
 * Drama engine off-chain DEMAND core (pure; imports only `@endless-story/drama`).
 * SUPPLY = the authoritative on-chain resource ledger; DEMAND (felt satisfaction) is
 * derived here from allocation history + tuning, so every beat is byte-replayable:
 * `applyTick(beat.input, [], TUNING)` reproduces `beat.output`.
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

export interface DramaTensionRow {
    agentId: string;
    desireId: string;
    statement: string;
    /** Scaled [0..SCALE]; see `tensionFraction`. */
    value: bigint;
}

export const DRAMA_BEAT_VERSION = 1 as const;
export const DRAMA_BEAT_KIND = 'drama-beat' as const;

/**
 * Committed tuning, pinned to the conformance test so live beats reproduce the
 * calibrated curve. Loss aversion: alphaDown > alphaUp. Habituation: gamma > 0.
 */
export const DRAMA_TUNING: TuningConfig = {
    alphaUp: 300_000n,
    alphaDown: 600_000n,
    gamma: 50_000n,
};

export interface ResourceSnapshot {
    id: string;
    archetype: string;
    /** `<kind>:<display>` label (e.g. "partnership:Meng"). */
    label: string;
    capacity: bigint;
    /** holder character id -> units held. */
    allocations: Record<string, bigint>;
}

/**
 * `ref` in each claim names a resource by (id | label | archetype), resolved at
 * world-build time so desires stay stable while the on-chain object id varies.
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
    name?: string;
    /** Public chain tags such as `role:<role-type>`. */
    tags?: string[];
    desires: DesireSpec[];
}

export interface DefaultDesireOptions {
    /** Used to avoid giving a named target a self-partnership desire. */
    agentName?: string;
    /** Public chain tags such as `role:<role-type>`. */
    agentTags?: string[];
    /**
     * Per-resource WANT override keyed by on-chain label: the named 行當 ache for a
     * director-created stake, everyone else stands down. Only overrides when present
     * for that label; built-in kinds keep their tuned ROLE_AMBITION.
     */
    resourceIntents?: Record<string, { wantedBy: string[] }>;
}

/**
 * 行當 → ambition (0..1) per resource kind. Ambition, not ability — the contest floor
 * can still thrust an able non-desirer on stage. Substring match on role, first row
 * wins. Niches are deliberately non-overlapping (shared fights only on the marquee
 * prizes) so co-present roles aren't all contesting the same slot and warmth can
 * breathe. ORDER MATTERS: elder/master rows come first so a multi-行當 veteran matches
 * there — they give teaching and never crave mentorship/partnership.
 */
const ROLE_AMBITION: { match: string[]; a: Record<string, number> }[] = [
    { match: ['班主', '掌事', '當家', '東家'], a: { patronage: 0.75, naming: 0.4, keepsake: 0.5, solace: 0.4 } },
    { match: ['老生', '鬚生', '老旦'], a: { recording: 0.7, patronage: 0.5, keepsake: 0.55, solace: 0.45 } },
    { match: ['刀馬旦', '武旦', '武生', '武小生'], a: { martial: 0.95, spotlight: 0.3, belonging: 0.55, mentorship: 0.5, solace: 0.4 } },
    { match: ['花旦', '青衣', '正旦', '坤伶', '旦'], a: { spotlight: 0.9, recording: 0.85, mentorship: 0.6, keepsake: 0.4, solace: 0.3 } },
    { match: ['坤生', '乾生', '小生'], a: { partnership: 0.9, spotlight: 0.6, belonging: 0.55, mentorship: 0.55 } },
    { match: ['丑'], a: { naming: 0.75, patronage: 0.4, belonging: 0.5, mentorship: 0.4 } },
    { match: ['淨', '大面', '花臉', '銅錘'], a: { martial: 0.65, spotlight: 0.35, belonging: 0.4, solace: 0.35 } },
];
// Unmatched 行當 still contests at a moderate level.
const AMBITION_FALLBACK = 0.5;
// Off-niche kind for a matched role: below AMBITION_MIN, so a non-contender.
const OMITTED_KIND_AMBITION = 0.08;
const AMBITION_MIN = 0.15;
// Fresh director-invented kind no 行當 is tuned for: broad moderate want, otherwise
// the new stake is inert (every matched role would hit the off-niche floor).
const DIRECTOR_KIND_FALLBACK = 0.4;
// `wantedBy` intent: the named 行當 burn for it, everyone else stands down.
const INTENT_WANT = 0.8;
const INTENT_OFF = 0.05;
/** Kinds any 行當 is tuned for — tells an off-niche built-in kind from a fresh
 *  director kind. Derived from the table so it can never drift. */
const TUNED_KINDS = new Set<string>(ROLE_AMBITION.flatMap((r) => Object.keys(r.a)));

function primaryRoleFromTags(tags: string[] | undefined): string {
    const roleTag = (tags ?? []).find((t) => t.startsWith('role:'));
    return roleTag ? roleTag.slice('role:'.length) : '';
}

/** How much a 行當 aches for a resource kind (0..1) — the deterministic intent signal
 *  (§8c); also the PERCEIVE step's ache source. */
export function roleResourceAmbition(role: string, kind: string): number {
    const row = ROLE_AMBITION.find((g) => g.match.some((kw) => role.includes(kw)));
    if (!row) return AMBITION_FALLBACK;
    const a = row.a[kind];
    if (a != null) return a;
    return TUNED_KINDS.has(kind) ? OMITTED_KIND_AMBITION : DIRECTOR_KIND_FALLBACK;
}

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
        // capacity >= cast ⇒ uncontested
        if (castSize > 0 && r.capacity >= BigInt(castSize)) continue;
        // A named target never desires their own partnership/affection slot.
        if (opts.agentName && isSelfNamedTarget(r, opts.agentName)) continue;
        if (isPartnership(r) && !isEligiblePartnershipAgent(opts)) continue;
        // Performer-only resources are never contested by confirmed backstage roles.
        if (isPerformerResource(r) && isBackstageAgent(opts)) continue;
        const want = r.capacity > 0n ? 1n : 0n;
        if (want === 0n) continue;
        // Ambition scales the desire WEIGHT (linear into tension); below AMBITION_MIN
        // the role is not a contender (the contest floor can still draft them).
        const kind = (r.label.split(':')[0] || '').trim();
        const intent = opts.resourceIntents?.[r.label];
        const ambition = intent
            ? intent.wantedBy.some((kw) => kw && role.includes(kw))
                ? INTENT_WANT
                : INTENT_OFF
            : roleResourceAmbition(role, kind);
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

/** Structural slice of a want that carries demand (keeps this core dependency-free). */
export interface WantDemand {
    /** Exact contested-resource label the want aches for; null/undefined = none. */
    resource?: string | null;
    retired?: boolean;
    weight: number;
    sat: number;
}

/**
 * Single demand source (G1): a character contests a stake only because one of
 * their live wants carries its exact label. Mechanical — no role tables, no
 * eligibility regex; who aches for what was judged once at want-genesis from
 * the persona. Desire strength tracks the want's live tension, so a satisfied
 * want stops contesting on its own.
 */
export function desiresFromWants(
    resources: ResourceSnapshot[],
    wants: ReadonlyArray<WantDemand>,
): DesireSpec[] {
    const specs: DesireSpec[] = [];
    for (const r of resources) {
        if (r.capacity <= 0n) continue;
        const mine = wants.filter((w) => !w.retired && w.resource === r.label);
        if (mine.length === 0) continue;
        const drive = Math.max(...mine.map((w) => w.weight * (1 - w.sat)));
        if (drive < 0.05) continue;
        specs.push({
            id: `hold:${r.label || r.archetype || r.id}`,
            statement: desireStatementFor(r),
            weight: scaleByAmbition(drive),
            baseline: 200_000n,
            volatility: SCALE,
            claims: [{ ref: r.id, claim: 1n }],
        });
    }
    return specs;
}

/** Resources only on-stage actors compete for (partnership has its own gate). */
function isPerformerResource(r: ResourceSnapshot): boolean {
    return (
        r.label.startsWith('spotlight:') ||
        r.label.startsWith('recording:') ||
        r.label.startsWith('patronage:') ||
        r.label.startsWith('naming:') ||
        r.label.startsWith('martial:')
    );
}

/** Backstage only when a role tag POSITIVELY marks it — never inferred from absence,
 *  so real performers are never excluded. */
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
    // With role tags: only young-male-lead-side roles qualify.
    if (roleTags.length > 0) return roleTags.some(isXiaoshengRole);
    // Tags present but no role tag: don't infer from unrelated status labels.
    if ((opts.agentTags ?? []).length > 0) return false;
    // Legacy fallback for untagged demo characters.
    return opts.agentName ? /生|柳/.test(opts.agentName) : true;
}

function isXiaoshengRole(role: string): boolean {
    return ['小生', '文小生', '武小生', '武生', '坤生', '乾生', '女小生'].some((r) => role.includes(r));
}

/** True when a partnership/affection slot's display name IS this agent — the named
 *  target never desires their own slot. Other kinds name a thing, never self-exclude. */
function isSelfNamedTarget(r: ResourceSnapshot, agentName: string): boolean {
    const prefix = ['partnership:', 'affection:'].find((p) => r.label.startsWith(p));
    if (!prefix) return false;
    return compactName(r.label.slice(prefix.length)) === compactName(agentName);
}

function compactName(name: string): string {
    return name.trim().replace(/\s+/g, '');
}

function desireStatementFor(r: ResourceSnapshot): string {
    // The statement must carry a matchable token: partnership/affection use semantic
    // natural-language forms (「與…搭戲」/「傾心於…」, caught by framingForStatement);
    // every other kind keeps the 「<kind>:<display>」 label for parseDirectorContention.
    // The display name is present in all forms so settlement matchers can tie a
    // tension back to its resource.
    if (r.label.startsWith('partnership:')) return `與${r.label.slice('partnership:'.length)}搭戲`;
    if (r.label.startsWith('affection:')) return `傾心於${r.label.slice('affection:'.length)}`;
    if (r.label) return `爭得「${r.label}」`;
    return `爭得一席（${r.archetype || '稀缺資源'}）`;
}

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

export function extractSatisfaction(world: WorldState): Map<string, bigint> {
    const m = new Map<string, bigint>();
    for (const a of world.agents) for (const d of a.desires) m.set(satKey(a.id, d.id), d.satisfaction);
    return m;
}

/**
 * Build the engine `WorldState`; satisfaction seeds from the carry-over map or the
 * baseline on first sight. Desires whose claims resolve to no live resource are dropped.
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
            if (draws_from.length === 0) continue;
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

export interface DerivedBeat {
    /** World after relaxation. */
    next: WorldState;
    /** Per (agent, desire), highest first within each agent. */
    tensions: DramaTensionRow[];
}

/**
 * Advance the DEMAND side one beat. `actions` defaults to none — supply already
 * moved on chain; this layer only feels it.
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

/** [0..SCALE] → 0..1 display fraction. */
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
 * Chinese one-liner of the agent's dominant unmet desire for decide/POV prompt
 * injection; null when the agent has no structural tension (callers omit the hint).
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
    /** World before relaxation. */
    input: SerializedWorld;
    /** Always empty — supply settles on chain. */
    actions: never[];
    /** World after relaxation + derived tensions. */
    output: { world: SerializedWorld; tensions: { agentId: string; desireId: string; value: string }[] };
    /** Prior beat's commitment id (chains the history); null at genesis. */
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

/** Re-run the committed transition; the output must match byte-for-byte. */
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

export interface DreamStirApplied {
    agentId: string;
    statement: string;
    fraction: number;
}

/**
 * Consume queued dream stirs (§2.51): tighten each stirred agent's hottest desire by
 * `fraction` of SCALE. Mutates the beat's INPUT world in place so the committed blob
 * stays replayable. Agents without desires are skipped.
 */
export function applyDreamStirs(
    world: WorldState,
    stirs: ReadonlyMap<string, number>,
): DreamStirApplied[] {
    const applied: DreamStirApplied[] = [];
    if (stirs.size === 0) return applied;
    for (const agent of world.agents) {
        const stir = stirs.get(agent.id);
        if (!stir || !(stir > 0) || agent.desires.length === 0) continue;
        const hottest = agent.desires.reduce((b, c) => (tension(c) > tension(b) ? c : b));
        const drop = (SCALE * BigInt(Math.round(Math.min(1, stir) * 100))) / 100n;
        hottest.satisfaction = hottest.satisfaction > drop ? hottest.satisfaction - drop : 0n;
        applied.push({ agentId: agent.id, statement: hottest.statement, fraction: Math.min(1, stir) });
    }
    return applied;
}
