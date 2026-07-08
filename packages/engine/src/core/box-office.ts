/**
 * Box-office — the deterministic, auditable settlement of a 會串 performance
 * (SEASON_ONE_SLICE §4; user ruling: "數字永不由 LLM 決定"). Pure math, no LLM,
 * no RNG. Same inputs → same number, every time. An LLM may later write each
 * audience member's reaction PROSE, but never touches these figures.
 *
 *   willingness(a) = w1·warmth(a→troupe) + w2·repute(troupe) + w3·quality(play)
 *   quality(play)  = Σ ability_i × rehearsalEffort_i   (§2.35 contest shape, no RNG)
 *   box_office     = Σ_a [ ticket·1(willingness>0) + repeatBonus·1(willingness>θ) ]
 *
 * Every input is auditable: warmth from the relationship tone graph, repute from
 * the troupe accumulator, ability from character attrs, effort from the tick
 * loop's rehearsal accounting. A good night is earned by the season's work.
 */

/** One cast member's contribution to the play's quality. */
export interface PlayContribution {
    characterId: string;
    /** Performer ability, 0..1 (from attrs). */
    ability: number;
    /** This season's accumulated rehearsal effort for this play, ≥0. */
    rehearsalEffort: number;
}

/** The play being performed. */
export interface BoxOfficePlay {
    contributions: PlayContribution[];
}

/** One audience agent and its pre-computed warmth toward the troupe. */
export interface BoxOfficeAudienceMember {
    id: string;
    name: string;
    /** 0..1 warmth toward the troupe/cast (derived from relationship tone edges). */
    warmth: number;
}

/** Tunable, but FIXED for a run so the number is reproducible. */
export interface BoxOfficeWeights {
    /** willingness weight on audience warmth. */
    w1: number;
    /** willingness weight on troupe repute. */
    w2: number;
    /** willingness weight on play quality. */
    w3: number;
    /** Face price a willing (willingness>0) audience member pays once. */
    ticket: number;
    /** Extra a delighted (willingness>θ) member pays as a repeat/加場 draw. */
    repeatBonus: number;
    /** Delight threshold for the repeat bonus. */
    theta: number;
    /** Divisor that maps raw Σ(ability·effort) into a 0..1 quality band. */
    qualityScale: number;
}

export const DEFAULT_BOX_OFFICE_WEIGHTS: BoxOfficeWeights = {
    w1: 0.4,
    w2: 0.2,
    w3: 0.4,
    ticket: 10,
    repeatBonus: 5,
    theta: 0.6,
    qualityScale: 10,
};

/** Per-audience audit row. */
export interface AudienceBreakdown {
    id: string;
    name: string;
    warmth: number;
    willingness: number;
    bought: boolean;
    repeat: boolean;
    /** ticket (+ repeatBonus if repeat) contributed by this member. */
    contribution: number;
}

export interface BoxOfficeResult {
    /** Σ ability_i × rehearsalEffort_i, clamped into 0..1 by qualityScale. */
    quality: number;
    /** Raw Σ ability_i × rehearsalEffort_i before scaling (audit). */
    qualityRaw: number;
    /** The repute figure that fed every willingness. */
    repute: number;
    /** Σ contributions. */
    total: number;
    /** Head count that bought a ticket. */
    tickets: number;
    /** Head count that also paid the repeat bonus. */
    repeats: number;
    perAudience: AudienceBreakdown[];
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Play quality = Σ ability_i × rehearsalEffort_i, scaled into a 0..1 band.
 *  Pure; exported so the season predicate and reports can read the same number. */
export function computePlayQuality(play: BoxOfficePlay, qualityScale = DEFAULT_BOX_OFFICE_WEIGHTS.qualityScale): {
    raw: number;
    scaled: number;
} {
    let raw = 0;
    for (const c of play.contributions) raw += Math.max(0, c.ability) * Math.max(0, c.rehearsalEffort);
    return { raw, scaled: clamp01(raw / Math.max(1e-9, qualityScale)) };
}

/**
 * Settle a performance into a box-office figure + a per-audience breakdown.
 * Deterministic: identical inputs always return an identical result.
 */
export function computeBoxOffice(
    audience: ReadonlyArray<BoxOfficeAudienceMember>,
    play: BoxOfficePlay,
    repute: number,
    weights: BoxOfficeWeights = DEFAULT_BOX_OFFICE_WEIGHTS,
): BoxOfficeResult {
    const q = computePlayQuality(play, weights.qualityScale);
    const rep = clamp01(repute);
    const perAudience: AudienceBreakdown[] = [];
    let total = 0;
    let tickets = 0;
    let repeats = 0;
    for (const a of audience) {
        const warmth = clamp01(a.warmth);
        const willingness = weights.w1 * warmth + weights.w2 * rep + weights.w3 * q.scaled;
        const bought = willingness > 0;
        const repeat = willingness > weights.theta;
        const contribution = (bought ? weights.ticket : 0) + (repeat ? weights.repeatBonus : 0);
        if (bought) tickets++;
        if (repeat) repeats++;
        total += contribution;
        perAudience.push({ id: a.id, name: a.name, warmth, willingness, bought, repeat, contribution });
    }
    return { quality: q.scaled, qualityRaw: q.raw, repute: rep, total, tickets, repeats, perAudience };
}
