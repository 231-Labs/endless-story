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
    /**
     * Per-resource WANT override, keyed by on-chain label. For a director-created
     * resource of a fresh kind (no ROLE_AMBITION row → flat 0.5 for everyone), the
     * Showrunner can name the 行當 the stake is FOR; those roles ache for it, others
     * stand down — so a bespoke stake is character-shaped, not a flat scramble. Built-in
     * kinds keep their tuned ROLE_AMBITION ambitions (an intent only overrides if present
     * for that label). Read off-chain from resource-intents; passed in to stay pure.
     */
    resourceIntents?: Record<string, { wantedBy: string[] }>;
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
// SPECIALIZED NICHES (2026-06-16 rebalance): each 行當 burns for 1-2 kinds and is a
// NON-CONTENDER (omitted → AMBITION_FALLBACK, below AMBITION_MIN) for the rest. This
// carves non-competing niches so not every co-present pair is fighting over the same
// slot — the cause of「劇情充滿爭搶、沒溫情」. Strategic OVERLAP is kept only on the
// marquee prize (spotlight 頭牌) + the 搭檔 contest, where a shared fight IS the drama;
// elsewhere roles own their lane (班主→堂會包銀, 丑→小報, 武→武戲) so they can be
// co-present without a contest → warmth can breathe. The contest FLOOR still lets an
// able non-desirer get thrust on stage 臨危受命; this governs DESIRE, not ability.
// WARM kinds (mentorship/belonging/solace/keepsake) are seeded alongside the status
// kinds (2026-06-17) to grow 師徒/接納/疼惜 drama, not 頭牌 wars. They sit at MODERATE
// ambition (0.3–0.6, vs the 0.9 status niches) so the contests over them are soft —
// warmth from the theme, not from being low-stakes. Note ORDER: elders/master rows
// come FIRST so a multi-行當 veteran (老旦, or a 班主 who's also a 前代名角) matches there,
// not the greedy young-行當 rows below — they GIVE the teaching / already belong, so they
// carry keepsake/solace but NEVER mentorship/partnership (they don't crave being taught).
const ROLE_AMBITION: { match: string[]; a: Record<string, number> }[] = [
    { match: ['班主', '掌事', '當家', '東家'], a: { patronage: 0.75, naming: 0.4, keepsake: 0.5, solace: 0.4 } }, // 堂會包銀（生意）；給戲不爭戲、念舊惜身
    { match: ['老生', '鬚生', '老旦'], a: { recording: 0.7, patronage: 0.5, keepsake: 0.55, solace: 0.45 } }, // 唱片 + 堂會；認命惜身、念故人
    { match: ['刀馬旦', '武旦', '武生', '武小生'], a: { martial: 0.95, spotlight: 0.3, belonging: 0.55, mentorship: 0.5, solace: 0.4 } }, // 武戲台口 + 想被收作自己人、求真傳
    { match: ['花旦', '青衣', '正旦', '坤伶', '旦'], a: { spotlight: 0.9, recording: 0.85, mentorship: 0.6, keepsake: 0.4, solace: 0.3 } }, // 頭牌 + 渴師父真傳
    { match: ['坤生', '乾生', '小生'], a: { partnership: 0.9, spotlight: 0.6, belonging: 0.55, mentorship: 0.55 } }, // 搭檔；外來者求接納與真傳
    { match: ['丑'], a: { naming: 0.75, patronage: 0.4, belonging: 0.5, mentorship: 0.4 } }, // 小報頭條（搏版面）+ 邊緣人求名分
    { match: ['淨', '大面', '花臉', '銅錘'], a: { martial: 0.65, spotlight: 0.35, belonging: 0.4, solace: 0.35 } }, // 武 + 偶爭台、求一席
];
// An UNKNOWN 行當 (no row matched) still participates at a moderate level so a未知角色
// isn't a non-entity in the economy.
const AMBITION_FALLBACK = 0.5;
// A MATCHED role's NON-niche kind (omitted from its `a` map) → below AMBITION_MIN, so the
// role is a NON-CONTENDER for that slot (a faint「想搶卻搶不起」floor pruned by AMBITION_MIN).
// This is what carves the niches: specify only the kinds a role burns for; the rest fall here.
const OMITTED_KIND_AMBITION = 0.08;
const AMBITION_MIN = 0.15;
// A FRESH director-invented kind that NO 行當 is tuned for (not in ROLE_AMBITION):
// fall back to a broad MODERATE want so the new stake actually draws a scramble.
// Without this a director-created resource is inert for a cast of known roles (every
// matched role hits the 0.08 off-niche floor → nobody contends → no drama). A
// `wantedBy` intent sharpens this broad want into specific 行當.
const DIRECTOR_KIND_FALLBACK = 0.4;
// A director-authored stake WITH a `wantedBy` intent: the named 行當 burn for it
// (high, contended), everyone else is a non-contender (below AMBITION_MIN). This is
// what makes a bespoke stake character-shaped instead of a broad scramble.
const INTENT_WANT = 0.8;
const INTENT_OFF = 0.05;
/** Every kind any 行當 is tuned for — lets roleResourceAmbition tell an OFF-niche
 *  built-in kind (non-contender, 0.08) from a FRESH director kind (broad want).
 *  Derived from the table so it can never drift out of sync. */
const TUNED_KINDS = new Set<string>(ROLE_AMBITION.flatMap((r) => Object.keys(r.a)));

function primaryRoleFromTags(tags: string[] | undefined): string {
    const roleTag = (tags ?? []).find((t) => t.startsWith('role:'));
    return roleTag ? roleTag.slice('role:'.length) : '';
}

/** How much a 行當 (role) intrinsically aches for a KIND of resource (0..1). The
 *  deterministic「意圖已行當化」signal (§8c) — also the PERCEIVE step's ache source so
 *  a character's Situation leads with what their 行當 most wants. Exported for reuse. */
export function roleResourceAmbition(role: string, kind: string): number {
    const row = ROLE_AMBITION.find((g) => g.match.some((kw) => role.includes(kw)));
    if (!row) return AMBITION_FALLBACK; // unknown 行當 → moderate (still contests)
    const a = row.a[kind];
    if (a != null) return a; // this 行當's tuned want for this kind
    // off-niche: a TUNED kind this role doesn't burn for → non-contender; a FRESH
    // (director-invented) kind nobody's tuned for → broad moderate want (else inert).
    return TUNED_KINDS.has(kind) ? OMITTED_KIND_AMBITION : DIRECTOR_KIND_FALLBACK;
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
        // A named partnership slot / affection prize is something OTHER people desire;
        // the named target should not want to partner with — or be smitten by — themself.
        if (opts.agentName && isSelfNamedTarget(r, opts.agentName)) continue;
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
        // A director-authored stake may name WHO it's for (resourceIntents): the
        // listed 行當 burn for it, everyone else stands down — overriding the flat
        // fallback a fresh kind would otherwise get. No intent → tuned ROLE_AMBITION.
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
    // 乾生 (a young-male-lead variant) was missing → the 乾生 lead couldn't desire a
    // 搭檔 slot, leaving partnership resources 懸而未決 (nobody eligible could want them).
    return ['小生', '文小生', '武小生', '武生', '坤生', '乾生', '女小生'].some((r) => role.includes(r));
}

/** A `<kind>:<personName>` slot whose display IS this agent — the named target of
 *  a partnership (搭戲) or affection (情意) stake. They never desire their OWN slot /
 *  heart; everyone else may. Other kinds (spotlight/recording/…) name a thing, not a
 *  person, so they never self-exclude. */
function isSelfNamedTarget(r: ResourceSnapshot, agentName: string): boolean {
    const prefix = ['partnership:', 'affection:'].find((p) => r.label.startsWith(p));
    if (!prefix) return false;
    return compactName(r.label.slice(prefix.length)) === compactName(agentName);
}

function compactName(name: string): string {
    return name.trim().replace(/\s+/g, '');
}

function desireStatementFor(r: ResourceSnapshot): string {
    // The statement MUST carry a matchable token so the storylet opener
    // (framingForStatement → parseDirectorContention) and the settlement matchers
    // can tie a tension back to its resource. Two kinds carry a SEMANTIC natural-
    // language token (so the framing/POV reads as the real stake, not a stripped
    // display name): partnership uses 「與…搭戲」 and affection uses 「傾心於…」 — both
    // caught by `framingForStatement` before the generic path. Every other kind keeps
    // the 「<kind>:<display>」 label so `parseDirectorContention` recovers the kind.
    // The 中文 display name is present in ALL three forms, so the settlement matcher
    // (pickContestWinner, by label display) ties a tension back to its resource
    // regardless of form. Prose-facing consumers strip the label via
    // `humanResourceFromStatement`, so the raw `<kind>:` token never reaches readers;
    // the natural-language forms have no `<kind>:` prefix, so they read whole.
    if (r.label.startsWith('partnership:')) return `與${r.label.slice('partnership:'.length)}搭戲`;
    // 感情爭奪：N 人爭一個人的情意，capacity 1（情意獨佔）。「傾心於X」帶語義 →
    // framingForStatement 認回 contention:affection，POV 讀到的是「傾心於文」而非英文 slug。
    if (r.label.startsWith('affection:')) return `傾心於${r.label.slice('affection:'.length)}`;
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
