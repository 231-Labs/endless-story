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
} as const;

export const tension = (w: Want): number => w.weight * (1 - w.sat);

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

/** Does the private 2-person scene hold a live `re`-layer want aimed across the
 *  pair? Shared by 幽會 / 了結 / the 撞破 pair check. Pure. */
function pairWantBetween(
    cs: ReadonlyArray<{ id: string; name: string }>,
    privacyLevel: number,
    wants: ReadonlyArray<Want>,
    re: RegExp,
): boolean {
    if (cs.length !== 2 || privacyLevel < 3) return false;
    return cs.some((a) => {
        const other = cs.find((o) => o.id !== a.id)!;
        return wants.some(
            (w) =>
                !w.retired &&
                w.characterId === a.id &&
                re.test(w.layer) &&
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
): boolean {
    return pairWantBetween(cs, privacyLevel, wants, LOVE_LAYER);
}

/** 了結 qualification (H1): the same private-pair gate for an unsettled
 *  debt/guilt/grudge want — a reckoning, not a tryst (no intimacy gate). */
export function qualifiesAsReckoning(
    cs: ReadonlyArray<{ id: string; name: string }>,
    privacyLevel: number,
    wants: ReadonlyArray<Want>,
): boolean {
    return pairWantBetween(cs, privacyLevel, wants, RECKON_LAYER);
}

/** Shared night-pursuit core: the hottest live want whose layer matches `re`
 *  and that is at pressing+ points its owner toward its target. Returns the
 *  chosen want too, so callers can gate intrusion on its forcing level. Pure. */
function nightPursuit(
    wants: ReadonlyArray<Want>,
    characterId: string,
    resolveTargetId: (target: string) => string | undefined,
    re: RegExp,
): { id: string; w: number; want: Want } | null {
    let best: Want | null = null;
    for (const w of wants) {
        if (w.retired || w.characterId !== characterId || !w.target) continue;
        if (!re.test(w.layer)) continue;
        if (forcingLevel(w) === 'idle') continue; // only a ripe want moves feet
        if (!best || tension(w) > tension(best)) best = w;
    }
    if (!best) return null;
    const id = resolveTargetId(best.target!);
    return id && id !== characterId ? { id, w: Math.min(1, tension(best)), want: best } : null;
}

/** 妒火夜隨 (G8b): the hottest jealousy/grudge want at pressing+ follows its
 *  target into the night, UNINVITED (intrude skips the welcome gate). Pure. */
export function jealousNightPursuit(
    wants: ReadonlyArray<Want>,
    characterId: string,
    resolveTargetId: (target: string) => string | undefined,
): { id: string; w: number; intrude: true } | null {
    const p = nightPursuit(wants, characterId, resolveTargetId, JEALOUS_LAYER);
    return p ? { id: p.id, w: p.w, intrude: true } : null;
}

/** 夜赴 (H1/H3): a ripe love or unsettled-debt want seeks its target at night
 *  so the private pair can form and the strict resolve pass gets its shot.
 *  WELCOME-gated by default (a reckoning emerges from the relationship graph),
 *  BUT at 'breaking' the want is overwhelming enough to barge in uninvited —
 *  the venue finally forms even when the other side is wary (H3: without this,
 *  one-sided debt/love never reached its target and circled forever). */
export function yearningNightPursuit(
    wants: ReadonlyArray<Want>,
    characterId: string,
    resolveTargetId: (target: string) => string | undefined,
): { id: string; w: number; intrude?: true } | null {
    const p = nightPursuit(wants, characterId, resolveTargetId, new RegExp(`${LOVE_LAYER.source}|${RECKON_LAYER.source}`));
    if (!p) return null;
    return forcingLevel(p.want) === 'breaking'
        ? { id: p.id, w: p.w, intrude: true }
        : { id: p.id, w: p.w };
}

/** Night-scene qualification (G8/G8b, H1): a private scene plays at night as a
 *  幽會 tryst (the pair + a live love want), a 了結 reckoning (the pair + an
 *  unsettled debt/grudge want), or a 撞破 confrontation (either pair + ONE
 *  jealous third aimed at one of them). Anything else sleeps. */
export function nightSceneKind(
    cs: ReadonlyArray<{ id: string; name: string }>,
    privacyLevel: number,
    wants: ReadonlyArray<Want>,
): 'tryst' | 'reckoning' | 'confrontation' | null {
    if (privacyLevel < 3) return null;
    if (cs.length === 2) {
        if (qualifiesAsTryst(cs, privacyLevel, wants)) return 'tryst';
        if (qualifiesAsReckoning(cs, privacyLevel, wants)) return 'reckoning';
        return null;
    }
    if (cs.length !== 3) return null;
    for (let i = 0; i < 3; i++) {
        const third = cs[i];
        const pair = cs.filter((_, j) => j !== i);
        const pairPlays =
            qualifiesAsTryst(pair, privacyLevel, wants) || qualifiesAsReckoning(pair, privacyLevel, wants);
        if (!pairPlays) continue;
        const jealous = wants.some(
            (w) =>
                !w.retired &&
                w.characterId === third.id &&
                JEALOUS_LAYER.test(w.layer) &&
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
        Partial<Pick<Want, 'target' | 'id' | 'resource'>>,
): Want {
    return {
        id: init.id ?? `w${Date.now().toString(36)}-${++_seq}`,
        characterId: init.characterId,
        layer: init.layer,
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
                    characterId: d.characterId,
                    layer: normalizeLayer(d.layer),
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
