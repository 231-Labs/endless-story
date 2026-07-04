/**
 * §4d.2 arc lifecycle — per-saga convergence state machine: open (derived question) →
 * accumulate forcing → judge each beat → retire + spawn the aftermath arc. Pure pieces
 * live in arc-pressure.ts, LLM pieces in arc-convergence.ts; only per-saga state is here.
 */

import { type ArcState, newArc, accumulate, forcingLevel } from './arc-pressure';
import { deriveArc, judgeArcAnswered, spawnArcAftermath, type ArcAftermath } from './arc-convergence';

const activeArcBySaga = new Map<string, ArcState>();
/** Aftermath question carried forward to seed the NEXT arc. */
const pendingQuestionBySaga = new Map<string, string>();

/** Reset (harness isolation). */
export function clearArcs(): void {
    activeArcBySaga.clear();
    pendingQuestionBySaga.clear();
}

export function currentArc(sagaId: string): ArcState | undefined {
    const a = activeArcBySaga.get(sagaId);
    return a && !a.answered ? a : undefined;
}

/**
 * Open an arc if none is live; a pending aftermath question seeds the derivation.
 * Returns the live arc, or null when derivation failed (caller proceeds without one).
 */
export async function openArcIfNeeded(
    sagaId: string,
    framingLabel: string,
    castNames: readonly string[],
    nameToId: (name: string) => string | undefined,
): Promise<ArcState | null> {
    const live = currentArc(sagaId);
    if (live) return live;
    const pending = pendingQuestionBySaga.get(sagaId);
    const derived = await deriveArc(pending ? `${pending}（由上一條線牽出）` : framingLabel, castNames);
    if (!derived) return null;
    const centralId = nameToId(derived.centralCharName);
    if (!centralId) return null;
    pendingQuestionBySaga.delete(sagaId);
    const arc = newArc(`${sagaId}:${Date.now()}`, derived.question, centralId);
    activeArcBySaga.set(sagaId, arc);
    return arc;
}

export interface ArcStepResult {
    question: string;
    pressure: number;
    forcing: number;
    /** Set only when the arc resolved this tick. */
    retired?: { answer: string; aftermath: ArcAftermath | null };
}

/**
 * Advance the arc after this tick's beats. `pressingCount` = real contesting events on
 * the central character (caller-computed, never a tick index); `centralBeat` = what they
 * did this tick. Once forcing ≥ 2, judges the beat; on an irreversible answer retires
 * the arc + spawns the aftermath. Null if no live arc.
 */
export async function stepArc(
    sagaId: string,
    pressingCount: number,
    centralBeat: string,
): Promise<ArcStepResult | null> {
    let arc = currentArc(sagaId);
    if (!arc) return null;
    arc = accumulate(arc, pressingCount);
    activeArcBySaga.set(sagaId, arc);
    const forcing = forcingLevel(arc);
    const base: ArcStepResult = { question: arc.question, pressure: arc.pressure, forcing };

    // Judge only when genuinely forcing and there's a beat — a quiet tick never resolves
    // and must not burn an LLM call.
    if (forcing >= 2 && centralBeat.trim()) {
        const verdict = await judgeArcAnswered(arc.question, centralBeat);
        if (verdict.answered) {
            const aftermath = await spawnArcAftermath(arc.question, verdict.answer, centralBeat);
            activeArcBySaga.set(sagaId, { ...arc, answered: true, answer: verdict.answer });
            if (aftermath?.question) pendingQuestionBySaga.set(sagaId, aftermath.question);
            return { ...base, retired: { answer: verdict.answer, aftermath } };
        }
    }
    return base;
}
