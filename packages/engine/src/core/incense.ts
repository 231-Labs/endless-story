/**
 * 香火 — the owner's influence channel (pure; no chain, no LLM, no I/O).
 *
 * RECRUIT_INCENSE_SPEC §3: a character's OWNER may burn one stick of incense a
 * day — a spoken line addressed to 神明 on the character's behalf. The stick
 * does exactly three things, all riding EXISTING rails:
 *
 *   1. Hangs an owner-prayer (`Prayer` with `source: 'owner'`) on the 願牆 and
 *      the temple scene's 願籤 facet — visible to the operator/owner, part of
 *      the world's texture.
 *   2. Nudges the heat of ONE EXISTING live want of that character by a small ε
 *      (`INCENSE.heatNudge`) — the forcing-pressure currency the whole want
 *      engine already runs on. 推「放不下」，不推「去做」: no want may be
 *      created (自主權紅線 — influence can only warm what the heart already
 *      holds), and a retired want takes no incense.
 *   3. Schedules ONE private percept for the character next tick —「無端又想起
 *      那樁事」— the world-internal reading is 神明感應; the character NEVER
 *      learns the incense exists.
 *
 * 哲學紅線 (spec §3): incense moves desire STRENGTH, never decisions. Every
 * decision stays with decideMove/actBeat. Daily cap: one stick per character
 * per day (`incenseDayByChar`). Deterministic: ids derive from day+character
 * (unique under the cap) — no wall clock, no randomness.
 */

import { WANT } from './want-core.ts';
import { templeScenesOf } from './temple-prayer.ts';
import type { WorldState } from '../world-state.ts';

export const INCENSE = {
    /** ε per stick — sized like one co-presence tick of a bond want
     *  (WANT.bondCopresenceHeat): a stir toward pressing over days of devotion,
     *  never a single-stick jump past resistance. */
    heatNudge: WANT.bondCopresenceHeat,
    /** The 願牆 line is a spoken sentence, not an essay. */
    maxTextChars: 60,
} as const;

export type IncenseRefusal =
    | 'no-character'
    | 'no-temple'
    | 'daily-cap'
    | 'no-want'
    | 'retired-want';

export type IncenseOutcome =
    | { ok: true; prayerId: string }
    | { ok: false; reason: IncenseRefusal };

export interface IncenseInput {
    /** The owned character the stick is burned FOR. */
    characterId: string;
    /** The EXISTING live want the incense points at (owner picks it off the
     *  願榜/POV surface). Required: no want, no effect — 不能無中生願. */
    wantId: string;
    /** The owner's spoken line to 神明 (goes on the 願牆 verbatim, clamped). */
    text: string;
}

/**
 * Burn one stick. Pure state transition on the world; the caller (web/lab API)
 * owns persistence. Refusals are DATA, not throws — the owner-facing flow turns
 * them into gentle copy (「今日的香已上過了」).
 */
export function offerIncense(world: WorldState, input: IncenseInput): IncenseOutcome {
    const w = world.data;
    const member = w.cast.find((c) => c.id === input.characterId);
    if (!member) return { ok: false, reason: 'no-character' };

    // The stick physically burns at a temple — a world with no temple has no
    // incense channel at all (same inertness contract as the 祈願 step).
    const temples = templeScenesOf(world);
    const templeSceneId = w.scenes.find((s) => temples.has(s.id))?.id;
    if (!templeSceneId) return { ok: false, reason: 'no-temple' };
    const templeName = w.scenes.find((s) => s.id === templeSceneId)!.name;

    const day = w.clock.day;
    if (w.incenseDayByChar?.[member.id] === day) return { ok: false, reason: 'daily-cap' };

    const want = w.wants.find((x) => x.id === input.wantId && x.characterId === member.id);
    if (!want) return { ok: false, reason: 'no-want' };
    if (want.retired) return { ok: false, reason: 'retired-want' };

    // 1) The nudge — heat is the forcing currency; ε is a whisper, capped daily.
    want.heat += INCENSE.heatNudge;

    // 2) The 願籤 — an owner-prayer on the wall + the temple 內頁.
    const prayerId = `incense-d${day}-${member.id}`;
    const text = input.text.trim().slice(0, INCENSE.maxTextChars) || `信香一炷，護佑${member.name}。`;
    (w.prayers ??= []).push({
        id: prayerId,
        characterId: member.id,
        name: member.name,
        day,
        tick: w.clock.currentTick,
        clock: w.clock.partOfDay,
        sceneId: templeSceneId,
        sceneName: templeName,
        text,
        wantDesc: want.desc,
        layer: want.layer,
        target: want.target,
        source: 'owner',
    });
    (w.incenseDayByChar ??= {})[member.id] = day;

    // 3) The percept — one private line next tick, wherever the character then
    // stands (delivery resolves the scene; witnesses = the character alone).
    (w.scheduledEvents ??= []).push({
        id: `${prayerId}-stir`,
        atTick: w.clock.currentTick + 1,
        sceneId: w.roster[member.id] ?? w.homeByChar[member.id],
        text: `${member.name}心頭無端一動，又想起那樁事——${want.desc}。`,
        visibility: 'private',
        witnessIds: [member.id],
    });

    return { ok: true, prayerId };
}
