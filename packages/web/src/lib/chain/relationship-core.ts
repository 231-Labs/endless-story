/**
 * Pure half of the relationship graph (no chain, no LLM): tone coercion, time-decay
 * cooling (§2.4) and the warm graph the spatial router consumes (§2.50). Re-exported
 * from relationship-evolve.ts so callers keep one import site.
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

export function toneZh(tone: RelationshipTone): string {
    return TONE_ZH[tone] ?? TONE_ZH.neutral;
}

/** Chinese label → enum, so a GLM reply of 「競爭」 isn't dropped to neutral. */
const ZH_TO_TONE = new Map<string, RelationshipTone>(
    (Object.entries(TONE_ZH) as [RelationshipTone, string][]).map(([en, zh]) => [zh, en]),
);

/** Accept the enum or its Chinese label; fall back to neutral. */
export function coerceTone(raw: string): RelationshipTone {
    const t = raw.trim();
    const lower = t.toLowerCase();
    if (TONE_SET.has(lower)) return lower as RelationshipTone;
    return ZH_TO_TONE.get(t) ?? 'neutral';
}

export interface DirectedEdge {
    toId: string;
    toName: string;
    tone: RelationshipTone;
    /** Decayed seeding strength. */
    weight: number;
}

/* Cooling (§2.4): each seeding contributes 0.5^(age/halfLife); un-reaffirmed ties cool,
 * and below `minStrength` they fade off the graph — the down-force so relationships
 * ebb, not just accrue. */
export interface RelEventLite {
    characterA: string;
    characterB: string;
    tone: string;
    /** Tick the tie was seeded on (harness encodes this in seededAtMs). */
    tick: number;
}

/** Ticks for an un-reaffirmed tie to halve in strength. */
export const DECAY_HALF_LIFE = 2;
/** Below this a directed tie fades off the graph. */
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
        if (ev.characterA !== sourceId) continue;
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
        if (e.strength < minStrength) continue;
        out.push({ toId: e.toId, toName: '', tone: e.tone, weight: e.strength });
    }
    return out.sort((a, b) => b.weight - a.weight);
}

/** Tones warm enough to welcome someone home / to pull you at night (§2.50). */
export const WELCOMING_TONES = new Set<RelationshipTone>(['romance', 'affection', 'mentorship']);

export interface WarmGraph {
    /** Strongest warm outgoing edge per id, capped 0..1. */
    pursueByChar: Map<string, { id: string; w: number }>;
    /** Does host warmly welcome visitor into their home (0..1)? */
    welcome: (hostId: string, visitorId: string) => number;
}

/** Derive the router's `pursue` + `welcome` from raw relationship events, restricted to
 *  the roster. `outgoing` is weight-sorted, so the first warm edge is the strongest pull. */
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
