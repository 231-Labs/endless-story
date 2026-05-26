/**
 * Dream Pipeline — owner pays ENDLESS to inject a dream into a
 * character's memory.
 *
 * **Flow (R5)**:
 *   1. Owner submits raw text + locks ENDLESS payment (configurable
 *      price via DreamConfig admin object, default 50 ENDLESS)
 *   2. Dream Moderator LLM checks (黑詞、越界、世界觀衝突) and
 *      rewrites into a coherent dream fragment that preserves intent
 *      (e.g. "I want her to remember childhood snow" →
 *      "夢中跌進祖母織了一半的圍巾，白色絨線散開來像一場無聲的雪")
 *   3. Approved dream → memwal blob + commitment::commit with
 *      importance=8 + anchor=true (won't be reflection-compressed)
 *   4. Emit DreamInjected event
 *   5. Character's next POV worker run pulls dream to top of recall
 *      queue; chapter metadata marks `influenced_by_dream: <commit_id>`
 *
 * **Failure modes**:
 *   - Moderation reject → refund 80% (keep 20% as gas + LLM cost)
 *   - LLM optimization diverges too far → owner can reject + full
 *     refund (one chance per submission)
 *
 * R0: type-shell only.
 */

export interface SubmitDreamInput {
    characterId: string;
    /** Owner address — verified against character's OwnerCap holder. */
    ownerAddress: string;
    /** Raw dream text from owner. */
    rawText: string;
    /** Amount of ENDLESS to lock (default from DreamConfig). */
    paymentAmount: bigint;
    model?: string;
}

export interface SubmitDreamResult {
    status: 'accepted' | 'moderation_reject' | 'optimization_diverged';
    /** Original input echoed back. */
    rawText: string;
    /** Moderator-rewritten dream (only set if accepted). */
    optimizedText?: string;
    /** Chain commitment id (only if accepted + anchored). */
    commitmentId?: string;
    blobId?: string;
    /** Refund info if rejected. */
    refundAmount?: bigint;
    /** Reason for reject. */
    rejectReason?: string;
}

export async function submitDream(_input: SubmitDreamInput): Promise<SubmitDreamResult> {
    throw new Error('dream-pipeline.submitDream: not yet implemented (lands in R5)');
}
