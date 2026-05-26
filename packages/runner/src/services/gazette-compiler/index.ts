/**
 * Gazette Compiler — saga-level daily 公報.
 *
 * **Cadence (R3)**: per narrative day, but only when ≥1 storylet
 * concluded that day. Empty days produce no gazette.
 *
 * **Inputs**: all chain events of the day for this saga (scene events,
 * storylet conclusions, chapters committed, subscriber deltas).
 *
 * **Process**: 80% template-driven (factual headlines, links, stats),
 * 20% LLM (短過渡語、標題微調). Events come from chain — LLM never
 * invents.
 *
 * **Why structural split solves "不知所云"**: the gazette assumes
 * readers don't know what happened (so it lists facts plainly); the
 * POV chapter assumes readers DO know (so it skips recap and goes to
 * interior). Old runner crammed both into one chapter, which forced
 * LLM to both recap and emote — incoherent.
 *
 * **Output**: markdown blob → memwal → commitment → emit
 * GazetteCompiled (R3 will add this event).
 *
 * **Visibility**: free / public — drives top-of-funnel traffic.
 *
 * R0: type-shell only.
 */

export interface CompileGazetteInput {
    sagaId: string;
    /** Narrative day boundary — e.g. 7 means "day 7 of the saga". */
    day: number;
    /** Override LLM model for the 20% smoothing pass. */
    model?: string;
    dryRun?: boolean;
}

export interface CompileGazetteResult {
    /** Final markdown body. */
    markdown: string;
    /** Counts that fed the headlines section. */
    eventCount: number;
    chapterCount: number;
    /** Whether anchored on chain. */
    anchored: boolean;
    commitmentId?: string;
    blobId?: string;
    /** Skip reasons. */
    skipReason?: 'no_events' | 'already_compiled';
}

export async function runOnce(_input: CompileGazetteInput): Promise<CompileGazetteResult> {
    throw new Error('gazette-compiler.runOnce: not yet implemented (lands in R3)');
}
