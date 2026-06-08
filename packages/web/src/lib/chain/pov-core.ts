/**
 * Shared per-character POV generation core.
 *
 * Server-only (imports runner + admin keypair). NOT a 'use server'
 * module — it's a plain helper that server actions (run-pov-worker,
 * daily-batch) call. Never import from a client component.
 *
 * Encapsulates the bits both the single-character admin trigger and the
 * daily batch need: role resolution (voucher → off-chain specialty),
 * the runner character-worker call, and result mapping. Phase 3 will
 * also thread MemWal recall snippets through here.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import {
    characterWorker as runnerCharacterWorker,
    signAndAnchor,
    signAndAnchorBatch,
} from '@endless-story/runner';
import { inferRoleFromText } from '@endless-story/shared';
import type { ChapterProvenance } from '@endless-story/shared';
import { embedProvenance } from '@/lib/chain/chapter-provenance';
import type { AdminContext } from '@/lib/chain/admin-signer';
import { fetchRecruitmentIdForCharacter } from '@/lib/chain/voucher-read';
import { getStoreRecruitment } from '@/lib/actions/recruitments-store';
import {
    recallForCharacter,
    rememberForCharacter,
    recallCurrentPlanText,
} from '@/lib/chain/memory';
import { fetchRelationshipHints } from '@/lib/chain/relationships';
import { resolveNetwork } from '@/lib/chain/network';

export interface PovCoreOptions {
    triggerNarrative: string;
    forceRun?: boolean;
    dryRun?: boolean;
    /** Phase 3: MemWal recall snippets to weave into the prompt. */
    recentMemorySnippets?: string[];
    /** DR-6: drama-engine tension hint (dominant unmet desire over a scarce
     *  on-chain resource). Derived once per tick by the loop's DRAMA phase. */
    dramaHint?: string;
    /** Public saga roster context: name / role / scene. */
    rosterContext?: string[];
    /** Precomputed relationship hints from the tick memory context. */
    relationshipHints?: string[];
    /** Precomputed current plan from the tick memory context. */
    planHint?: string | null;
    /** Objective same-scene beats this tick (other characters' visible acts) —
     *  shared across same-scene POVs so they complement, not contradict. */
    sceneBeats?: string[];
    /** Use only caller-provided memory snippets; avoids duplicate decrypts in tick loop. */
    skipMemoryRecall?: boolean;
}

export interface PovCoreResult {
    ok: boolean;
    chapter: string;
    anchored: boolean;
    skipReason?: string;
    commitmentId?: string;
    blobId?: string;
    blobUrl?: string;
    digest?: string;
    dreamFragmentUsed?: string;
    error?: string;
    /** How many memory snippets were threaded into the prompt (0 when
     *  memory not configured or no snippets matched). */
    recalledCount?: number;
    /** Whether the new chapter was written back to MemWal. */
    remembered?: boolean;
}

/**
 * Resolve a character's role from voucher hint → off-chain
 * Recruitment.specialty. Chain Character has no role field; this is what
 * makes the LLM address a role like "wealthy merchant" instead of a placeholder.
 */
export async function resolveRole(characterId: string): Promise<string | undefined> {
    try {
        const client = makeSuiClient({ network: resolveNetwork() });
        const character = await read.character.getCharacter(client, characterId).catch(() => null);
        const characterJson = character?.json as
            | { tags?: Array<{ label?: string }>; profile?: { description?: string } }
            | undefined;
        const taggedRole = roleFromCharacterJson(characterJson?.tags);
        if (taggedRole) return taggedRole;

        const recruitmentId = await fetchRecruitmentIdForCharacter(characterId);
        const recruitment = recruitmentId ? await getStoreRecruitment(recruitmentId) : null;
        return recruitment?.specialty ?? inferRoleFromText(characterJson?.profile?.description);
    } catch {
        return undefined;
    }
}

function roleFromCharacterJson(tags: Array<{ label?: string }> | undefined): string | undefined {
    const roleTag = tags?.find((t) => typeof t.label === 'string' && t.label.startsWith('role:'));
    return roleTag?.label?.slice('role:'.length) || undefined;
}

/**
 * Anchor a PRE-GENERATED POV chapter on chain (Walrus + commitment::commit)
 * and write it back to MemWal. Pairs with `runPovForCharacter(dryRun:true)`
 * to enable generate-parallel / anchor-serial in batch loops: generate every
 * chapter concurrently (no signing), then anchor them one at a time (single
 * StorytellerCap). Mirrors reflection's `anchorReflectionText` (N2c).
 */
export async function anchorPovChapter(
    admin: AdminContext,
    characterId: string,
    sagaId: string,
    chapter: string,
): Promise<{
    anchored: boolean;
    commitmentId?: string;
    blobId?: string;
    blobUrl?: string;
    digest?: string;
    remembered?: boolean;
    error?: string;
}> {
    const text = chapter.trim();
    if (!text) return { anchored: false, error: 'empty_chapter' };
    try {
        const anchor = await signAndAnchor({
            sagaId,
            subjectId: characterId,
            content: new TextEncoder().encode(text),
            contentType: 'text/markdown',
            signer: admin.signer,
        });
        // Write the new chapter into the character's memory (best-effort).
        const remembered = await rememberForCharacter(characterId, text, {
            kind: 'chapter',
        }).catch(() => false);
        return {
            anchored: true,
            commitmentId: anchor.commitmentId,
            blobId: anchor.blobId,
            blobUrl: anchor.blobUrl,
            digest: anchor.digest,
            remembered,
        };
    } catch (err) {
        return { anchored: false, error: err instanceof Error ? err.message : String(err) };
    }
}

export interface BatchAnchorPovResult {
    characterId: string;
    anchored: boolean;
    commitmentId?: string;
    blobId?: string;
    digest?: string;
    remembered?: boolean;
    error?: string;
}

/**
 * Anchor MANY pre-generated chapters in ONE PTB (one signature, one gas
 * coin, one round-trip) instead of N serial transactions. Uploads every
 * blob to Walrus in parallel, commits them all in a single
 * `commitment::commit` ×N programmable transaction, then writes each
 * chapter back to MemWal. This is the proper fix for the anchor-serial
 * bottleneck — the whole PRODUCE phase now costs one tx.
 *
 * All-or-nothing: if the PTB aborts, every item is reported anchored:false
 * with the same error (callers can fall back to per-item anchoring).
 */
export async function anchorPovChaptersBatch(
    admin: AdminContext,
    sagaId: string,
    items: { characterId: string; chapter: string; provenance?: ChapterProvenance }[],
): Promise<BatchAnchorPovResult[]> {
    const valid = items.filter((i) => i.chapter.trim());
    if (valid.length === 0) return [];

    let anchors;
    try {
        anchors = await signAndAnchorBatch(
            valid.map((i) => ({
                sagaId,
                subjectId: i.characterId,
                // Embed provenance INTO the anchored blob so the chapter↔event link
                // is itself immutable + chain-verifiable. MemWal keeps clean prose.
                content: new TextEncoder().encode(
                    i.provenance
                        ? embedProvenance(i.chapter.trim(), i.provenance)
                        : i.chapter.trim(),
                ),
                contentType: 'text/markdown',
            })),
            { signer: admin.signer },
        );
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return valid.map((i) => ({ characterId: i.characterId, anchored: false, error }));
    }

    // Write each chapter back to MemWal (off-chain, parallel).
    const remembered = await Promise.all(
        valid.map((i) =>
            rememberForCharacter(i.characterId, i.chapter.trim(), { kind: 'chapter' }).catch(
                () => false,
            ),
        ),
    );

    return valid.map((i, idx) => ({
        characterId: i.characterId,
        anchored: true,
        commitmentId: anchors[idx]?.commitmentId || undefined,
        blobId: anchors[idx]?.blobId,
        digest: anchors[idx]?.digest,
        remembered: remembered[idx],
    }));
}

/**
 * Generate (and optionally anchor) one character's POV chapter.
 * `admin` is the loaded keypair context; caller loads it once and reuses
 * across a batch.
 */
export async function runPovForCharacter(
    admin: AdminContext,
    characterId: string,
    opts: PovCoreOptions,
): Promise<PovCoreResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, chapter: '', anchored: false, error: 'saga 尚未種子化' };
    }

    const role = await resolveRole(characterId);

    // Recall long-term memory (MemWal) for prompt context. The trigger
    // narrative doubles as the semantic query. No-op ([]) when memory
    // isn't configured. Merge with any caller-supplied snippets. Director-
    // seeded relationships (N3) colour how she narrates others in the scene.
    const [recalled, relationshipHints, planHint] = await Promise.all([
        opts.skipMemoryRecall
            ? Promise.resolve([] as string[])
            : recallForCharacter(characterId, opts.triggerNarrative, 6),
        opts.relationshipHints
            ? Promise.resolve(opts.relationshipHints)
            : fetchRelationshipHints(characterId, 6).catch(() => [] as string[]),
        typeof opts.planHint !== 'undefined'
            ? Promise.resolve(opts.planHint)
            : recallCurrentPlanText(characterId).catch(() => null),
    ]);
    const recentMemorySnippets = [
        ...(opts.recentMemorySnippets ?? []),
        ...recalled,
    ];

    try {
        const res = await runnerCharacterWorker.runOnce({
            characterId,
            sagaId: d.sagaId,
            triggerNarrative: opts.triggerNarrative,
            role,
            recentMemorySnippets:
                recentMemorySnippets.length > 0 ? recentMemorySnippets : undefined,
            relationshipHints:
                relationshipHints.length > 0 ? relationshipHints : undefined,
            rosterContext: opts.rosterContext,
            planHint: planHint ?? undefined,
            dramaHint: opts.dramaHint,
            sceneBeats: opts.sceneBeats,
            forceRun: opts.forceRun ?? true,
            dryRun: opts.dryRun,
            signer: opts.dryRun
                ? undefined
                : { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
        });

        // Write the new chapter back into the character's memory — but
        // only once it's actually anchored on chain (don't pollute memory
        // on dry-runs or failed anchors).
        let remembered = false;
        if (res.anchored && res.chapter.trim()) {
            remembered = await rememberForCharacter(characterId, res.chapter, {
                kind: 'chapter',
            });
        }

        return {
            ok: res.anchored || (opts.dryRun === true && res.chapter.length > 0),
            chapter: res.chapter,
            anchored: res.anchored,
            skipReason: res.skipReason,
            commitmentId: res.commitmentId,
            blobId: res.blobId,
            blobUrl: res.blobUrl,
            digest: res.digest,
            dreamFragmentUsed: res.dreamFragmentUsed,
            recalledCount: recentMemorySnippets.length,
            remembered,
        };
    } catch (err) {
        return {
            ok: false,
            chapter: '',
            anchored: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
