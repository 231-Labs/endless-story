/**
 * 日常層 · Character state — the per-character daily-life undertone (餓 / 累 / 心情)
 * that tints how a character perceives and narrates a beat, WITHOUT changing who
 * they are. Orthogonal to two existing layers:
 *   - chain `attributes` (appearance/constitution/acuity/disposition) = STABLE traits.
 *   - `SagaSoul` (toneRegister/stance) = per-SAGA prose DNA.
 * This is the fast-moving, per-CHARACTER, per-tick layer.
 *
 * Why it exists (research §2.15-2.18): an open situation with no inner conflict
 * collapses the LLM to its「最像角色」reflex (趨同). A varying state injects the
 * conflict (餓 vs 顧身形, 累 vs 應酬) that spreads behaviour into a real distribution,
 * and decouples POSTURE from DESTINATION — the same person, a different moment.
 * state-baozi proved this on a single decision; this module carries it into the POV
 * path so it can tint a whole chapter.
 *
 * Same shape as `buildStanceBlock` / `buildSagaSoulBlock`: a pure, dependency-free
 * block builder that returns '' when nothing is notable, so a state-less character
 * yields a byte-identical prompt (regression-safe).
 */

export interface CharacterState {
    /** 0 = 飽足, 1 = 餓得發慌. */
    hunger: number;
    /** 0 = 精神, 1 = 累垮. */
    fatigue: number;
    /** -1 = 堵/沮喪, 0 = 平, +1 = 舒暢/開心. */
    mood: number;
    /** Optional concrete cause of the current state (e.g.「今晚斷橋演砸了，班主冷臉」).
     *  Grounds the abstract scalars in a specific recent why; rendered as 緣由. */
    note?: string;
}

/** A calm, fed, rested baseline — what a character drifts toward with nothing going on. */
export const NEUTRAL_STATE: CharacterState = { hunger: 0.2, fatigue: 0.2, mood: 0 };

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const clamp11 = (n: number): number => Math.max(-1, Math.min(1, n));

export function clampState(s: CharacterState): CharacterState {
    return {
        hunger: clamp01(s.hunger),
        fatigue: clamp01(s.fatigue),
        mood: clamp11(s.mood),
        note: s.note?.trim() || undefined,
    };
}

export interface StateDelta {
    hunger?: number;
    fatigue?: number;
    mood?: number;
    /** When provided, REPLACES the note (use '' to clear). Omit to keep the prior note. */
    note?: string;
}

/** Event-driven jump: apply additive deltas (eat → hunger down, perform → fatigue up,
 *  a verdict → mood up/down), clamp, optionally replace the 緣由 note. */
export function evolveState(prev: CharacterState, delta: StateDelta): CharacterState {
    return clampState({
        hunger: prev.hunger + (delta.hunger ?? 0),
        fatigue: prev.fatigue + (delta.fatigue ?? 0),
        mood: prev.mood + (delta.mood ?? 0),
        note: delta.note !== undefined ? delta.note : prev.note,
    });
}

/** Passive per-tick drift: hunger creeps up, fatigue a little, mood eases back toward
 *  calm. The body keeps living between events, so a character is never frozen. */
export function driftState(prev: CharacterState): CharacterState {
    return clampState({
        hunger: prev.hunger + 0.15,
        fatigue: prev.fatigue + 0.08,
        mood: prev.mood * 0.7,
        note: prev.note,
    });
}

/**
 * Build the「此刻身心」block appended to the POV USER prompt. Only emits the
 * NOTABLE bands (so a near-neutral state injects nothing), and frames the state as
 * BACKGROUND COLOUR — it must tint attention/語氣/小動作, never become the event the
 * chapter narrates. Returns '' when nothing is notable (regression-safe).
 */
export function buildStateBlock(state?: CharacterState): string {
    if (!state) return '';
    const bits: string[] = [];

    if (state.hunger >= 0.66) bits.push('餓得前胸貼後背，胃裡一陣陣發空');
    else if (state.hunger >= 0.33) bits.push('肚裡有些餓了');
    else if (state.hunger <= 0.1) bits.push('剛吃過，肚裡飽飽的、略撐');

    if (state.fatigue >= 0.66) bits.push('累得骨頭都快散了，只想找個地方癱著');
    else if (state.fatigue >= 0.33) bits.push('身上帶著幾分乏意');

    if (state.mood >= 0.5) bits.push('心裡舒暢、輕快');
    else if (state.mood >= 0.2) bits.push('心情還算不錯');
    else if (state.mood <= -0.5) bits.push('心裡堵得發慌、提不起勁');
    else if (state.mood <= -0.2) bits.push('心裡有點悶');

    const note = state.note?.trim();
    if (bits.length === 0 && !note) return '';

    return [
        '',
        '## 此刻身心（底色 — 讓它滲進你的注意力、語氣、手上的小動作；**不要當成事件來寫，也不要直接說「我好餓／我好累」**，它只改你怎麼看眼前的人和物）',
        bits.length > 0 ? `- 身子：${bits.join('；')}。` : '',
        note ? `- 緣由：${note}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}
