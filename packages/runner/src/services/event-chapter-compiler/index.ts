/**
 * Event-Chapter Compiler — weaves all POVs of one event into the canonical
 * "回" (see docs/CONTENT_PIPELINE.md §2). Sibling of gazette-compiler.
 *
 * **Why this exists**: a single character's POV is raw material; readers pay
 * for the *event* told richly from every angle (Rashomon weave). This is the
 * commercial unit — `kind: 'event_cut'`, anchored with `subject_id = eventId`.
 *
 * **Inputs (read from chain)**:
 *   - The event skeleton (event.move BudgetEvent / director StoryletOpened) —
 *     objective canon + `eventTx` proof.
 *   - Every POV chapter sharing this event's `provenance.eventTx`
 *     (commitment subjects = the involved characters).
 *
 * **Gate**: only weave when the event has ≥2 POVs (≥2 subscribed characters);
 *   a 1-POV event stays a per-character feed item, no cut.
 *
 * **LLM**: primary/expensive (reader-facing). Weaves angles, keeps each
 *   character's voice, does NOT collapse subjective divergence into one truth —
 *   the divergence IS the drama (NARRATIVE_AGENTS §5).
 *
 * **Output**: woven markdown → Walrus → commitment::commit(subject=eventId,
 *   kind=event_cut) → emit. Cover still (peak beat) attached when available.
 *
 * R0: type-shell only (lands after the still seam; see CONTENT_PIPELINE §9).
 */

export interface CompileEventChapterInput {
    sagaId: string;
    /** Event to weave (commitment subject_id for the cut). */
    eventId: string;
    /** tx digest of the on-chain event — links every source POV. */
    eventTx?: string;
    /** Override LLM model. */
    model?: string;
    /** Dry-run: produce prose but don't anchor on chain. */
    dryRun?: boolean;
}

export interface CompileEventChapterResult {
    /** Woven chapter prose. */
    chapter: string;
    /** How many POVs were woven in. */
    povCount: number;
    /** Whether anchored on chain. */
    anchored: boolean;
    commitmentId?: string;
    blobId?: string;
    blobUrl?: string;
    contentHashHex?: string;
    digest?: string;
    /** Cover still blob id (peak-tension beat), when a still exists. */
    coverStillBlobId?: string;
    skipReason?: 'no_event' | 'insufficient_povs';
    errors?: string[];
}

export async function runOnce(_input: CompileEventChapterInput): Promise<CompileEventChapterResult> {
    throw new Error('event-chapter-compiler.runOnce: not yet implemented (see CONTENT_PIPELINE §9)');
}
