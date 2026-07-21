/**
 * 注夢 — the owner's second influence channel (pure; no chain, no LLM, no I/O).
 *
 * The last true experimental-era legacy to migrate: the engine's vocabulary
 * survived the port all along (`WantSource 'dream'`, `MemoryKind 'dream'`,
 * `WANT.tighten` — the self-described dream-stir dose) while the mechanism
 * itself did not. This module brings it back on the modern rails, one philosophy
 * with 香火 (`core/incense.ts`) but one strength-step up:
 *
 *   香火 nudges the HEAT of an existing want — zero content.
 *   注夢 delivers ONE IMAGE into the character's night — content, but only ever
 *   imagery (「雪地裡一枝壓彎的紅梅」), never an instruction (「去找金鳳」).
 *
 * 紅線 (MORTALITY_AND_DREAMS §1):
 *   1. Imagery only. The caller passes a picture; the framing text presents it
 *      as a dream and nothing else.
 *   2. A dream NEVER spawns or heats a want directly. It lands as one private
 *      percept (the tick's delivery pass carries it into memory / the next
 *      beat's situation); whether it stirs anything is the character's OWN
 *      reading — ripple/regenerateWant may pick it up with the dream-stir dose,
 *      and only then does a want with `source: 'dream'` exist.
 *   3. 每角每三日一夢 (`dreamDayByChar`) — dreams that come nightly stop being
 *      omens and start being spam.
 *   4. The character never learns where the dream came from (夢就是夢); the
 *      owner never learns how it will be read (這正是產品).
 *
 * The percept is scheduled for the NEXT 深宵 tick — dreams arrive in deep
 * night, however early the stick... the letter... the owner queues one.
 * Deterministic: ids derive from day+character (unique under the cadence cap).
 */

import type { WorldClock } from '../ports.ts';
import type { WorldState } from '../world-state.ts';

export const DREAM = {
    /** Days between dreams for one character (day N ⇒ next allowed N+cadence). */
    cadenceDays: 3,
    /** One image, one sentence. */
    maxImageryChars: 60,
} as const;

export type DreamRefusal = 'no-character' | 'no-imagery' | 'cadence';

export type DreamOutcome =
    | { ok: true; eventId: string; atTick: number }
    | { ok: false; reason: DreamRefusal };

export interface DreamInput {
    /** The owned character the dream is sent TO. */
    characterId: string;
    /** The single image, verbatim (clamped). Imagery, never instruction. */
    imagery: string;
}

/** The smallest tick AFTER `clock.currentTick` whose part-of-day is 深宵 (the
 *  last of the six parts) — mirrors makeClock's derivation arithmetically so the
 *  pure core needs no adapter import. */
export function nextDeepNightTick(clock: WorldClock): number {
    const perDay = Math.max(1, Math.floor(clock.ticksPerDay));
    for (let t = clock.currentTick + 1; t <= clock.currentTick + perDay; t++) {
        const tickOfDay = ((t % perDay) + perDay) % perDay;
        const idx = Math.min(5, Math.floor((tickOfDay / perDay) * 6));
        if (idx === 5) return t;
    }
    return clock.currentTick + perDay; // unreachable; every day ends in 深宵
}

/**
 * Queue one dream. Pure state transition on the world; the caller (web/lab API)
 * owns persistence. Refusals are DATA, not throws — the owner-facing flow turns
 * them into gentle copy (「夢不可夜夜託」).
 */
export function injectDream(world: WorldState, input: DreamInput): DreamOutcome {
    const w = world.data;
    const member = w.cast.find((c) => c.id === input.characterId);
    if (!member) return { ok: false, reason: 'no-character' };

    const imagery = input.imagery.trim().slice(0, DREAM.maxImageryChars);
    if (!imagery) return { ok: false, reason: 'no-imagery' };

    const day = w.clock.day;
    const last = w.dreamDayByChar?.[member.id];
    if (last !== undefined && day < last + DREAM.cadenceDays) return { ok: false, reason: 'cadence' };

    const atTick = nextDeepNightTick(w.clock);
    const eventId = `dream-d${day}-${member.id}`;
    // The dream lands at HOME (where one sleeps), private to the dreamer alone.
    // The framing presents the image as a dream and adds NOTHING else — no
    // moral, no sender, no instruction. What it means is the character's affair.
    (w.scheduledEvents ??= []).push({
        id: eventId,
        atTick,
        sceneId: w.homeByChar[member.id] ?? w.roster[member.id],
        text: `${member.name}深宵得了一夢：${imagery}。醒轉時那畫面還壓在心口。`,
        visibility: 'private',
        witnessIds: [member.id],
    });
    (w.dreamDayByChar ??= {})[member.id] = day;

    return { ok: true, eventId, atTick };
}
