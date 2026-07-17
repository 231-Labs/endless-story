/**
 * AGENT-SEASON · PRODUCTION — the 新戲 (Play) model + production tracking.
 * ============================================================================
 * Stage 2, layered ADDITIVELY on the clean 時辰-round core. A season now grows a
 * PLAY: the 班主 announces rehearsal (already exists) → a Play is seeded with the
 * chosen 戲碼 → troupe members who gather at a work venue become CAST and pour in
 * rehearsal EFFORT (recorded per member) → the play PREMIERES at the 大會串.
 *
 * Nothing here touches the LLM. Effort/quality/repute are DETERMINISTIC, auditable
 * accumulators; the box office (box-office.ts) reads them. The LLM only writes the
 * in-world prose of the rehearsal/performance scenes, never a number.
 */

export type PlayState = 'proposed' | 'scripted' | 'cast' | 'rehearsing' | 'premiered';

const ORDER: PlayState[] = ['proposed', 'scripted', 'cast', 'rehearsing', 'premiered'];

export interface Play {
    /** the 戲碼 the 班主 chose (raw, no 《》 — wrapped at display time). */
    title: string;
    state: PlayState;
    /** accumulated script fragments (opening seed + optional compose beats). */
    scriptFragments: string[];
    /** cast char ids (troupe members who joined a rehearsal). */
    cast: string[];
    /** charId → accumulated rehearsal effort (member-時辰 co-located at work venue). */
    effort: Map<string, number>;
    /** troupe repute accumulator 0..1 (grows with effort + rendered troupe scenes). */
    repute: number;
    /** day.part it premiered (for the report). */
    premieredAt?: string;
    /** state milestones for the report timeline. */
    timeline: Array<{ state: PlayState; at: string }>;
}

/**
 * Per-troupe-member ABILITY (0..1) — a per-member attribute, defined centrally so
 * the box office is auditable from one place. Only troupe/banzhu perform; everyone
 * else is 0 (they never enter a play's cast).
 */
export const ABILITY: Record<string, number> = {
    柳安春: 0.9,
    蘇映雪: 0.85,
    沈雪笙: 0.75,
    江聞鶴: 0.7,
    連翹: 0.6,
};

export function abilityOf(id: string): number {
    return ABILITY[id] ?? 0;
}

/** Deterministic production constants (all auditable, no RNG). */
export const PRODUCTION = {
    /** effort added per troupe member per rehearsal 時辰 co-located at a work venue. */
    effortPerGathering: 1,
    /** troupe repute floor (春雪社 dormant for years → low). */
    reputeBase: 0.2,
    /** repute gained per member-gathering. */
    reputePerEffort: 0.02,
    /** repute gained per rendered troupe scene at a work venue. */
    reputePerScene: 0.05,
    /** Σ ability·effort normaliser → quality in 0..1. */
    qualityNorm: 10,
} as const;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export function newPlay(title: string, at: string): Play {
    return {
        title,
        state: 'proposed',
        scriptFragments: [],
        cast: [],
        effort: new Map(),
        repute: PRODUCTION.reputeBase,
        timeline: [{ state: 'proposed', at }],
    };
}

/** Advance play state MONOTONICALLY (never regress), recording the milestone. */
function advance(play: Play, state: PlayState, at: string): void {
    if (ORDER.indexOf(state) <= ORDER.indexOf(play.state)) return;
    play.state = state;
    play.timeline.push({ state, at });
}

/**
 * Register a proposal when the 班主 announces rehearsal: set the chosen 戲碼, seed
 * an opening script fragment (so a play always has a script), advance to 'scripted'.
 */
export function registerProposal(play: Play, title: string, at: string): void {
    if (title && !play.title) play.title = title;
    if (!play.scriptFragments.length) {
        const t = play.title || title || '新戲';
        play.scriptFragments.push(`《${t}》開排：沈雪笙把封了多年的樟木戲箱開了，這一齣要重新立起來。`);
    }
    advance(play, 'scripted', at);
}

/** Add a cast member when a troupe member joins a rehearsal (dedup). */
export function addCast(play: Play, id: string, at: string): void {
    if (!play.cast.includes(id)) play.cast.push(id);
    if (play.cast.length >= 2) advance(play, 'cast', at);
}

/** Accumulate rehearsal effort for a member; any effort moves the play to rehearsing. */
export function accumulateEffort(play: Play, id: string, amount: number, at: string): void {
    play.effort.set(id, (play.effort.get(id) ?? 0) + amount);
    advance(play, 'rehearsing', at);
}

/** Optional: add a script fragment from a compose-style beat (effort is essential). */
export function addScriptFragment(play: Play, fragment: string): void {
    const f = fragment.trim();
    if (f && !play.scriptFragments.includes(f)) play.scriptFragments.push(f);
}

/** Repute grows with rehearsal effort. */
export function bumpReputeFromEffort(play: Play, memberCount: number): void {
    play.repute = clamp01(play.repute + PRODUCTION.reputePerEffort * memberCount);
}

/** Repute grows with each rendered troupe scene. */
export function bumpReputeFromScene(play: Play): void {
    play.repute = clamp01(play.repute + PRODUCTION.reputePerScene);
}

/** The 大會串 premiere: mark the play performed. */
export function markPremiered(play: Play, at: string): void {
    advance(play, 'premiered', at);
    play.premieredAt = at;
}

/** Σ over cast of ability_i · effort_i, normalised to 0..1. */
export function playQuality(play: Play): number {
    let sum = 0;
    for (const [id, eff] of play.effort) sum += abilityOf(id) * eff;
    return clamp01(sum / PRODUCTION.qualityNorm);
}

/** Total accumulated rehearsal effort (the razor threshold reads this). */
export function totalEffort(play: Play): number {
    let t = 0;
    for (const e of play.effort.values()) t += e;
    return t;
}

/** Which members' ability·effort drove quality, highest first. */
export function qualityDrivers(
    play: Play,
): Array<{ id: string; ability: number; effort: number; contribution: number }> {
    return [...play.effort.entries()]
        .map(([id, eff]) => ({ id, ability: abilityOf(id), effort: eff, contribution: abilityOf(id) * eff }))
        .sort((a, b) => b.contribution - a.contribution);
}
