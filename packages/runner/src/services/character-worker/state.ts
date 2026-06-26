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

/** Passive per-tick drift: hunger creeps up, mood eases back toward calm, and fatigue
 *  eases DOWN a little — a quiet tick is rest. WORK (evolveState +WORK_FATIGUE) is what
 *  tires; sleep is the deep recovery. (A passive fatigue *gain* here made every working
 *  character collapse mid-afternoon in the cadence sim — work + drift outran the day bar.)
 *  The body keeps living between events, so a character is never frozen. */
export function driftState(prev: CharacterState): CharacterState {
    return clampState({
        hunger: prev.hunger + 0.15,
        fatigue: prev.fatigue * 0.92,
        mood: prev.mood * 0.7,
        note: prev.note,
    });
}

/* ── fatigue → sleep ──────────────────────────────────────────────────
 * The sleep/REFLECT step (memory consolidation) was gated purely on a world-clock
 * string (`partOfDay === 'night'`), which silently broke (fixed on main, PR #75). The
 * durable model is to drive sleep off the character's own fatigue: a tired character
 * sleeps, and NIGHT only lowers the bar (a soft bias), so an exhausted performer can nap
 * by day while the rhythm still clusters at night. Decoupling sleep from a brittle clock
 * literal is the whole point — and it gives `fatigue` its first real consumer.
 */

/** Fatigue a single working beat (perform / POV / social) adds, before drift. */
export const WORK_FATIGUE = 0.18;
/** How much a full sleep recovers (subtracted from fatigue). */
export const SLEEP_RECOVERY = 0.7;
/** Fatigue bar to fall asleep at night vs in daytime — night lowers it (soft bias). */
export const NIGHT_SLEEP_FATIGUE = 0.5;
export const DAY_SLEEP_FATIGUE = 0.85;
/** Below this many un-consolidated memories, sleeping is pointless (nothing to digest). */
export const MIN_SCATTERED_TO_SLEEP = 2;
/** A backlog this big forces consolidation even if not tired — preserves the original
 *  memory-pressure trigger so a low-activity character still eventually digests. */
export const MEMORY_PRESSURE_CAP = 6;

export interface SleepDecisionInput {
    /** Current fatigue, 0..1. */
    fatigue: number;
    /** Is it a night bucket (入夜 / 深宵)? Lowers the fatigue bar, not a hard gate. */
    isNight: boolean;
    /** Un-consolidated memories available to digest. Sleep is pointless below the floor. */
    scatteredCount: number;
}

/**
 * Fatigue-driven sleep trigger, replacing the brittle `partOfDay === 'night'` gate.
 * Sleep when there's something to digest AND either: the backlog is big (memory pressure,
 * the original trigger) OR the character is tired enough — with night lowering the fatigue
 * bar (soft bias) rather than hard-gating. Pure function: the loop supplies the three inputs.
 */
export function shouldSleep(input: SleepDecisionInput): boolean {
    if (input.scatteredCount < MIN_SCATTERED_TO_SLEEP) return false;
    if (input.scatteredCount >= MEMORY_PRESSURE_CAP) return true;
    const bar = input.isNight ? NIGHT_SLEEP_FATIGUE : DAY_SLEEP_FATIGUE;
    return input.fatigue >= bar;
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
