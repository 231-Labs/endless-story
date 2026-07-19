/**
 * 廟願 — the temple-prayer mechanism (pure; no chain, no LLM, no I/O).
 *
 * A prayer is a DELIBERATE SPOKEN utterance a character makes at a physical
 * temple location — 角色真的來求、對神明說出口的話 — NOT an internal unspoken
 * want. This module holds the pure surface the tick pipeline drives:
 *
 *   · templeScenesOf — which scenes are temples (matched on the scene NAME,
 *     mirroring foodScenesOf's scene-matcher shape). A world with no temple
 *     scene ⇒ an EMPTY set ⇒ the 祈願 step + 廟 PULL are fully inert (backward
 *     compat: zero behaviour change).
 *   · framePrayerFallback — the DETERMINISTIC prayer framing used when the
 *     agent omits speakPrayer (the fake agent, and any offline run), so the
 *     mechanism is testable and still voices a prayer in 排演.
 *   · isStuckWant — the "stuck" predicate that pulls a worrier to the temple
 *     when 求人無門 (the 廟 PULL): high tension, long-carried, still pressing.
 */

import { forcingLevel, tension, type Want } from './want-core.ts';
import type { WorldState } from '../world-state.ts';

/** A temple by NAME: 廟/寺/庵/城隍/觀音/神壇/神龕/教堂/禮拜堂. Deliberately does
 *  NOT match 堂子/花廳/正堂 (a courtesan hall / guild hall is not a temple). */
export const TEMPLE_NAME_RE = /廟|寺|庵|城隍|觀音|神壇|神龕|教堂|禮拜堂/;

/** Scene ids whose NAME reads as a temple — the physical 神明 前 a character can
 *  stand at to speak a prayer. Pure read; a world with no temple ⇒ empty set. */
export function templeScenesOf(world: WorldState): Set<string> {
    const out = new Set<string>();
    for (const scene of world.data.scenes) {
        if (TEMPLE_NAME_RE.test(scene.name)) out.add(scene.id);
    }
    return out;
}

/** Gender-aware lay-worshipper self-address: 信士 (男) / 信女 (女) / 信人 (unknown). */
export function worshipperTitle(gender?: string): string {
    if (gender?.includes('女')) return '信女';
    if (gender?.includes('男')) return '信士';
    return '信人';
}

/**
 * The DETERMINISTIC prayer framing: a character's hottest want, voiced as a
 * spoken prayer addressed to 神明. Used when the agent omits speakPrayer, so the
 * mechanism runs (and is testable) with no LLM. Praying is EXPRESSION, not
 * resolution — this never touches the want.
 */
export function framePrayerFallback(name: string, wantDesc: string, gender?: string): string {
    return `神明在上，${worshipperTitle(gender)}${name}求告：${wantDesc}。`;
}

/** A soft deity hint derived from the temple name (a string, never a number) —
 *  lets the runner voice address the right 神明. undefined when unrecognised. */
export function deityHintFor(templeName: string): string | undefined {
    if (/城隍/.test(templeName)) return '城隍老爺';
    if (/觀音/.test(templeName)) return '觀音菩薩';
    if (/教堂|禮拜堂/.test(templeName)) return '主';
    return undefined;
}

/** "Stuck" tuning: a want that has ached this hard, this long, is worth taking
 *  to the god. Age floor mirrors WANT.fadeMinAgeTicks (a thread carried past a
 *  few days), and the tension floor keeps a passing whim out. */
export const STUCK = {
    tension: 0.45,
    minAgeTicks: 6,
} as const;

/**
 * The 廟 PULL predicate: a STUCK want — high tension AND long-carried AND still
 * actively pressing (forcing past idle: it has been pursued without resolving,
 * i.e. no recent progress). A fresh want (age 0) or a dormant one (idle, never
 * pushed) is NOT stuck, so the pull stays rare and never overrides livelihood.
 */
export function isStuckWant(w: Want, nowTick: number): boolean {
    if (w.retired || w.kind === 'economic') return false;
    if (tension(w) < STUCK.tension) return false;
    if (nowTick - w.bornTick < STUCK.minAgeTicks) return false;
    return forcingLevel(w) !== 'idle';
}
