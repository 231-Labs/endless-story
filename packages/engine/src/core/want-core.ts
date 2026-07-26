/**
 * Want engine core — the narrative drive model (pure; no chain, no LLM, no I/O).
 * Validated shape: §2.36–2.38 (salience/forcing/saturation), §2.42–2.43
 * (resistance as a continuous gate, not a hard class), §2.51 (ripple units).
 * Wants replace contested-resource desires as the NARRATIVE driver; economic
 * slots keep their deterministic settlement lane (§2.35) untouched.
 */

import { applyActorFatigue, type FatigueLedger } from './actor-fatigue.ts';

export type WantSource = 'genesis' | 'ripple' | 'aftermath' | 'dream' | 'owner';

/** Finite mechanism metadata declared at want creation. `layer` remains the
 * character's prose label; these tags are the only semantic gates in STRICT. */
export const WANT_SEMANTIC_TAGS = ['affection', 'reckoning', 'jealousy', 'hostility'] as const;
export type WantSemanticTag = (typeof WANT_SEMANTIC_TAGS)[number];

export interface Want {
    id: string;
    characterId: string;
    /** Free-text layer tag (愛/志向/戲班/身體/事務/…) — rendering/analytics only
     * in STRICT. Legacy mode retains the historical regex gates. */
    layer: string;
    /** Engine-owned semantic metadata. Ordinary character-owned desc rewrites
     * MUST NOT mutate this field; only a dedicated declaration seat may set it. */
    semanticTags?: WantSemanticTag[];
    /** The want itself, in the character's own words. */
    desc: string;
    /** Optional target character id or name. */
    target?: string;
    /** 0..1 how much of this character it occupies. */
    weight: number;
    /** 0..1 current satisfaction; tension = weight × (1 − sat). */
    sat: number;
    /** Baseline sat that decay pulls back toward. */
    sat0: number;
    /** Forcing gate: heat+frust must exceed this before a resolve is forced
     *  (§2.42 — high resistance ≈ standing 懸念; derived from facts, not a knob). */
    resistance: number;
    /** Accumulates while this want is the acting drive. */
    heat: number;
    /** Accumulates when acting on it fails to move it. */
    frust: number;
    /** Recent-actions counter for the saturation bump. */
    recent: number;
    retired?: boolean;
    /** 情分會淡 (heartsCanFade): consecutive days this LOVE want's target went unseen.
     *  Reset to 0 the day they share a scene; past a grace it erodes weight until the
     *  heart lets go. Only ever set on love wants under the flag; absent otherwise. */
    starveDays?: number;
    /** One line on how it resolved (feeds aftermath context). */
    resolvedNote?: string;
    kind: 'narrative' | 'economic';
    source: WantSource;
    bornTick: number;
    resolvedTick?: number;
    /** Contested-resource label this want aches for (exact on-chain label).
     *  The SINGLE demand source: a character contests a stake only through a
     *  want that carries its label. null = assessed and tied to none;
     *  undefined = not yet assessed against the stake list. */
    resource?: string | null;
}

/** Lab-validated constants (§2.36–2.38 longrun, §2.51 ripple units). */
export const WANT = {
    /** Per-tick pull of sat back toward sat0 (excess halves in ~1.4 ticks). */
    decay: 0.6,
    /** sat gained by acting, keyed by the actor's own 進展 report. */
    gain: { 小: 0.15, 中: 0.32, 大: 0.55 } as Record<string, number>,
    /** Acting this many times in a short window saturates the want. */
    saturateAt: 3,
    saturationBump: 0.26,
    /** Resolved want cools the same character's related standing wants (+sat). */
    resolveCooldown: 0.2,
    /** Ripple units (§2.51: one tighten = the dream-stir dose). */
    tighten: 0.18,
    loosen: 0.15,
    /** Defaults for spawned wants. A ripple is a passing curiosity, not an
     *  identity thread — H2: its weight sits BELOW a climbing genesis want so
     *  raw-tension driver selection (pickSalient) can't be hijacked by noise
     *  (a fresh ripple 0.5×0.8=0.40 < a genesis love want at sat .45 = .495). */
    rippleWeight: 0.5,
    rippleSat: 0.2,
    rippleResistance: 3,
    /** Forcing escalation bands, as fractions of resistance. */
    pressingAt: 0.6,
    /** H3: forcing past resistance by THIS margin = 'breaking' — the want is
     *  overwhelming enough to force its own scene (barge in uninvited) and to
     *  license the threshold act in the beat. heat/frust never decay, so a
     *  central want always reaches this after sustained pressure. */
    breakingMargin: 3,
    /** Spawn/retire balance (§2.55 tuning, 64-live/1-retired fix): on top of
     *  genesis wants (identity, parser-capped at 5) a heart carries at most
     *  this many PICKED-UP threads; old cold ones fade. Genesis never counts
     *  toward the cap — an acceptance run showed a total cap starves ripples
     *  to zero the moment genesis fills it. */
    maxPickedThreads: 2,
    fadeTensionBelow: 0.18,
    fadeMinAgeTicks: 6,
    /** H2 stale-ripple GC: a picked-up curiosity whose sat never moved from its
     *  birth value was asked once and never pursued. Its standing tension stays
     *  high (rippleSat 0.2 × weight = ~0.4, above fadeTensionBelow forever), so
     *  the tension lane can't reap it — this idle lane does, on age alone. */
    rippleIdleEps: 0.04,
    /** H3d: a bond (love/debt) want this unsatisfied seeks its object at night
     *  even when it is COLD (forcing idle) — desire pulls by how unmet it is, not
     *  only by accumulated heat. Without this a love want that never gets to be a
     *  scene's driver (a rivalry out-drives it) stays idle forever and the night
     *  pair never forms. Tension-gated so only a genuine bond pulls, not a whim. */
    bondYearnTension: 0.5,
    /** H3d: heat a bond want gains per scene merely by sharing the stage with its
     *  target, even when another want is the driver. Small (a driver gains +1/beat);
     *  this lets a starved love/debt want climb toward edge over co-present ticks
     *  instead of being frozen out of the heat economy entirely. */
    bondCopresenceHeat: 0.5,
} as const;

export const tension = (w: Want): number => w.weight * (1 - w.sat);

/**
 * A settled first-order drive may open one aftermath thread, but settling that
 * aftermath must not recursively manufacture another aftermath. The lived
 * consequence still reaches memory, belief and ripple processing; it simply
 * does not become an endless `resolved -> empty -> resolved` want chain.
 */
export const shouldDeriveAftermath = (want: Pick<Want, 'source'>): boolean =>
    want.source !== 'aftermath';

export const forcingPressure = (w: Want): number => w.heat + w.frust;

export type ForcingLevel = 'idle' | 'pressing' | 'edge' | 'breaking';

/** How hard the world is pressing this want toward an answer. NEVER prescribes
 *  the answer — the prompt layer renders each level as pressure-only language.
 *  'breaking' (H3) is past the edge by a margin: overwhelming enough to force
 *  its own scene and license the threshold act. */
export function forcingLevel(w: Want): ForcingLevel {
    if (w.retired || w.kind === 'economic') return 'idle';
    const p = forcingPressure(w);
    if (p >= w.resistance + WANT.breakingMargin) return 'breaking';
    if (p >= w.resistance) return 'edge';
    if (p >= w.resistance * WANT.pressingAt) return 'pressing';
    return 'idle';
}

/** Layer families that pull two people into a private room at night. Love wants
 *  a 幽會; an unsettled debt/grudge wants a 了結 (H1: without this lane a guilt
 *  or reckoning want could never reach the private 2-person scene that drops
 *  resistance, so it acted forever into crowds and never closed). */
const LOVE_LAYER = /愛|情/;
const RECKON_LAYER = /虧欠|愧|償|怨/;
/** Jealousy that walks in on a pair (撞破). */
const JEALOUS_LAYER = /妒|怨/;

/** A bond want (love or unsettled debt/grudge) — the layers that ache toward a
 *  specific other person. The scene-loop heats these by co-presence (H3d). */
export const isBondLayer = (layer: string): boolean =>
    LOVE_LAYER.test(layer) || RECKON_LAYER.test(layer);

export const hasWantSemantic = (want: Pick<Want, 'semanticTags'>, tag: WantSemanticTag): boolean =>
    want.semanticTags?.includes(tag) === true;

/** STRICT-aware bond predicate. The legacy helper remains exported for old
 * callers/tests; new state gates should pass the full want through this seam. */
export const isBondWant = (want: Want, strictStructured = false): boolean =>
    strictStructured
        ? hasWantSemantic(want, 'affection') || hasWantSemantic(want, 'reckoning')
        : isBondLayer(want.layer);

/** Does the private 2-person scene hold a live `re`-layer want aimed across the
 *  pair? Shared by 幽會 / 了結 / the 撞破 pair check. Pure. */
function pairWantBetween(
    cs: ReadonlyArray<{ id: string; name: string }>,
    privacyLevel: number,
    wants: ReadonlyArray<Want>,
    re: RegExp,
    semanticTag: WantSemanticTag,
    strictStructured = false,
): boolean {
    if (cs.length !== 2 || privacyLevel < 3) return false;
    return cs.some((a) => {
        const other = cs.find((o) => o.id !== a.id)!;
        return wants.some(
            (w) =>
                !w.retired &&
                w.characterId === a.id &&
                (strictStructured ? hasWantSemantic(w, semanticTag) : re.test(w.layer)) &&
                (w.target === other.name || w.target === other.id),
        );
    });
}

/**
 * 幽會 qualification (G8): at night a scene still plays only when it is private,
 * holds exactly two people, and one of them carries a live love-layer want
 * aimed at the other. Pure — the tick's night gate and the composition tests
 * share this exact predicate.
 */
export function qualifiesAsTryst(
    cs: ReadonlyArray<{ id: string; name: string }>,
    privacyLevel: number,
    wants: ReadonlyArray<Want>,
    strictStructured = false,
): boolean {
    return pairWantBetween(cs, privacyLevel, wants, LOVE_LAYER, 'affection', strictStructured);
}

/** 了結 qualification (H1): the same private-pair gate for an unsettled
 *  debt/guilt/grudge want — a reckoning, not a tryst (no intimacy gate). */
export function qualifiesAsReckoning(
    cs: ReadonlyArray<{ id: string; name: string }>,
    privacyLevel: number,
    wants: ReadonlyArray<Want>,
    strictStructured = false,
): boolean {
    return pairWantBetween(cs, privacyLevel, wants, RECKON_LAYER, 'reckoning', strictStructured);
}

/** A want is ripe enough to move feet at night if it has accumulated heat
 *  (forcing past idle). For a BOND want (yearn), a cold-but-strong desire also
 *  counts: high standing tension pulls toward its object even without heat —
 *  H3d, so a love want that a rivalry keeps out of the driver seat still seeks
 *  its target at night rather than freezing at idle forever. */
function nightRipe(w: Want, yearn: boolean): boolean {
    if (forcingLevel(w) !== 'idle') return true;
    return yearn && tension(w) >= WANT.bondYearnTension;
}

/** Shared night-pursuit core: the hottest live want whose layer matches `re`
 *  and that is ripe points its owner toward its target. Returns the chosen want
 *  too, so callers can gate intrusion on its forcing level / tension. Pure. */
function nightPursuit(
    wants: ReadonlyArray<Want>,
    characterId: string,
    resolveTargetId: (target: string) => string | undefined,
    re: RegExp,
    semanticTags: WantSemanticTag[],
    yearn = false,
    strictStructured = false,
): { id: string; w: number; want: Want } | null {
    let best: Want | null = null;
    for (const w of wants) {
        if (w.retired || w.characterId !== characterId || !w.target) continue;
        if (
            strictStructured
                ? !semanticTags.some((tag) => hasWantSemantic(w, tag))
                : !re.test(w.layer)
        ) continue;
        if (!nightRipe(w, yearn)) continue; // only a ripe want moves feet
        if (!best || tension(w) > tension(best)) best = w;
    }
    if (!best) return null;
    const id = resolveTargetId(best.target!);
    return id && id !== characterId ? { id, w: Math.min(1, tension(best)), want: best } : null;
}

/** 妒火夜隨 (G8b): the hottest jealousy/grudge want at pressing+ follows its
 *  target into the night, UNINVITED (intrude skips the welcome gate). Pure. */
/** Night-pursuit pull strength: a breaking want drags at full force, else it
 *  pulls by tension (how unsatisfied it still is). */
function pursuitWeight(w: Want): number {
    return forcingLevel(w) === 'breaking' ? 1 : Math.min(1, tension(w));
}

export function jealousNightPursuit(
    wants: ReadonlyArray<Want>,
    characterId: string,
    resolveTargetId: (target: string) => string | undefined,
    strictStructured = false,
): { id: string; w: number; intrude: true } | null {
    const p = nightPursuit(wants, characterId, resolveTargetId, JEALOUS_LAYER, ['jealousy'], false, strictStructured);
    return p ? { id: p.id, w: pursuitWeight(p.want), intrude: true } : null;
}

/** 夜赴 (H1/H3): a ripe love or unsettled-debt want seeks its target at night
 *  so the private pair can form and the resolve pass gets its shot. Below 'edge'
 *  it is WELCOME-gated (a reckoning emerges from the relationship graph), but at
 *  EDGE+ the want is ripe enough to seek its object uninvited (intrude) — the
 *  venue forms even when the other side is wary, and it forms at edge (before the
 *  want hits breaking + resolves publicly), so love/debt lands in the private
 *  night scene rather than a daytime crowd (H3c). */
export function yearningNightPursuit(
    wants: ReadonlyArray<Want>,
    characterId: string,
    resolveTargetId: (target: string) => string | undefined,
    strictStructured = false,
): { id: string; w: number; intrude?: true } | null {
    const p = nightPursuit(
        wants,
        characterId,
        resolveTargetId,
        new RegExp(`${LOVE_LAYER.source}|${RECKON_LAYER.source}`),
        ['affection', 'reckoning'],
        true, // yearn: a cold-but-strong bond still SEEKS its object (H3d) — it
        //       becomes a candidate even at idle, so a love want a rivalry keeps
        //       out of the driver seat no longer freezes out of the night.
        strictStructured,
    );
    if (!p) return null;
    // Intrude (barge in uninvited) stays reserved for a ripe (edge+) want, per
    // H3c. A cold-but-yearning bond only SEEKS: it is welcome-gated, so a MUTUAL
    // love pair still forms (each welcomes the other → propriety > 0 in the router)
    // while a one-sided cold longing stays politely at a shut door.
    const fl = forcingLevel(p.want);
    return fl === 'edge' || fl === 'breaking'
        ? { id: p.id, w: pursuitWeight(p.want), intrude: true }
        : { id: p.id, w: pursuitWeight(p.want) };
}

/** A worry that can move feet at night: this character's hottest RIPE want whose
 *  layer is neither a bond (love/reckon) nor jealousy — a life decision / 事務 /
 *  志向 / 身家 matter pressing on them (the contract weighing on 柳安春 is such a
 *  want). Ripe = forcing past idle (nightRipe with yearn off). May carry NO
 *  target (a worry need not be aimed at anyone). Pure. */
export function confideWorry(wants: ReadonlyArray<Want>, characterId: string, strictStructured = false): Want | null {
    let best: Want | null = null;
    for (const w of wants) {
        if (w.retired || w.characterId !== characterId) continue;
        if (
            isBondWant(w, strictStructured) ||
            (strictStructured ? hasWantSemantic(w, 'jealousy') : JEALOUS_LAYER.test(w.layer))
        ) continue; // not love/debt/jealousy
        if (!nightRipe(w, false)) continue; // ripe enough to move feet (forcing past idle)
        if (!best || tension(w) > tension(best)) best = w;
    }
    return best;
}

/** Does `fromId` carry a live HOSTILE want (jealousy, or an unsettled
 *  debt/grudge reckoning) aimed at the other (matched by id or name)? A
 *  confidant must NOT be someone you resent — the confide gate skips any such
 *  pair, so trust is never extended to a rival or a creditor. Pure. */
export function hasHostileWantToward(
    wants: ReadonlyArray<Want>,
    fromId: string,
    toId: string,
    toName?: string,
    strictStructured = false,
): boolean {
    return wants.some(
        (w) =>
            !w.retired &&
            w.characterId === fromId &&
            !!w.target &&
            (strictStructured
                ? hasWantSemantic(w, 'jealousy') ||
                  hasWantSemantic(w, 'reckoning') ||
                  hasWantSemantic(w, 'hostility')
                : JEALOUS_LAYER.test(w.layer) || RECKON_LAYER.test(w.layer)) &&
            (w.target === toId || (toName !== undefined && w.target === toName)),
    );
}

/** Who, if anyone, is the confider in this pair (夜訪商量): the one carrying a
 *  confideWorry who TRUSTS the other. Trust is injected + asymmetric — the
 *  confider→other direction (`isTrusted(worrier, other)`). Ties break toward the
 *  hotter worry. null when neither qualifies. Pure — the tick builds `isTrusted`
 *  from the bond graph and reuses this to pick the scene's opening actor. */
export function confiderOf(
    cs: ReadonlyArray<{ id: string; name: string }>,
    wants: ReadonlyArray<Want>,
    isTrusted: (a: string, b: string) => boolean,
    strictStructured = false,
): string | null {
    if (cs.length !== 2) return null;
    let best: { id: string; t: number } | null = null;
    for (const a of cs) {
        const other = cs.find((o) => o.id !== a.id)!;
        const worry = confideWorry(wants, a.id, strictStructured);
        if (!worry || !isTrusted(a.id, other.id)) continue;
        const t = tension(worry);
        if (!best || t > best.t) best = { id: a.id, t };
    }
    return best?.id ?? null;
}

/** 夜訪商量 qualification: a private 2-person night pair where one carries a
 *  pressing non-bond, non-jealous worry AND trusts the other (a confidant).
 *  Pure — shares the tick's night gate. */
export function qualifiesAsConfide(
    cs: ReadonlyArray<{ id: string; name: string }>,
    privacyLevel: number,
    wants: ReadonlyArray<Want>,
    isTrusted: (a: string, b: string) => boolean,
    strictStructured = false,
): boolean {
    if (cs.length !== 2 || privacyLevel < 3) return false;
    return confiderOf(cs, wants, isTrusted, strictStructured) !== null;
}

/** Night-scene qualification (G8/G8b, H1): a private scene plays at night as a
 *  幽會 tryst (the pair + a live love want), a 了結 reckoning (the pair + an
 *  unsettled debt/grudge want), a 夜訪商量 confide (the pair + one pressing
 *  non-bond worry taken to a TRUSTED confidant), or a 撞破 confrontation (either
 *  pair + ONE jealous third aimed at one of them). Anything else sleeps.
 *  Precedence for a 2-person pair: tryst → reckoning → confide. The confide lane
 *  fires ONLY when a trust predicate is injected; a 3-arg call behaves EXACTLY
 *  as before (no confide), so every existing caller/test is unchanged and a
 *  bond-less world (isTrusted false for all) leaves it inert. */
export function nightSceneKind(
    cs: ReadonlyArray<{ id: string; name: string }>,
    privacyLevel: number,
    wants: ReadonlyArray<Want>,
    isTrusted?: (a: string, b: string) => boolean,
    strictStructured = false,
): 'tryst' | 'reckoning' | 'confide' | 'confrontation' | null {
    if (privacyLevel < 3) return null;
    if (cs.length === 2) {
        if (qualifiesAsTryst(cs, privacyLevel, wants, strictStructured)) return 'tryst';
        if (qualifiesAsReckoning(cs, privacyLevel, wants, strictStructured)) return 'reckoning';
        if (isTrusted && qualifiesAsConfide(cs, privacyLevel, wants, isTrusted, strictStructured)) return 'confide';
        return null;
    }
    if (cs.length !== 3) return null;
    for (let i = 0; i < 3; i++) {
        const third = cs[i];
        const pair = cs.filter((_, j) => j !== i);
        const pairPlays =
            qualifiesAsTryst(pair, privacyLevel, wants, strictStructured) ||
            qualifiesAsReckoning(pair, privacyLevel, wants, strictStructured);
        if (!pairPlays) continue;
        const jealous = wants.some(
            (w) =>
                !w.retired &&
                w.characterId === third.id &&
                (strictStructured ? hasWantSemantic(w, 'jealousy') : JEALOUS_LAYER.test(w.layer)) &&
                pair.some((p) => w.target === p.name || w.target === p.id),
        );
        if (jealous) return 'confrontation';
    }
    return null;
}

let _seq = 0;
/**
 * Layers are intentionally free-text (愛/志向/身體/…), but the ripple judge LLM
 * occasionally emits a formatting artifact instead of a tag: a bare list index
 * ("1"), the field-name echoed ("層"/"layer"), or an over-long fragment. Map those
 * to a neutral '其他' so they never surface as a want "type" in the UI.
 */
export function normalizeLayer(raw: string | undefined): string {
    const s = (raw ?? '').trim();
    if (!s || /^[0-9]+$/.test(s) || s === '層' || s.toLowerCase() === 'layer' || s.length > 6) {
        return '其他';
    }
    return s;
}

export function newWant(
    init: Pick<Want, 'characterId' | 'layer' | 'desc' | 'weight' | 'sat' | 'resistance' | 'kind' | 'source' | 'bornTick'> &
        Partial<Pick<Want, 'target' | 'id' | 'resource' | 'semanticTags'>>,
): Want {
    return {
        id: init.id ?? `w${Date.now().toString(36)}-${++_seq}`,
        characterId: init.characterId,
        layer: init.layer,
        ...(init.semanticTags?.length ? { semanticTags: [...new Set(init.semanticTags)] } : {}),
        desc: init.desc,
        target: init.target,
        resource: init.resource,
        weight: clamp01(init.weight),
        sat: clamp01(init.sat),
        sat0: clamp01(init.sat),
        resistance: Math.max(1, Math.min(10, init.resistance)),
        heat: 0,
        frust: 0,
        recent: 0,
        kind: init.kind,
        source: init.source,
        bornTick: init.bornTick,
    };
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** One tick of rest for a character's wants (sat relaxes toward baseline). */
export function decayWants(wants: Want[]): void {
    for (const w of wants) {
        if (w.retired) continue;
        w.sat = clamp01(w.sat0 + (w.sat - w.sat0) * WANT.decay);
        w.recent = Math.max(0, w.recent - 0.5);
    }
}

/** §2.55 retire lane #2 — fading. A thread that is old, cold (below the
 *  tension floor) and not being acted on quietly stops being carried. Genesis
 *  wants are exempt: who a character IS doesn't fade, only picked-up threads.
 *  Returns the faded wants (for logging). */
export function fadeStaleWants(wants: Want[], tick: number): Want[] {
    const faded: Want[] = [];
    for (const w of wants) {
        if (w.retired || w.kind === 'economic' || w.source === 'genesis') continue;
        if (tick - w.bornTick < WANT.fadeMinAgeTicks) continue;
        if (w.recent > 0) continue; // still warm this window — leave it
        // Lane #1 (§2.55): cold — satisfied or quiet, tension under the floor.
        const cold = tension(w) < WANT.fadeTensionBelow;
        // Lane #2 (H2): idle — a RIPPLE curiosity that never moved from its
        // birth sat, i.e. surfaced once and never actually pursued. Reaped on
        // age alone so it can't squat above the tension floor and hijack the
        // driver. Scoped to ripples: aftermath/dream threads still burn on
        // standing tension alone (a fresh grief want hasn't moved sat either).
        const idle = w.source === 'ripple' && Math.abs(w.sat - w.sat0) < WANT.rippleIdleEps;
        if (!cold && !idle) continue;
        w.retired = true;
        w.resolvedTick = tick;
        w.resolvedNote = cold ? '（日子久了，淡了）' : '（一時好奇，過去了）';
        faded.push(w);
    }
    return faded;
}

export interface SalientPick {
    characterId: string;
    want: Want;
    /** Fatigue-adjusted tension that won the pick. */
    effective: number;
}

/**
 * Who acts, and for what: highest fatigue-adjusted tension among live wants.
 * Fatigue suppresses SELECTION only (§2.51 — settlement never reads this).
 */
export function pickSalient(wants: ReadonlyArray<Want>, fatigue: FatigueLedger): SalientPick | null {
    const rows = wants
        .filter((w) => !w.retired)
        .map((w) => ({ characterId: w.characterId, tension: tension(w), want: w }));
    if (rows.length === 0) return null;
    const adjusted = applyActorFatigue(rows, fatigue);
    let best: (typeof adjusted)[number] | null = null;
    for (const r of adjusted) if (!best || r.tension > best.tension) best = r;
    return best ? { characterId: best.characterId, want: best.want, effective: best.tension } : null;
}

export interface BeatOutcome {
    /** The actor's own 進展 report: 小 | 中 | 大. */
    gain: string;
    /** The actor declared this want answered with an irreversible act. */
    resolved: boolean;
    resolvedNote?: string;
}

/**
 * Apply one acted beat to the driving want. Resolution retires it and cools the
 * same character's other standing-grade wants (§2.37 cross-time breadth).
 */
export function applyBeat(w: Want, all: Want[], outcome: BeatOutcome, tick: number): void {
    w.recent += 1;
    w.heat += 1;
    if (outcome.resolved) {
        w.retired = true;
        w.resolvedTick = tick;
        w.resolvedNote = outcome.resolvedNote;
        for (const y of all) {
            if (y === w || y.retired || y.characterId !== w.characterId) continue;
            if (y.resistance >= WANT.rippleResistance) y.sat = clamp01(y.sat + WANT.resolveCooldown);
        }
        return;
    }
    w.sat = clamp01(w.sat + (WANT.gain[outcome.gain] ?? WANT.gain.小));
    w.frust += 1;
    if (w.recent >= WANT.saturateAt) w.sat = clamp01(w.sat + WANT.saturationBump);
}

export type RippleShift = 'tighten' | 'loosen' | 'none';

export interface RippleDelta {
    characterId: string;
    shift: RippleShift;
    /** Genuinely-new short want (≤22 chars), not a restatement (§2.38 mutate fix). */
    newThread?: string;
    layer?: string;
    target?: string;
    semanticTags?: WantSemanticTag[];
}

/** Apply LLM-judged ripples: shift the target's hottest want, spawn new threads. */
export function applyRipples(
    wants: Want[],
    deltas: ReadonlyArray<RippleDelta>,
    tick: number,
    nextId?: () => string,
    strictStructured = false,
): Want[] {
    const spawned: Want[] = [];
    for (const d of deltas) {
        const mine = wants.filter((w) => !w.retired && w.characterId === d.characterId);
        if (mine.length > 0 && d.shift !== 'none') {
            const hottest = mine.reduce((b, c) => (tension(c) > tension(b) ? c : b));
            hottest.sat = clamp01(
                d.shift === 'tighten' ? hottest.sat - WANT.tighten : hottest.sat + WANT.loosen,
            );
        }
        const candidate = d.newThread?.trim();
        const nt = strictStructured
            ? candidate || undefined
            : candidate && !/^(省略|無|沒有|不新增|none|null|n\/?a)$/i.test(candidate)
              ? candidate
              : undefined;
        const picked = mine.filter((w) => w.source !== 'genesis').length;
        if (
            nt &&
            nt.length <= 22 &&
            // A full heart takes no new picked-up thread — the spawn brake.
            picked < WANT.maxPickedThreads &&
            !wants.some(
                (w) =>
                    w.characterId === d.characterId &&
                    !w.retired &&
                    (w.desc.includes(nt) || nt.includes(w.desc.slice(0, 8))),
            )
        ) {
            spawned.push(
                newWant({
                    id: nextId?.(),
                    characterId: d.characterId,
                    layer: normalizeLayer(d.layer),
                    ...(strictStructured && d.semanticTags?.length ? { semanticTags: d.semanticTags } : {}),
                    desc: nt,
                    target: d.target,
                    weight: WANT.rippleWeight,
                    sat: WANT.rippleSat,
                    resistance: WANT.rippleResistance,
                    kind: 'narrative',
                    source: 'ripple',
                    bornTick: tick,
                }),
            );
        }
    }
    wants.push(...spawned);
    return spawned;
}

/** §2.51 dream dose applied at the want layer: one tighten on the hottest want. */
export function applyDreamStirToWants(wants: Want[], characterId: string): Want | null {
    const mine = wants.filter((w) => !w.retired && w.characterId === characterId);
    if (mine.length === 0) return null;
    const hottest = mine.reduce((b, c) => (tension(c) > tension(b) ? c : b));
    hottest.sat = clamp01(hottest.sat - WANT.tighten);
    return hottest;
}
