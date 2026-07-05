/**
 * Event-Chapter Compiler — weaves all POVs of one event into the canonical
 * "回" (see docs/narrative/CONTENT_PIPELINE.md §2). Sibling of gazette-compiler.
 *
 * **Why this exists**: a single character's POV is raw material; readers pay
 * for the *event* told richly from every angle (Rashomon weave). This is the
 * commercial unit — `kind: 'event_cut'`.
 *
 * **Anchor**: `commitment::commit(subject_id = sceneId)`. The cut is anchored
 * against the SCENE (a real on-chain object id) — a namespace distinct from POV
 * (subject=character) and gazette (subject=saga). The event it narrates is
 * carried in the embedded `es:cut` header's `eventTx` (the verifiable proof);
 * a reader finds "the cut for event X" by matching that header.
 *
 * **Inputs**: callers may pass the POVs directly (the tick loop already has the
 * freshly-anchored prose — avoids an index-lag re-fetch), or pass only the cast
 * + eventTx and let the compiler fetch each character's matching POV from chain.
 *
 * **Gate**: only weave when the event has ≥2 distinct POVs.
 */

import type { Keypair } from '@mysten/sui/cryptography';
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
    type SuiClient,
} from '@endless-story/sdk';
import { blob as memwalBlob } from '@endless-story/memwal';
import { text as llmText } from '@endless-story/llm';
import { toTraditional } from '@endless-story/shared';
import { auditProse, correctionNote } from '../narrative-audit/index.js';
import { resolveNetwork } from '../../infra/network.js';
import { signAndAnchor } from '../../infra/sign-and-anchor.js';
import {
    buildSystemPrompt,
    buildUserPrompt,
    countDistinctVoices,
    embedCutHeader,
    MIN_POVS_FOR_CUT,
    type EventCutPov,
    type EventCutContext,
    type EventCutHeader,
} from './prompt.js';
import type { SagaSoul } from '../character-worker/saga-soul.js';

export {
    buildSystemPrompt as buildEventCutSystemPrompt,
    buildUserPrompt as buildEventCutUserPrompt,
    shouldWeave,
    countDistinctVoices,
    embedCutHeader,
    parseCutHeader,
    MIN_POVS_FOR_CUT,
    type EventCutPov,
    type EventCutContext,
    type EventCutHeader,
} from './prompt.js';

export interface CompileEventChapterInput {
    sagaId: string;
    /** Scene the event happened in — the commitment subject for the cut. */
    sceneId: string;
    sceneName?: string;
    /** tx digest of the on-chain event — the verifiable link across the cut + every source POV. */
    eventTx?: string;
    /** Human-readable incident framing (storylet label). */
    eventLabel?: string;
    /** 1-indexed narrative day. */
    day?: number;
    /**
     * POVs to weave. When omitted, the compiler fetches each cast member's
     * matching POV from chain (by `eventTx`); pass `castCharacterIds` then.
     */
    povs?: EventCutPov[];
    /** Cast to fetch POVs for, when `povs` is omitted. */
    castCharacterIds?: string[];
    /**
     * Min distinct voices to weave. Defaults to MIN_POVS_FOR_CUT (2) for the
     * legacy single-event cut. The storyteller-chapter path passes 1 for an
     * 'overview' (綜觀版): when an arc has accumulated other material
     * (observations/intents) a single anchored POV is enough to write from, so
     * a never-resolving event still yields a chapter.
     */
    minVoices?: number;
    /** Storyteller mode — shapes the closing instruction ('overview' = 綜觀版). */
    mode?: 'progressed' | 'overview';
    /** Daily observations the cast made (enrichment material). */
    observations?: string[];
    /** Inner lines behind card plays (what a character thought/said acting). */
    intents?: Array<{ name: string; line: string }>;
    /** Recalled past memories (deepen motivation/continuity). */
    recalled?: Array<{ name: string; text: string }>;
    /** Previous chapter summary — the "已說過，勿重述" guard. */
    prevChapterSummary?: string;
    /** Story-bible continuity (承先啟後) — see story-bible.ContinuityContext. */
    continuity?: EventCutContext['continuity'];
    /** Saga peers WITH gender, for the self-check's pronoun/kinship rules (the woven cut is
     *  where female-他 errors surface). Omitted ⇒ only token-leak runs. No names hardcoded. */
    rosterPeople?: Array<{ name: string; gender: string; role?: string }>;
    /** Per-saga tonal DNA; derived from chain when omitted. */
    sagaSoul?: SagaSoul;
    /** Signer (StorytellerCap holder) for the chain anchor step. */
    signer?: { keypair: Keypair; storytellerCapId: string };
    /** Override LLM model. */
    model?: string;
    /** Dry-run: produce prose but don't anchor on chain. */
    dryRun?: boolean;
}

export interface CompileEventChapterResult {
    /** Woven chapter prose (without the embedded header). */
    chapter: string;
    /** How many distinct POVs were woven in. */
    povCount: number;
    anchored: boolean;
    commitmentId?: string;
    blobId?: string;
    blobUrl?: string;
    contentHashHex?: string;
    digest?: string;
    /** Source POV blob ids woven in (when fetched / supplied). */
    sourcePovBlobIds?: string[];
    skipReason?: 'no_scene' | 'insufficient_povs';
    /** Debug: the context handed to the LLM. */
    context?: EventCutContext;
    errors?: string[];
}

export async function runOnce(input: CompileEventChapterInput): Promise<CompileEventChapterResult> {
    if (!input.sceneId) {
        return { chapter: '', povCount: 0, anchored: false, skipReason: 'no_scene' };
    }
    const client = makeSuiClient({ network: resolveNetwork() });
    const errors: string[] = [];

    // Per-stage timing so a slow/hung cut job can be pinpointed. Each stage prints
    // on ENTER, so a stage that hangs on an un-timed walrus/LLM call shows up as the
    // LAST line before the outer 180s kill; the running `t=` diffs elapsed seconds
    // between stages. Grep `[ch-timing]`.
    const ctag = (input.eventTx ?? input.sceneId).slice(0, 10);
    const ct0 = Date.now();
    const cmark = (m: string) =>
        console.log(`[ch-timing] cut=${ctag} t=${((Date.now() - ct0) / 1000).toFixed(1)}s ${m}`);

    // Saga name + soul (chain-derived unless caller overrides).
    cmark('saga read');
    const sagaRes = await read.saga.getSaga(client, input.sagaId).catch(() => null);
    const sagaJson = sagaRes?.json as unknown as
        | { name?: string; description?: string; departure_policy?: string; nature_prompt?: string; rhythm_hints?: string }
        | undefined;
    const sagaName = sagaJson?.name ?? '無名戲班';
    const soul: SagaSoul = input.sagaSoul ?? {
        sagaName,
        premise: sagaJson?.description?.trim() || undefined,
        departurePolicy: sagaJson?.departure_policy?.trim() || undefined,
        naturePrompt: sagaJson?.nature_prompt?.trim() || undefined,
        rhythmHints: sagaJson?.rhythm_hints?.trim() || undefined,
    };

    // Gather POVs: caller-supplied wins; otherwise fetch each cast member's
    // POV whose embedded provenance matches this event.
    let povs = (input.povs ?? []).filter((p) => p.body.trim());
    const sourcePovBlobIds: string[] = [];
    if (povs.length === 0 && (input.castCharacterIds?.length ?? 0) > 0 && input.eventTx) {
        cmark(`fetchPovs start — chain path, ${input.castCharacterIds!.length} cast, 1 walrus blob each, NO timeout`);
        const fetched = await fetchEventPovs(client, input.castCharacterIds!, input.eventTx).catch(
            (err) => {
                errors.push(`fetchEventPovs: ${err instanceof Error ? err.message : String(err)}`);
                return [] as Array<EventCutPov & { blobId?: string }>;
            },
        );
        for (const f of fetched) {
            povs.push({ characterId: f.characterId, characterName: f.characterName, role: f.role, body: f.body });
            if (f.blobId) sourcePovBlobIds.push(f.blobId);
        }
    }

    cmark(`povs gathered (${povs.length})`);
    // Gate: legacy cut needs ≥2 voices; an 'overview' (minVoices 1) weaves from a
    // single anchored POV when other material (observations/intents) is present.
    const minVoices = input.minVoices ?? MIN_POVS_FOR_CUT;
    const hasEnrichment =
        (input.observations?.length ?? 0) > 0 || (input.intents?.length ?? 0) > 0;
    const voices = countDistinctVoices(povs);
    const weavable = voices >= minVoices || (minVoices <= 1 && (voices >= 1 || hasEnrichment));
    if (!weavable) {
        return {
            chapter: '',
            povCount: voices,
            anchored: false,
            skipReason: 'insufficient_povs',
            errors: errors.length ? errors : undefined,
        };
    }

    const context: EventCutContext = {
        sagaName,
        soul,
        day: input.day,
        sceneName: input.sceneName,
        eventLabel: input.eventLabel,
        povs,
        mode: input.mode,
        observations: input.observations,
        intents: input.intents,
        recalled: input.recalled,
        prevSummary: input.prevChapterSummary,
        continuity: input.continuity,
    };

    const llm = llmText.createTextClient({ kind: 'primary' });
    const modelId = input.model ?? llm.defaultModel;
    cmark('llm weave start — primary model, NO timeout');
    const response = await llm.chat({
        model: modelId,
        system: buildSystemPrompt(soul),
        messages: [{ role: 'user', content: buildUserPrompt(context) }],
        maxTokens: 2200,
        temperature: 0.7,
    });
    cmark('llm weave done');
    const userPrompt = buildUserPrompt(context);
    let chapter = toTraditional(response.text.trim());
    const povCount = countDistinctVoices(povs);

    // Deterministic self-check (see narrative-audit). An ensemble cut has no single
    // subject, so use a permissive subject (empty role ⇒ the craft layer — beard/play
    // — stays quiet) and let only the mechanism-token + female-他 pronoun rules fire.
    // POVs carry no gender (see EventCutPov), and we won't fabricate one, so the roster
    // is empty ⇒ effectively only the token-leak check runs.
    const subject = { name: '__cut__', role: '', gender: '' };
    const roster = input.rosterPeople ?? [];
    let violations = auditProse(chapter, subject, roster);
    // Regen on ANY violation — pure LLM rewrite (no signer/chain). Sits before the dry-run
    // early-return so both preview and anchor get the corrected, normalised text.
    if (violations.length) {
        errors.push(`audit: ${violations.length} 處硬傷，重織一次：${violations.join('；')}`);
        const retry = await llm.chat({
            model: modelId,
            system: buildSystemPrompt(soul),
            messages: [{ role: 'user', content: `${userPrompt}\n${correctionNote(violations)}` }],
            maxTokens: 2200,
            temperature: 0.7,
        });
        const rewritten = toTraditional(retry.text.trim());
        const reViolations = auditProse(rewritten, subject, roster);
        if (reViolations.length <= violations.length) {
            chapter = rewritten;
            violations = reViolations;
        }
        if (violations.length) errors.push(`audit: 重織後仍餘 ${violations.length} 處：${violations.join('；')}`);
    }

    if (input.dryRun || !input.signer) {
        return {
            chapter,
            povCount,
            anchored: false,
            sourcePovBlobIds: sourcePovBlobIds.length ? sourcePovBlobIds : undefined,
            context,
            errors: errors.length ? errors : undefined,
        };
    }

    // Embed the verifiable cut header INTO the anchored blob, then anchor with
    // subject = sceneId.
    const header: EventCutHeader = {
        v: 1,
        kind: 'event_cut',
        eventTx: input.eventTx,
        eventLabel: input.eventLabel,
        sceneId: input.sceneId,
        sceneName: input.sceneName,
        day: input.day,
        povCharacterIds: [...new Set(povs.map((p) => p.characterId))],
        sourcePovBlobIds: sourcePovBlobIds.length ? sourcePovBlobIds : undefined,
    };
    cmark('anchor start — walrus put (NO timeout) + commit tx');
    const anchor = await signAndAnchor({
        sagaId: input.sagaId,
        subjectId: input.sceneId,
        content: new TextEncoder().encode(embedCutHeader(chapter, header)),
        contentType: 'text/markdown',
        signer: input.signer.keypair,
    });

    cmark('anchor done');
    return {
        chapter,
        povCount,
        anchored: true,
        commitmentId: anchor.commitmentId,
        blobId: anchor.blobId,
        blobUrl: anchor.blobUrl,
        contentHashHex: anchor.contentHashHex,
        digest: anchor.digest,
        sourcePovBlobIds: sourcePovBlobIds.length ? sourcePovBlobIds : undefined,
        context,
        errors: errors.length ? errors : undefined,
    };
}

/* ── chain fetch path ────────────────────────────────────────────────────
 * For each cast member, scan their recent POV commitments, pull the blob, and
 * keep the one whose embedded `es:prov` header matches this event's tx. Used by
 * the standalone / admin path; the tick loop passes POVs directly instead. */

const PROV_RE = /^<!--es:prov\s+(\{[\s\S]*?\})\s*-->\s*/;

function stripProvenance(content: string): { eventTx?: string; body: string } {
    const m = content.match(PROV_RE);
    if (!m) return { body: content };
    try {
        const prov = JSON.parse(m[1]) as { eventTx?: string };
        return { eventTx: prov.eventTx, body: content.slice(m[0].length) };
    } catch {
        return { body: content };
    }
}

async function fetchEventPovs(
    client: SuiClient,
    castCharacterIds: string[],
    eventTx: string,
): Promise<Array<EventCutPov & { blobId?: string }>> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const network = resolveNetwork();
    // Walrus only runs testnet/mainnet; map the Sui network onto it.
    const walrusNet = network === 'mainnet' ? 'mainnet' : 'testnet';
    const out: Array<EventCutPov & { blobId?: string }> = [];

    for (const characterId of castCharacterIds) {
        try {
            const [charRes, commits] = await Promise.all([
                read.character.getCharacter(client, characterId).catch(() => null),
                read.commitment.listCommitments(client, pkg, { subjectId: characterId, maxEvents: 5 }),
            ]);
            const name =
                (charRes?.json as { profile?: { name?: string } } | undefined)?.profile?.name ??
                '某人';
            for (const c of commits) {
                const res = await read.commitment.getCommitment(client, c.commitmentId).catch(() => null);
                const json = res?.json as { blob_id?: number[] | string } | undefined;
                const blobId = decodeByteString(json?.blob_id);
                if (!blobId) continue;
                const url = memwalBlob.getBlobUrl(blobId, walrusNet);
                const r = await fetch(url, { cache: 'no-store' }).catch(() => null);
                if (!r || !r.ok) continue;
                const raw = (await r.text()).trim();
                const { eventTx: provTx, body } = stripProvenance(raw);
                if (provTx === eventTx && body.trim()) {
                    out.push({ characterId, characterName: name, body: body.trim(), blobId });
                    break; // latest matching POV per character is enough
                }
            }
        } catch {
            // skip this character; best-effort
        }
    }
    return out;
}

function decodeByteString(v: number[] | string | undefined): string {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
        try {
            return new TextDecoder().decode(new Uint8Array(v));
        } catch {
            return '';
        }
    }
    return '';
}

export { composeEpisode, type ComposeEpisodeInput } from './episode.js';
