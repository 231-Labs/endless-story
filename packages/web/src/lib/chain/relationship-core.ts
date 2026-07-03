/**
 * Relationship core — the PURE half of the relationship graph (no chain, no LLM,
 * no I/O). Tone coercion, time-decay aggregation (§2.4 cooling) and the warm
 * graph the spatial router consumes (§2.50) live here so they can be unit-tested
 * under plain `node --test` (the orchestration half, `relationship-evolve.ts`,
 * pulls in the SDK + admin signer and can't load outside tsx). Everything here
 * is re-exported from `relationship-evolve.ts`, so callers keep one import site.
 */
import type { RelationshipTone } from '@endless-story/shared';

export const TONES: RelationshipTone[] = [
    'romance',
    'affection',
    'mentorship',
    'rivalry',
    'wary',
    'tension',
    'estrangement',
    'acquaintance',
    'neutral',
];
const TONE_SET = new Set<string>(TONES);

export const TONE_ZH: Record<RelationshipTone, string> = {
    romance: '戀慕',
    affection: '親近',
    mentorship: '師徒',
    rivalry: '競爭',
    wary: '戒備',
    tension: '緊張',
    estrangement: '隔閡',
    acquaintance: '故舊',
    neutral: '平淡',
};

/** Chinese label for a tone (for the evolution-graph printout). */
export function toneZh(tone: RelationshipTone): string {
    return TONE_ZH[tone] ?? TONE_ZH.neutral;
}

/** Reverse map: Chinese label → enum, so a GLM reply of 「競爭」 isn't dropped to neutral. */
const ZH_TO_TONE = new Map<string, RelationshipTone>(
    (Object.entries(TONE_ZH) as [RelationshipTone, string][]).map(([en, zh]) => [zh, en]),
);

/** Accept the enum ('rivalry') OR its Chinese label ('競爭'); fall back to neutral. */
export function coerceTone(raw: string): RelationshipTone {
    const t = raw.trim();
    const lower = t.toLowerCase();
    if (TONE_SET.has(lower)) return lower as RelationshipTone;
    return ZH_TO_TONE.get(t) ?? 'neutral';
}

/* ── direction-aware read-back (for the evolution-graph printout) ───────────── */

export interface DirectedEdge {
    toId: string;
    toName: string;
    tone: RelationshipTone;
    /** repeat count — how many times this directed tie has been seeded (≈ weight). */
    weight: number;
}

/* ── cooling engine (§2.4): ties ebb unless reaffirmed ────────────────────────
 * Each seeding of a directed tie contributes `0.5^(age/halfLife)` to
 * its current strength. Stop reaffirming a tie and it cools; let it fall below
 * `minStrength` and it FADES OUT of the graph entirely (drops off the read). This is
 * the down-force the model was missing — relationships now ebb, not just accrue.
 *
 * `provenance` (per-trigger accrual rates) layers on top of this later; the decay is
 * the foundation. Pure + exported so it can be unit-tested without an LLM or a chain. */
export interface RelEventLite {
    characterA: string;
    characterB: string;
    tone: string;
    /** Tick the tie was seeded on (harness encodes this in the event's seededAtMs). */
    tick: number;
}

/** Ticks for an un-reaffirmed tie to halve in strength. */
export const DECAY_HALF_LIFE = 2;
/** Strength below which a directed tie has cooled off the graph (faded out). */
export const DECAY_MIN_STRENGTH = 0.35;

export function aggregateDecayedOutgoing(
    events: RelEventLite[], // newest-first
    sourceId: string,
    nowTick: number,
    opts?: { halfLife?: number; minStrength?: number },
): DirectedEdge[] {
    const halfLife = opts?.halfLife ?? DECAY_HALF_LIFE;
    const minStrength = opts?.minStrength ?? DECAY_MIN_STRENGTH;
    // newest-first ⇒ the first seeding seen for a pair sets its (latest) tone.
    const byTarget = new Map<string, { toId: string; tone: RelationshipTone; strength: number }>();
    for (const ev of events) {
        if (ev.characterA !== sourceId) continue; // outgoing only
        const toId = ev.characterB;
        if (!toId || toId === sourceId) continue;
        const age = Math.max(0, nowTick - ev.tick);
        const boost = Math.pow(0.5, age / halfLife);
        const existing = byTarget.get(toId);
        if (existing) {
            existing.strength += boost;
        } else {
            byTarget.set(toId, { toId, tone: coerceTone(ev.tone), strength: boost });
        }
    }
    const out: DirectedEdge[] = [];
    for (const e of byTarget.values()) {
        if (e.strength < minStrength) continue; // cooled off the graph
        out.push({ toId: e.toId, toName: '', tone: e.tone, weight: e.strength });
    }
    return out.sort((a, b) => b.weight - a.weight);
}

// ─── warm graph (feeds the spatial router §2.50) ─────────────────────────────
/** Tones warm enough to welcome someone into your home / to be a pull you follow at night. */
export const WELCOMING_TONES = new Set<RelationshipTone>(['romance', 'affection', 'mentorship']);

export interface WarmGraph {
    /** who each id is most warmly drawn toward (strongest warm outgoing edge, capped 0..1). */
    pursueByChar: Map<string, { id: string; w: number }>;
    /** does host warmly welcome visitor into their home (0..1)? */
    welcome: (hostId: string, visitorId: string) => number;
}

/** Pure: derive the router's `pursue` + `welcome` from raw relationship events, restricted
 *  to `charIds` (the roster). Unit-testable without a chain. `outgoing` is weight-sorted, so
 *  the first warm edge to a roster peer is the strongest pull. */
export function buildWarmGraph(events: RelEventLite[], charIds: readonly string[]): WarmGraph {
    const nowTick = events.reduce((m, e) => Math.max(m, e.tick), 0);
    const idSet = new Set(charIds);
    const outgoing = new Map<string, DirectedEdge[]>();
    for (const id of charIds) outgoing.set(id, aggregateDecayedOutgoing(events, id, nowTick));
    const welcome = (hostId: string, visitorId: string): number => {
        const e = outgoing.get(hostId)?.find((x) => x.toId === visitorId);
        return e && WELCOMING_TONES.has(e.tone) ? Math.min(1, e.weight) : 0;
    };
    const pursueByChar = new Map<string, { id: string; w: number }>();
    for (const id of charIds) {
        const warm = (outgoing.get(id) ?? []).find((e) => WELCOMING_TONES.has(e.tone) && idSet.has(e.toId));
        if (warm) pursueByChar.set(id, { id: warm.toId, w: Math.min(1, warm.weight) });
    }
    return { pursueByChar, welcome };
}
