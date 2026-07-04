/**
 * Per-character daily-life state (hunger / fatigue / mood) that tints how a
 * character narrates a beat without changing who they are (research §2.15-2.18).
 * Pure, dependency-free block builder returning '' when nothing is notable, so
 * a state-less character yields a byte-identical prompt (regression-safe).
 */

export interface CharacterState {
    /** 0 = full, 1 = starving. */
    hunger: number;
    /** 0 = rested, 1 = exhausted. */
    fatigue: number;
    /** -1 = low, 0 = flat, +1 = bright. */
    mood: number;
    /** Concrete cause of the current state; grounds the scalars in a recent why. */
    note?: string;
}

/** Calm, fed, rested baseline the state drifts toward. */
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
    /** When provided, REPLACES the note ('' clears). Omit to keep the prior note. */
    note?: string;
}

/** Event-driven jump: apply additive deltas and clamp. */
export function evolveState(prev: CharacterState, delta: StateDelta): CharacterState {
    return clampState({
        hunger: prev.hunger + (delta.hunger ?? 0),
        fatigue: prev.fatigue + (delta.fatigue ?? 0),
        mood: prev.mood + (delta.mood ?? 0),
        note: delta.note !== undefined ? delta.note : prev.note,
    });
}

/** Passive per-tick drift: hunger creeps up, mood eases to calm, fatigue eases
 *  DOWN — a quiet tick is rest. (A passive fatigue gain here made every working
 *  character collapse mid-afternoon in the cadence sim.) */
export function driftState(prev: CharacterState): CharacterState {
    return clampState({
        hunger: prev.hunger + 0.15,
        fatigue: prev.fatigue * 0.92,
        mood: prev.mood * 0.7,
        note: prev.note,
    });
}

/* Fatigue-driven sleep replaces the brittle `partOfDay === 'night'` clock gate
 * (silently broke; fixed on main, PR #75): a tired character sleeps, and night
 * only lowers the bar so an exhausted performer can still nap by day. */

/** Fatigue a single working beat (perform / POV / social) adds, before drift. */
export const WORK_FATIGUE = 0.18;
/** Fatigue recovered by a full sleep. */
export const SLEEP_RECOVERY = 0.7;
/** Fatigue bar to fall asleep at night vs in daytime — night lowers it (soft bias). */
export const NIGHT_SLEEP_FATIGUE = 0.5;
export const DAY_SLEEP_FATIGUE = 0.85;
/** Below this many un-consolidated memories, sleeping is pointless. */
export const MIN_SCATTERED_TO_SLEEP = 2;
/** A backlog this big forces consolidation even if not tired. */
export const MEMORY_PRESSURE_CAP = 6;

export interface SleepDecisionInput {
    /** Current fatigue, 0..1. */
    fatigue: number;
    /** Night lowers the fatigue bar; not a hard gate. */
    isNight: boolean;
    /** Un-consolidated memories available to digest. */
    scatteredCount: number;
}

/**
 * Sleep when there's something to digest AND either the backlog forces it
 * (memory pressure) or fatigue crosses the bar (night lowers the bar).
 */
export function shouldSleep(input: SleepDecisionInput): boolean {
    if (input.scatteredCount < MIN_SCATTERED_TO_SLEEP) return false;
    if (input.scatteredCount >= MEMORY_PRESSURE_CAP) return true;
    const bar = input.isNight ? NIGHT_SLEEP_FATIGUE : DAY_SLEEP_FATIGUE;
    return input.fatigue >= bar;
}

/**
 * State block for the POV user prompt. Emits only notable bands and frames the
 * state as background colour, never the event the chapter narrates; returns ''
 * when nothing is notable (regression-safe).
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
