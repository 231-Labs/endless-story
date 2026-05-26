/**
 * Reflection Trigger — produces per-character interior reflections.
 *
 * **Two activation paths (R4)**:
 *   - **Passive**: ImportanceDebtCrossed event → debt over threshold →
 *     auto-trigger (Smallville cadence; threshold default = 150)
 *   - **Active**: owner燒 ENDLESS「向她問一句」→ admin server action
 *     triggers a one-off reflection for that character
 *
 * Both paths produce the same artifact: a reflection blob anchored on
 * chain. The trigger distinguishes them via the `mode` field on output
 * so attribution can be shown to owners.
 *
 * **LLM rule**: this is the character ALONE, off-stage, after the
 * mask comes off. Output can (and should sometimes) contradict the
 * POV chapter the character produced for the same event — that's the
 * outer-vs-inner-face design lever.
 *
 * R0: type-shell only.
 */

export interface RunReflectionInput {
    characterId: string;
    mode: 'passive_debt' | 'active_question';
    /** For active mode: owner's question text (free-form, will be
     *  shown to the LLM as "owner has asked you ___"). */
    ownerQuestion?: string;
    model?: string;
    dryRun?: boolean;
}

export interface RunReflectionResult {
    reflection: string;
    anchored: boolean;
    commitmentId?: string;
    blobId?: string;
    /** If passive, how much debt was consumed. */
    debtConsumed?: number;
}

export async function runOnce(_input: RunReflectionInput): Promise<RunReflectionResult> {
    throw new Error('reflection-trigger.runOnce: not yet implemented (lands in R4)');
}
