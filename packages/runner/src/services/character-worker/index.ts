/**
 * Character POV Worker — produces per-character chapters when the world
 * does something that involves them.
 *
 * **Gating** (R2): a worker only runs for character C if
 * `character.subscriber_count > 0`. No subscribers = no chapter (avoids
 * burning LLM tokens on content nobody reads, aligns with the
 * subscription-based economy).
 *
 * **Inputs**: chain event involving C (CharacterMoved, SceneEventResolved,
 * StoryletOpened), character's memory tail, scene context, active
 * storylets touching C, owner-injected dreams.
 *
 * **LLM rules**:
 *   - First-person or close-third POV; literary register
 *   - DO NOT recap public events (gazette covers that)
 *   - Surface character interiority — reactions, memories triggered,
 *     visceral details — not blow-by-blow narration
 *   - Dreams in recall queue get high-importance treatment; chapter
 *     metadata logs `influenced_by_dream` for owner attribution
 *
 * **Output**: chapter prose → memwal → `commitment::commit` →
 * ChapterCommitted event.
 *
 * R0: type-shell only.
 */

export interface RunCharacterWorkerInput {
    characterId: string;
    /** The event that triggered this run (so worker knows what to react to). */
    triggerEvent: {
        kind: string;
        sceneId?: string;
        storyletId?: string;
    };
    /** Override LLM model. */
    model?: string;
    /** Bypass subscriber gating (admin manual trigger). */
    forceRun?: boolean;
    /** Dry-run: produce prose but don't anchor on chain. */
    dryRun?: boolean;
}

export interface RunCharacterWorkerResult {
    /** Generated chapter prose. */
    chapter: string;
    /** Whether anchored on chain (false if dryRun or skipped). */
    anchored: boolean;
    /** Why the worker skipped, if applicable. */
    skipReason?: 'no_subscribers' | 'character_not_in_saga' | 'no_relevant_event';
    /** Chain commitment id if anchored. */
    commitmentId?: string;
    /** Walrus blob id. */
    blobId?: string;
    /** Dreams that influenced this chapter (commitment ids). */
    influencedByDreams?: string[];
}

export async function runOnce(_input: RunCharacterWorkerInput): Promise<RunCharacterWorkerResult> {
    throw new Error('character-worker.runOnce: not yet implemented (lands in R2)');
}
