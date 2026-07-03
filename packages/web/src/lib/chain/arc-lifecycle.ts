/**
 * §4d.2 arc lifecycle — the orchestrator that runs the convergence state machine per saga:
 *   open (emergent central question) → feel the accumulated forcing → judge each beat →
 *   on an irreversible answer, retire + spawn the aftermath arc.
 *
 * Keeps the tick-loop wiring tiny (a few calls) and the pieces testable in isolation:
 *   - pressure ACCUMULATOR + forcing        → arc-pressure.ts (pure, unit-tested)
 *   - central-question derive / judge / aftermath → arc-convergence.ts (LLM, adversarial judge)
 * The only per-saga STATE lives here (off-chain map, persists across ticks — same pattern as the
 * tick-loop's recentTopicsBySaga). Nothing is authored: the question is derived, the forcing is
 * accumulated from real pressing, the judge is domain-blind, the aftermath is context-fed.
 */

import { type ArcState, newArc, accumulate, forcingLevel } from './arc-pressure';
import { deriveArc, judgeArcAnswered, spawnArcAftermath, type ArcAftermath } from './arc-convergence';

const activeArcBySaga = new Map<string, ArcState>();
/** Aftermath question carried forward → seeds the NEXT arc's central question (world keeps living). */
const pendingQuestionBySaga = new Map<string, string>();

/** Reset (harness isolation). */
export function clearArcs(): void {
    activeArcBySaga.clear();
    pendingQuestionBySaga.clear();
}

/** The live (unanswered) arc for a saga, if any. */
export function currentArc(sagaId: string): ArcState | undefined {
    const a = activeArcBySaga.get(sagaId);
    return a && !a.answered ? a : undefined;
}

/**
 * Open an arc for this saga if none is live. The central question + character are DERIVED from the
 * staged contention framing + cast (emergent). If an aftermath question is pending from a retired
 * arc, that seeds the derivation (continuity). Returns the live arc (new or existing), or null if
 * derivation failed (caller just proceeds without an arc this tick).
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
 * Advance the arc after this tick's beats. `pressingCount` = the number of REAL contesting
 * events that bore on the central character this tick (co-present pressers / acts / high-tension
 * edges) — computed by the caller, NEVER a tick index. `centralBeat` = what the central character
 * actually did this tick (their POV/action). Accumulates pressure, and once the world is genuinely
 * forcing (level ≥ 2) judges whether the beat irreversibly answered the question; on an answer,
 * retires the arc + spawns the aftermath (whose question seeds the next arc). Returns null if no
 * live arc.
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

    // Only spend an LLM judge call once the world is genuinely forcing AND there's a beat to judge —
    // a quiet/low-pressure tick can never resolve (and must not burn a call).
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
