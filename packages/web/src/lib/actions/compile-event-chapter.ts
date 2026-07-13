'use server';

/**
 * Server action — invoke the runner event-chapter compiler with the admin
 * keypair. Weaves every POV of one on-chain event into the canonical "回"
 * (event_cut) and anchors it (subject = sceneId). See docs/CONTENT_PIPELINE §2.
 *
 * Two call shapes:
 *   - tick loop: pass `povs` directly (freshly-anchored prose — no index-lag
 *     re-fetch).
 *   - standalone / admin: pass `castCharacterIds` + `eventTx` and let the
 *     compiler fetch each matching POV from chain.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { eventChapter as runnerEventChapter, storyteller } from '@endless-story/runner';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { loadBible, saveBible } from '@/lib/chain/story-bible-store';
import { takeSceneTruth } from '@/lib/chain/scene-truth';

type EventCutPov = runnerEventChapter.EventCutPov;

export interface CompileEventChapterActionInput {
    sceneId: string;
    sagaName?: string;
    sceneName?: string;
    eventTx?: string;
    eventLabel?: string;
    day?: number;
    /** POVs to weave (tick-loop path). */
    povs?: EventCutPov[];
    /** Cast to fetch POVs for (standalone path). */
    castCharacterIds?: string[];
    /** Saga peers with gender, for the self-check's pronoun rules on the woven cut. */
    rosterPeople?: Array<{ name: string; gender: string; role?: string }>;
    dryRun?: boolean;
    /** Existing oil-painting scene cover or generated event still. */
    hero?: string;
    heroAlt?: string;
    dossierCharacters?: Record<string, { role?: string; portrait?: string; lead?: string }>;
}

export interface CompileEventChapterActionResult {
    ok: boolean;
    chapter: string;
    povCount: number;
    anchored: boolean;
    skipReason?: string;
    commitmentId?: string;
    blobId?: string;
    digest?: string;
    /** Product route for an anchored dossier chapter. */
    dossierHref?: string;
    error?: string;
}

export async function compileEventChapterAction(
    input: CompileEventChapterActionInput,
): Promise<CompileEventChapterActionResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, chapter: '', povCount: 0, anchored: false, error: 'saga 尚未種子化' };
    }
    if (!input.sceneId) {
        return { ok: false, chapter: '', povCount: 0, anchored: false, error: 'sceneId 缺失' };
    }

    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            chapter: '',
            povCount: 0,
            anchored: false,
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    // 承先 — load the saga's running novel state and hand the cast-relevant slice
    // to the compiler so this 回 continues the story (承先啟後) instead of being an
    // isolated recap. Best-effort: any failure just falls back to a standalone weave.
    const castIds = (input.povs?.map((p) => p.characterId) ?? input.castCharacterIds ?? []).filter(
        Boolean,
    );
    let bible: storyteller.StoryBible | null = null;
    let continuity: storyteller.ContinuityContext | undefined;
    try {
        bible = loadBible(d.sagaId);
        continuity = storyteller.selectContinuityContext(bible, castIds);
    } catch {
        /* no bible → standalone weave, no continuity */
    }

    // Enacted truth from the scene's want-loop beats: the weave's spine becomes
    // what actually PLAYED (observations) and why (intents), with POVs as the
    // perspective flesh — instead of a merge of N re-imaginations.
    const truth = takeSceneTruth(d.sagaId, input.sceneId);
    const observations = truth.map((t) => `${t.name}：${t.text}`);
    const intents = truth
        .filter((t): t is typeof t & { inner: string } => Boolean(t.inner?.trim()))
        .map((t) => ({ name: t.name, line: t.inner }));
    const truthEventId = input.eventTx ?? `${d.sagaId}:d${input.day ?? 0}:${input.sceneId}`;
    const dossierEvent = truth.length > 0
        ? {
              id: truthEventId,
              canonHead: input.eventTx ?? truthEventId,
              eventTx: input.eventTx,
              saga: input.sagaName ?? '',
              day: input.day ?? truth[0]?.day ?? 0,
              scene: input.sceneName ?? '戲班',
              title: input.eventLabel ?? `${input.sceneName ?? '戲班'}的一樁事`,
              kicker: '客觀逐拍只有一份；在場的人，各自帶走了不同的一份真相。',
              summary: truth.map((t) => `${t.name}：${t.text}`).join(' '),
              hero: input.hero,
              heroAlt: input.heroAlt,
              beats: truth.map((t) => ({
                  characterId: t.characterId ?? input.povs?.find((p) => p.characterName === t.name)?.characterId ?? t.name,
                  name: t.name,
                  text: t.text,
              })),
          }
        : undefined;

    try {
        const res = await runnerEventChapter.runOnce({
            sagaId: d.sagaId,
            sceneId: input.sceneId,
            sceneName: input.sceneName,
            eventTx: input.eventTx,
            eventLabel: input.eventLabel,
            day: input.day,
            povs: input.povs,
            castCharacterIds: input.castCharacterIds,
            rosterPeople: input.rosterPeople,
            observations: observations.length > 0 ? observations : undefined,
            intents: intents.length > 0 ? intents : undefined,
            continuity,
            prevChapterSummary: bible?.lastChapterSummary,
            dryRun: input.dryRun,
            signer: input.dryRun
                ? undefined
                : { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
            dossierEvent,
            dossierPerspectives: input.povs?.map((p) => ({
                characterId: p.characterId,
                characterName: p.characterName,
                role: input.dossierCharacters?.[p.characterId]?.role ?? p.role,
                portrait: input.dossierCharacters?.[p.characterId]?.portrait,
                lead: input.dossierCharacters?.[p.characterId]?.lead,
                body: p.body,
            })),
        });

        // 啟後 — fold the woven 回 back into the bible so the NEXT chapter picks it
        // up. Live path only (a dryRun preview must not advance the novel). Fully
        // defensive: a fold failure just means the bible doesn't advance this 回.
        if (!input.dryRun && res.anchored && res.chapter && bible) {
            try {
                const nameToId = new Map(
                    (input.povs ?? []).map((p) => [p.characterName, p.characterId]),
                );
                const update = await storyteller.deriveChapterUpdate({
                    chapter: res.chapter,
                    day: input.day ?? bible.throughDay + 1,
                    bible,
                    nameToId,
                });
                saveBible(storyteller.applyChapter(bible, update));
            } catch {
                /* fold failed → bible just doesn't advance this 回 */
            }
        }

        return {
            ok: res.anchored || (input.dryRun === true && res.chapter.length > 0),
            chapter: res.chapter,
            povCount: res.povCount,
            anchored: res.anchored,
            skipReason: res.skipReason,
            commitmentId: res.commitmentId,
            blobId: res.blobId,
            digest: res.digest,
            dossierHref: res.dossier && res.commitmentId ? `/feed/event/${res.commitmentId}` : undefined,
        };
    } catch (err) {
        return {
            ok: false,
            chapter: '',
            povCount: 0,
            anchored: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
