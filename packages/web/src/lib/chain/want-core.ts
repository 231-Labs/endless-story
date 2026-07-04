/**
 * Want engine core — the narrative drive model (pure; no chain, no LLM, no I/O).
 * Validated shape: §2.36–2.38 (salience/forcing/saturation), §2.42–2.43
 * (resistance as a continuous gate, not a hard class), §2.51 (ripple units).
 * Wants replace contested-resource desires as the NARRATIVE driver; economic
 * slots keep their deterministic settlement lane (§2.35) untouched.
 */

import { applyActorFatigue, type FatigueLedger } from './actor-fatigue.ts';

export type WantSource = 'genesis' | 'ripple' | 'aftermath' | 'dream' | 'owner';

export interface Want {
    id: string;
    characterId: string;
    /** Free-text layer tag (愛/志向/戲班/身體/事務/…) — analytics only, never a gate. */
    layer: string;
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
    /** One line on how it resolved (feeds aftermath context). */
    resolvedNote?: string;
    kind: 'narrative' | 'economic';
    source: WantSource;
    bornTick: number;
    resolvedTick?: number;
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
    /** Defaults for spawned wants. */
    rippleWeight: 0.7,
    rippleSat: 0.2,
    rippleResistance: 3,
    /** Forcing escalation bands, as fractions of resistance. */
    pressingAt: 0.6,
} as const;

export const tension = (w: Want): number => w.weight * (1 - w.sat);

export const forcingPressure = (w: Want): number => w.heat + w.frust;

export type ForcingLevel = 'idle' | 'pressing' | 'edge';

/** How hard the world is pressing this want toward an answer. NEVER prescribes
 *  the answer — the prompt layer renders each level as pressure-only language. */
export function forcingLevel(w: Want): ForcingLevel {
    if (w.retired || w.kind === 'economic') return 'idle';
    const p = forcingPressure(w);
    if (p >= w.resistance) return 'edge';
    if (p >= w.resistance * WANT.pressingAt) return 'pressing';
    return 'idle';
}

let _seq = 0;
export function newWant(
    init: Pick<Want, 'characterId' | 'layer' | 'desc' | 'weight' | 'sat' | 'resistance' | 'kind' | 'source' | 'bornTick'> &
        Partial<Pick<Want, 'target' | 'id'>>,
): Want {
    return {
        id: init.id ?? `w${Date.now().toString(36)}-${++_seq}`,
        characterId: init.characterId,
        layer: init.layer,
        desc: init.desc,
        target: init.target,
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
}

/** Apply LLM-judged ripples: shift the target's hottest want, spawn new threads. */
export function applyRipples(wants: Want[], deltas: ReadonlyArray<RippleDelta>, tick: number): Want[] {
    const spawned: Want[] = [];
    for (const d of deltas) {
        const mine = wants.filter((w) => !w.retired && w.characterId === d.characterId);
        if (mine.length > 0 && d.shift !== 'none') {
            const hottest = mine.reduce((b, c) => (tension(c) > tension(b) ? c : b));
            hottest.sat = clamp01(
                d.shift === 'tighten' ? hottest.sat - WANT.tighten : hottest.sat + WANT.loosen,
            );
        }
        const nt = d.newThread?.trim();
        if (
            nt &&
            nt.length <= 22 &&
            !wants.some(
                (w) =>
                    w.characterId === d.characterId &&
                    !w.retired &&
                    (w.desc.includes(nt) || nt.includes(w.desc.slice(0, 8))),
            )
        ) {
            spawned.push(
                newWant({
                    characterId: d.characterId,
                    layer: d.layer?.trim() || '其他',
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
