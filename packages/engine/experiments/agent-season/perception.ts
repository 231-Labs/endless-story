/**
 * AGENT-SEASON · PERCEPTION (眼耳鼻身) — passive, positionally-GATED snapshot.
 * ============================================================================
 * Perception is PASSIVE: the engine computes a per-時辰, positionally-GATED snapshot
 * and injects it into the plan. The character does NOT call senses as tools. The
 * engine emits OBJECTIVE, gated signals; the LLM INTERPRETS them (subjective). This
 * is what unblocks the 抓姦 starvation — a jealous third in an ADJACENT room HEARS an
 * intimate scene without being in it, and can rush over.
 *
 * The four channels, each honestly gated (never omniscient):
 *   · 眼 sight — who is co-present in self's OWN room (names + roles).
 *   · 耳 hear  — a MUFFLED, LEAKY signal from a notable scene in the SAME building-
 *                cluster but a DIFFERENT room. It never names who / what — leaky by
 *                design (that is the whole point: you sense it, you don't know it).
 *   · 鼻 smell — a fresh TRACE lingering at self's venue, left by a scene self was
 *                NOT in (rooms remember recent notable events for ~TRACE_TTL 時辰).
 *   · 身 body  — self's felt bodily state, surfaced only when it presses on them.
 *
 * GENERAL / data-driven: every signal is derived from cast venues, scene records and
 * the cluster map — NO character names are special-cased anywhere in this module.
 */

import type { PartOfDay } from '../../src/index.ts';
import type { Char } from './world.ts';
import { FOOD_VENUES } from './world.ts';
import { sameCluster } from './rhythm.ts';
import { HEALTH, HUNGER_FELT, MEAL_COST } from './health.ts';

export type TraceKind = 'intimacy' | 'quarrel';

export interface Trace {
    /** 時辰 index the trace was laid down (for decay). */
    tick: number;
    kind: TraceKind;
    /** the lingering-sense line a later occupant would smell/see (rooms remember). */
    note: string;
    /** participant ids who left it — so the one who WAS in it never 'smells' their own. */
    by: string[];
}

/** venue → the freshest trace lingering there. */
export type TraceStore = Map<string, Trace>;

/** How many 時辰 a trace lingers before it fades. */
export const TRACE_TTL = 2;

/** Minimal structural view of a rendered scene (round.ts's SceneRecord is compatible,
 *  so this module never has to import from round.ts — keeps the dependency one-way). */
export interface PerceivedScene {
    venue: string;
    participantIds: string[];
    consummate: boolean;
    discovery?: boolean;
    isPrivate: boolean;
    intimacyGate: boolean;
}

/** Is a scene NOTABLE enough to leak through a wall / leave a lingering trace, and of
 *  what kind? intimacy = a 床/私密纏綿; quarrel = a 修羅場/衝突. null = ordinary, no leak. */
export function notableKind(s: PerceivedScene): TraceKind | null {
    if (s.discovery) return 'quarrel';
    if (s.consummate) return 'intimacy';
    if (s.isPrivate && s.intimacyGate) return 'intimacy';
    return null;
}

const HEAR_LINE: Record<TraceKind, string> = {
    intimacy: '隔著板壁，那頭廂房裡透出壓抑的動靜，像是有人在裡頭纏著——聽不真切是誰。',
    quarrel: '隔著板壁，鄰處像是起了爭執，壓著嗓子，你聽不清是誰、也聽不清為著什麼。',
};
const SMELL_LINE: Record<TraceKind, string> = {
    intimacy: '屋裡一縷沒散盡的脂粉甜香，不是你的；帳幔還亂著，杯盞也沒收。',
    quarrel: '屋裡杯盞打翻、茶潑了一桌，方才像是有人在此動過氣。',
};

export interface Perception {
    sight?: string;
    hear?: string;
    smell?: string;
    body?: string;
}

/** Does `self` (standing at self.venue) HEAR notable scene `s`? Gated: the scene is
 *  notable, self is NOT in it, it is a DIFFERENT room, and that room is in the SAME
 *  building-cluster. Returns the kind (for phrasing) or null. Never reveals who. */
export function hearsScene(self: Char, s: PerceivedScene): TraceKind | null {
    const kind = notableKind(s);
    if (!kind) return null;
    if (s.participantIds.includes(self.id)) return null;
    if (self.venue === s.venue) return null; // same room = you are present, not "hearing"
    if (!sameCluster(self.venue, s.venue)) return null; // across town = no leak
    return kind;
}

/**
 * Compute self's positionally-gated perception this 時辰. `scenesThisRound` are the
 * recent notable scenes whose sound could still be leaking (round.ts feeds the PREVIOUS
 * 時辰's scenes so hearing is honestly delayed by a 時辰, never omniscient about the
 * scene currently rendering). `traces` supplies the lingering 鼻 signal.
 */
export function computePerception(
    self: Char,
    cast: Char[],
    scenesThisRound: PerceivedScene[],
    traces: TraceStore,
    part: PartOfDay,
): Perception {
    void part; // reserved: a future gate may dampen leaks by 時辰 (e.g. daytime bustle)
    const p: Perception = {};

    // 眼 — who is physically co-present in self's OWN room right now.
    const co = cast.filter((o) => o.id !== self.id && !o.dead && o.venue === self.venue);
    if (co.length) p.sight = `同在${self.venue}的：${co.map((o) => `${o.name}（${o.role}）`).join('、')}。`;

    // 耳 — a muffled, LEAKY signal from an adjacent room (first one wins; never names who).
    for (const s of scenesThisRound) {
        const k = hearsScene(self, s);
        if (k) {
            p.hear = HEAR_LINE[k];
            break;
        }
    }

    // 鼻 — a fresh trace lingering AT self's venue, left by a scene self was NOT in.
    const tr = traces.get(self.venue);
    if (tr && !tr.by.includes(self.id)) p.smell = tr.note;

    // 身 — self's felt bodily state (乏/餓), surfaced only when it actually presses on them.
    if (self.health <= HEALTH.wornAt || self.fatigue >= 0.5 || self.hunger >= HUNGER_FELT) p.body = bodyFeltLine(self);

    return p;
}

function bodyFeltLine(c: Char): string {
    const parts: string[] = [];
    if (c.health <= HEALTH.dangerAt) parts.push('身子已透支到危險，眼前發黑，幾乎撐不住。');
    else if (c.health <= HEALTH.wornAt) parts.push('連著奔忙，身上乏透了，眼皮沉得抬不起。');
    else if (c.fatigue >= 0.5) parts.push('有些乏了，精神還撐得住。');
    // Hunger is a SOFT driver: it tells the character they're hungry + roughly how much coin
    // they carry + where food is, then leaves the choice to them (the LLM). No forcing.
    if (c.hunger >= HUNGER_FELT) {
        const streets = [...FOOD_VENUES].join('、'); // derived from world data, not name-cased
        parts.push(`肚裡空了，該尋個攤子吃點東西；${moneyFeel(c.money)}（${streets}都有攤子小吃）。`);
    }
    return parts.join('');
}

/** Rough felt sense of one's own purse (bands off the raw number — DATA, not name-logic). */
function moneyFeel(m: number): string {
    if (m <= 0) return '摸摸身上，一個子兒也不剩了';
    if (m < MEAL_COST) return '摸摸身上，只剩幾個銅板，怕不夠吃頓像樣的';
    if (m < 20) return '摸摸身上，還有些散錢';
    return '身上錢還算寬裕';
}

/** Leave a trace at a scene's venue when it renders — rooms remember a recent notable
 *  event for ~TRACE_TTL 時辰. No-op for ordinary scenes. GENERAL: driven by the scene's
 *  own flags + participants, never by who is in it. */
export function leaveTrace(traces: TraceStore, s: PerceivedScene, tick: number): void {
    const kind = notableKind(s);
    if (!kind) return;
    traces.set(s.venue, { tick, kind, note: SMELL_LINE[kind], by: [...s.participantIds] });
}

/** Fade traces older than TRACE_TTL 時辰 (call once at the top of each 時辰). */
export function decayTraces(traces: TraceStore, now: number): void {
    for (const [v, t] of traces) if (now - t.tick > TRACE_TTL) traces.delete(v);
}
