/**
 * Reflection Trigger — character internal monologue, on-chain anchored.
 *
 * Two activation paths:
 *   - **Active**: owner submits a question via web; server picks this
 *     up and runs the LLM with the question + character context. The
 *     character's reply lands as a Reflection with mode="active".
 *   - **Passive**: admin (R4) or runner cron (future) triggers a
 *     free-form reflection without a question. mode="passive".
 *
 * Both paths share the same: snapshot character → build prompt → LLM →
 * Walrus upload → reflection::submit on chain.
 *
 * Reflections live in their own Move module (not commitment.move) so
 * web event-log queries can filter cleanly by event type, without
 * needing to parse blob frontmatter.
 */

import { createHash } from 'node:crypto';
import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
    tx as endlessTx,
    type SuiClient,
} from '@endless-story/sdk';
import { blob as memwalBlob } from '@endless-story/memwal';
import { text as llmText } from '@endless-story/llm';
import { resolveNetwork } from '../../infra/network.js';
import {
    buildSystemPrompt,
    buildUserPrompt,
    type CharacterSnapshot,
} from './prompt.js';
import type { SagaSoul } from '../character-worker/saga-soul.js';

export { consolidateMemories } from './consolidate.js';
export type { ConsolidateInput, ConsolidateResult } from './consolidate.js';
export {
    buildSystemPrompt as buildConsolidateSystemPrompt,
    buildUserPrompt as buildConsolidateUserPrompt,
} from './consolidate.js';
export {
    buildSystemPrompt as buildReflectionSystemPrompt,
    buildUserPrompt as buildReflectionUserPrompt,
    type CharacterSnapshot as ReflectionCharacterSnapshot,
    type ReflectionPromptInput,
} from './prompt.js';

export interface RunReflectionInput {
    characterId: string;
    sagaId: string;
    mode: 'active' | 'passive';
    /** Active mode only — the owner's question text. Empty/undefined
     *  for passive. */
    ownerQuestion?: string;
    /** Optional: MemWal-recalled memories (caller supplies; web resolves
     *  creds + ControlCap). Deepens continuity beyond the chain-read
     *  recent chapters + previous reflection. */
    recalledMemories?: string[];
    /** Signer + storyteller cap id. Required unless dryRun. */
    signer?: { keypair: Keypair; storytellerCapId: string };
    /** Override LLM model. */
    model?: string;
    /** Dry-run: produce prose but don't anchor on chain. */
    dryRun?: boolean;
}

export interface RunReflectionResult {
    reflection: string;
    anchored: boolean;
    /** Why the worker skipped, if applicable. */
    skipReason?: 'character_unreachable';
    /** Chain reflection object id if anchored. */
    reflectionId?: string;
    /** Walrus blob id. */
    blobId?: string;
    /** Walrus aggregator URL — handy for direct read. */
    blobUrl?: string;
    /** Hex content hash. */
    contentHashHex?: string;
    /** tx digest. */
    digest?: string;
    /** Snapshot used for prompt — debug aid. */
    snapshot?: CharacterSnapshot;
}

export async function runOnce(input: RunReflectionInput): Promise<RunReflectionResult> {
    const client = makeSuiClient({ network: resolveNetwork() });
    const fetched = await fetchCharacterSnapshot(client, input.characterId, input.sagaId);
    if (!fetched) {
        return {
            reflection: '',
            anchored: false,
            skipReason: 'character_unreachable',
        };
    }
    const { snapshot, soul } = fetched;

    // Pull recent POV chapters + previous reflection for prompt context.
    const [recentChapters, prevReflection] = await Promise.all([
        fetchRecentChapterSnippets(client, input.characterId, 2),
        fetchPreviousReflectionSnippet(client, input.characterId),
    ]);

    // 'primary' tier for reflection — interior monologue quality matters.
    const llm = llmText.createTextClient({ kind: 'primary' });
    const modelId = input.model ?? llm.defaultModel;

    const system = buildSystemPrompt(soul);
    const user = buildUserPrompt({
        character: snapshot,
        mode: input.mode,
        ownerQuestion: input.ownerQuestion,
        recentChapterSnippets: recentChapters,
        previousReflection: prevReflection ?? undefined,
        recalledMemories: input.recalledMemories,
    });

    const response = await llm.chat({
        model: modelId,
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: 1500,
        temperature: 0.85,
    });
    const reflection = response.text.trim();

    if (input.dryRun || !input.signer) {
        return {
            reflection,
            anchored: false,
            snapshot,
        };
    }

    // Anchor: Walrus + reflection::submit.
    const anchor = await anchorReflectionText({
        client,
        characterId: input.characterId,
        sagaId: input.sagaId,
        text: reflection,
        mode: input.mode,
        question: input.ownerQuestion ?? '',
        importance: input.mode === 'active' ? 7 : 6,
        signer: input.signer,
    });
    if (!anchor.anchored) {
        return { reflection, anchored: false, snapshot };
    }
    return {
        reflection,
        anchored: true,
        reflectionId: anchor.reflectionId,
        blobId: anchor.blobId,
        blobUrl: anchor.blobUrl,
        contentHashHex: anchor.contentHashHex,
        digest: anchor.digest,
        snapshot,
    };
}

/* ── anchor a ready reflection (shared by runOnce + sleep) ───────────── */

export interface AnchorReflectionInput {
    characterId: string;
    sagaId: string;
    /** The reflection prose to anchor (already produced — not generated here). */
    text: string;
    mode: 'active' | 'passive';
    /** Owner question for active reflections; '' for passive/sleep. */
    question?: string;
    /** On-chain importance stamp (1-10). */
    importance: number;
    signer: { keypair: Keypair; storytellerCapId: string };
    /** Reuse an existing client; one is made if omitted. */
    client?: SuiClient;
}

export interface AnchorReflectionResult {
    anchored: boolean;
    reflectionId?: string;
    blobId?: string;
    blobUrl?: string;
    contentHashHex?: string;
    digest?: string;
}

/**
 * Upload reflection prose to Walrus and anchor it via reflection::submit.
 * Factored out of runOnce so the sleep/consolidation path (N2) can anchor
 * pre-made dense reflections without re-generating prose. Returns
 * `anchored:false` (never throws) if Walrus upload fails — the caller
 * decides whether that's fatal.
 */
export async function anchorReflectionText(
    input: AnchorReflectionInput,
): Promise<AnchorReflectionResult> {
    const text = input.text.trim();
    if (!text) return { anchored: false };
    const client = input.client ?? makeSuiClient({ network: resolveNetwork() });

    const hashBytes = sha256(new TextEncoder().encode(text));
    const contentHashHex = bytesToHex(hashBytes);

    let put;
    try {
        put = await memwalBlob.putBlob(new TextEncoder().encode(text), {
            network: 'testnet',
            epochs: 30,
            contentType: 'text/markdown',
        });
    } catch {
        return { anchored: false };
    }

    const tx = new Transaction();
    tx.add(
        endlessTx.reflection.submit({
            cap: input.signer.storytellerCapId,
            saga: input.sagaId,
            characterId: input.characterId,
            mode: input.mode,
            question: input.question ?? '',
            contentHash: Array.from(hashBytes),
            blobId: Array.from(new TextEncoder().encode(put.blobId)),
            importance: input.importance,
        }),
    );
    const res = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: input.signer.keypair,
        options: { showEffects: true, showObjectChanges: true },
    });
    return {
        anchored: true,
        reflectionId: findCreatedReflectionId(res) ?? undefined,
        blobId: put.blobId,
        blobUrl: put.url,
        contentHashHex,
        digest: res.digest,
    };
}

/* ── snapshot + memory helpers ───────────────────────────────────── */

async function fetchCharacterSnapshot(
    client: SuiClient,
    characterId: string,
    sagaId: string,
): Promise<{ snapshot: CharacterSnapshot; soul: SagaSoul } | null> {
    const [charRes, sagaRes] = await Promise.all([
        read.character.getCharacter(client, characterId).catch(() => null),
        read.saga.getSaga(client, sagaId).catch(() => null),
    ]);
    if (!charRes) return null;
    const charJson = charRes.json as unknown as {
        profile?: {
            name?: string;
            physical_facts?: {
                species?: string;
                gender?: string;
                body?: string;
                age_years?: number | string;
            };
        };
        attributes?: Array<{ key?: string; value?: number | string }>;
    };
    const sagaJson = sagaRes?.json as unknown as
        | {
              name?: string;
              description?: string;
              departure_policy?: string;
              nature_prompt?: string;
              rhythm_hints?: string;
          }
        | undefined;

    const attrMap: Record<string, number> = {};
    for (const a of charJson.attributes ?? []) {
        if (typeof a?.key === 'string' && a?.value != null) {
            attrMap[a.key] = Number(a.value);
        }
    }
    const physical = charJson.profile?.physical_facts;

    const snapshot: CharacterSnapshot = {
        id: characterId,
        name: charJson.profile?.name ?? '無名',
        // Role isn't on chain; caller may have a better source (off-chain
        // recruitment.specialty) but for reflection-trigger we don't
        // currently inject it. '—' keeps LLM honest.
        role: '—',
        gender: mapGender(physical?.gender ?? ''),
        ageYears: Number(physical?.age_years ?? 0),
        sagaName: sagaJson?.name ?? '無名戲班',
        physicalFacts:
            [physical?.species, physical?.body].filter(Boolean).join(' / ') || '—',
        attributes: {
            appearance: attrMap.appearance,
            constitution: attrMap.constitution,
            acuity: attrMap.acuity,
            disposition: attrMap.disposition,
        },
    };

    // Saga soul (F) from the saga object already fetched above — same shape
    // the POV worker derives, so reflection reads in the saga's voice too.
    const soul: SagaSoul = {
        sagaName: sagaJson?.name ?? '無名戲班',
        premise: sagaJson?.description?.trim() || undefined,
        departurePolicy: sagaJson?.departure_policy?.trim() || undefined,
        naturePrompt: sagaJson?.nature_prompt?.trim() || undefined,
        rhythmHints: sagaJson?.rhythm_hints?.trim() || undefined,
    };

    return { snapshot, soul };
}

async function fetchRecentChapterSnippets(
    client: SuiClient,
    characterId: string,
    limit: number,
): Promise<string[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    try {
        const summaries = await read.commitment.listCommitments(client, pkg, {
            subjectId: characterId,
            maxEvents: limit,
        });
        const out: string[] = [];
        for (const s of summaries) {
            const text = await fetchBlobText(client, s.commitmentId);
            if (text) out.push(text);
        }
        return out;
    } catch {
        return [];
    }
}

async function fetchPreviousReflectionSnippet(
    client: SuiClient,
    characterId: string,
): Promise<string | null> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return null;
    try {
        const events = await read.reflection.listReflectionEvents(client, pkg, {
            characterId,
            maxEvents: 1,
        });
        if (events.length === 0) return null;
        // Fetch the Reflection object to get blob_id.
        const res = await read.reflection.getReflection(client, events[0].reflectionId);
        const json = res.json as unknown as { blob_id?: number[] };
        if (!Array.isArray(json.blob_id)) return null;
        const blobId = new TextDecoder().decode(new Uint8Array(json.blob_id));
        const r = await fetch(
            `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`,
            { cache: 'no-store' },
        );
        if (!r.ok) return null;
        return (await r.text()).trim();
    } catch {
        return null;
    }
}

async function fetchBlobText(client: SuiClient, commitmentId: string): Promise<string | null> {
    try {
        const res = await read.commitment.getCommitment(client, commitmentId);
        const json = res.json as unknown as { blob_id?: number[] };
        if (!Array.isArray(json.blob_id)) return null;
        const blobId = new TextDecoder().decode(new Uint8Array(json.blob_id));
        const r = await fetch(
            `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`,
            { cache: 'no-store' },
        );
        return r.ok ? await r.text() : null;
    } catch {
        return null;
    }
}

/* ── utils ───────────────────────────────────────────────────── */

function mapGender(raw: string): string {
    if (raw === '男' || raw.toLowerCase() === 'male') return '男';
    if (raw === '女' || raw.toLowerCase() === 'female') return '女';
    return '中性';
}

function sha256(bytes: Uint8Array): Uint8Array {
    const h = createHash('sha256');
    h.update(bytes);
    return new Uint8Array(h.digest());
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

interface ObjectChangeLike {
    type?: string;
    objectType?: string;
    objectId?: string;
}

function findCreatedReflectionId(res: { objectChanges?: unknown[] | null }): string | null {
    const changes = (res.objectChanges ?? []) as ObjectChangeLike[];
    for (const c of changes) {
        if (
            c.type === 'created' &&
            typeof c.objectType === 'string' &&
            c.objectType.endsWith('::reflection::Reflection')
        ) {
            return c.objectId ?? null;
        }
    }
    return null;
}
