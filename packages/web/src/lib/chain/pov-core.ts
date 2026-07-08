/**
 * Shared per-character POV generation core. Server-only (imports runner + admin
 * keypair); a plain helper called by server actions — never import from a client
 * component.
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
import { withAdminLock, type AdminContext } from '@/lib/chain/admin-signer';
import { fetchRecruitmentIdForCharacter } from '@/lib/chain/voucher-read';
import { getStoreRecruitment } from '@/lib/actions/recruitments-store';
import {
    recallForCharacter,
    rememberForCharacter,
    recallCurrentPlanText,
} from '@/lib/chain/memory';
import { fetchRelationshipHints } from '@/lib/chain/relationships';
import { resolveNetwork } from '@/lib/chain/network';
import { getSagaSoulOverride } from '@/lib/chain/saga-soul-override';
import { loadNarrativeProfile } from '@/lib/chain/narrative-profile';

/**
 * Semantic query for the "thickness" recall — non-work life memories so chapters read
 * like a lived person. Names no character or saga, so it stays portable across rosters.
 */
export const LIFE_QUERY = '童年 家世 父母 故鄉 初戀 舊情 癖好 心事 牽掛 秘密 此生最重的事';

export interface PovCoreOptions {
    triggerNarrative: string;
    forceRun?: boolean;
    dryRun?: boolean;
    /** `pov` (default) serial chapter; `genesis` 入世序章; `encounter` quiet two-person 關係戲. */
    mode?: runnerCharacterWorker.ChapterMode;
    /** MemWal recall snippets to weave into the prompt. */
    recentMemorySnippets?: string[];
    /** Drama-engine tension hint, derived once per tick. */
    dramaHint?: string;
    /** The character's hottest want (§2.36) — passed through to the POV prompt. */
    want?: { desc: string; target?: string };
    /** Story-bible arc line for 承上. */
    arcLine?: string;
    /** Public saga roster context: name / role / scene. */
    rosterContext?: string[];
    /** Saga peers with gender, for the pronoun/kinship self-check. */
    rosterPeople?: Array<{ name: string; gender: string; role?: string }>;
    /** Precomputed by the tick memory context. */
    relationshipHints?: string[];
    /** Precomputed by the tick memory context. */
    planHint?: string | null;
    /** Objective same-scene beats, shared across same-scene POVs so they complement,
     *  not contradict. */
    sceneBeats?: string[];
    /** Use only caller-provided snippets; avoids duplicate decrypts in the tick loop. */
    skipMemoryRecall?: boolean;
    /** This character's contested event resolved this tick — narrate the settling. */
    closing?: boolean;
    /** Opt-in: append the private 燈下 interior coda (default off, §2.3). */
    reflect?: boolean;
    /** Daily-life state (§2.19) tinting texture; omit ⇒ no injection. */
    state?: runnerCharacterWorker.CharacterState;
    /** This character's own private inner-life secret (character-secrets.ts);
     *  never another character's. Omit ⇒ no injection. */
    innerSecret?: string;
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
    /** Memory snippets threaded into the prompt. */
    recalledCount?: number;
    /** Chapter written back to MemWal. */
    remembered?: boolean;
}

/**
 * Resolve a character's role (tag → recruitment specialty → description inference);
 * the chain Character has no role field.
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
 * Anchor a pre-generated chapter on chain and write it back to MemWal. Pairs with
 * `runPovForCharacter(dryRun:true)` for generate-parallel / anchor-serial batches
 * (single StorytellerCap).
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
        const anchor = await withAdminLock(() =>
            signAndAnchor({
                sagaId,
                subjectId: characterId,
                content: new TextEncoder().encode(text),
                contentType: 'text/markdown',
                signer: admin.signer,
            }),
        );
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
 * Anchor many chapters in ONE PTB (one signature, one gas coin, one round-trip).
 * All-or-nothing: if the PTB aborts, every item reports anchored:false with the same
 * error (callers can fall back to per-item anchoring).
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
        anchors = await withAdminLock(() =>
            signAndAnchorBatch(
                valid.map((i) => ({
                    sagaId,
                    subjectId: i.characterId,
                    // Provenance goes INTO the anchored blob so the chapter↔event link is
                    // chain-verifiable; MemWal keeps clean prose.
                    content: new TextEncoder().encode(
                        i.provenance
                            ? embedProvenance(i.chapter.trim(), i.provenance)
                            : i.chapter.trim(),
                    ),
                    contentType: 'text/markdown',
                })),
                { signer: admin.signer },
            ),
        );
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return valid.map((i) => ({ characterId: i.characterId, anchored: false, error }));
    }

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

/** Generate (and optionally anchor) one character's POV chapter. */
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

    // The trigger narrative doubles as the semantic recall query; a second LIFE_QUERY
    // recall adds personal thickness (genesis gets a bigger dose). No-op when memory
    // isn't configured.
    const lifeLimit = opts.mode === 'genesis' ? 6 : 3;
    const [recalled, lifeRecalled, relationshipHints, planHint] = await Promise.all([
        opts.skipMemoryRecall
            ? Promise.resolve([] as string[])
            : recallForCharacter(characterId, opts.triggerNarrative, 6),
        opts.skipMemoryRecall
            ? Promise.resolve([] as string[])
            : recallForCharacter(characterId, LIFE_QUERY, lifeLimit).catch(() => [] as string[]),
        opts.relationshipHints
            ? Promise.resolve(opts.relationshipHints)
            : fetchRelationshipHints(characterId, 6).catch(() => [] as string[]),
        typeof opts.planHint !== 'undefined'
            ? Promise.resolve(opts.planHint)
            : recallCurrentPlanText(characterId).catch(() => null),
    ]);
    // Dedup, preserving order: caller snippets → event recall → life recall.
    const recentMemorySnippets = [
        ...new Set([
            ...(opts.recentMemorySnippets ?? []),
            ...recalled,
            ...lifeRecalled,
        ]),
    ];

    try {
        const res = await runnerCharacterWorker.runOnce({
            characterId,
            sagaId: d.sagaId,
            // Observatory soul override wins over the story preset's narrative profile.
            sagaSoul: getSagaSoulOverride() ?? (await loadNarrativeProfile()).soul,
            triggerNarrative: opts.triggerNarrative,
            role,
            mode: opts.mode,
            recentMemorySnippets:
                recentMemorySnippets.length > 0 ? recentMemorySnippets : undefined,
            relationshipHints:
                relationshipHints.length > 0 ? relationshipHints : undefined,
            rosterContext: opts.rosterContext,
            rosterPeople: opts.rosterPeople,
            planHint: planHint ?? undefined,
            dramaHint: opts.dramaHint,
        want: opts.want,
        arcLine: opts.arcLine,
            sceneBeats: opts.sceneBeats,
            closing: opts.closing,
            reflect: opts.reflect,
            state: opts.state,
            innerSecret: opts.innerSecret,
            forceRun: opts.forceRun ?? true,
            dryRun: opts.dryRun,
            signer: opts.dryRun
                ? undefined
                : { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
        });

        // Write back to memory only once anchored — don't pollute on dry-runs or
        // failed anchors.
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
