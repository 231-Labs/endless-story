/**
 * Character POV Worker — produces per-character chapters.
 *
 * R2 scope:
 *   - Read character + scene state from chain
 *   - Build POV prompt with character snapshot + a runner-supplied
 *     "what just happened" line (no memory tail / dream pulls yet —
 *     R3 + R5 add those)
 *   - Call LLM → chapter prose
 *   - Sign-and-anchor: Walrus upload + commitment::commit
 *   - Subscriber gate: skip unless `subscriber_count > 0` OR `forceRun`
 *
 * Triggered by:
 *   - Admin button on dossier (manual, demo trigger)
 *   - Eventually: chain event subscriber that fires this on
 *     StoryletOpened / CharacterCalled / SceneEventResolved
 */

import type { Keypair } from '@mysten/sui/cryptography';
import {
    makeSuiClient,
    read,
    type SuiClient,
} from '@endless-story/sdk';
import { text as llmText } from '@endless-story/llm';
import { resolveNetwork } from '../../infra/network.js';
import { signAndAnchor } from '../../infra/sign-and-anchor.js';
import { buildSystemPrompt, buildUserPrompt, type CharacterSnapshot } from './prompt.js';

export interface RunCharacterWorkerInput {
    /** Character to write POV for. */
    characterId: string;
    /** Saga the character is in (used for commitment + signer cap). */
    sagaId: string;
    /** Runner-supplied "what just happened" line — typically from a chain
     *  event (e.g. "saga director 在後台化妝間開了 storylet ..."). */
    triggerNarrative: string;
    /** Signer + the StorytellerCap id it controls. Required unless dryRun. */
    signer?: { keypair: Keypair; storytellerCapId: string };
    /** Optional: recent memory snippets to include in prompt (R3+). */
    recentMemorySnippets?: string[];
    /** Optional: owner-injected dream fragment to weave in (R5). */
    dreamFragment?: string;
    /**
     * Optional: role / specialty override (e.g. "富商" from off-chain
     * Recruitment.specialty). Chain `Character` has no role field, so
     * caller is expected to look this up and pass in. If omitted,
     * snapshot defaults to '—' so the LLM doesn't get misled by a
     * fake role like the previous hardcoded '武小生'.
     */
    role?: string;
    /** Override LLM model. */
    model?: string;
    /** Bypass subscriber gate (admin manual trigger). */
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
    skipReason?: 'no_subscribers' | 'character_unreachable';
    /** Chain commitment id if anchored. */
    commitmentId?: string;
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
    /** Errors that didn't abort. */
    errors?: string[];
}

export async function runOnce(input: RunCharacterWorkerInput): Promise<RunCharacterWorkerResult> {
    const client = makeSuiClient({ network: resolveNetwork() });
    const snapshot = await fetchCharacterSnapshot(
        client,
        input.characterId,
        input.sagaId,
        input.role,
    );
    if (!snapshot) {
        return {
            chapter: '',
            anchored: false,
            skipReason: 'character_unreachable',
            errors: [`character ${input.characterId} not readable from chain`],
        };
    }

    // Subscriber gate: skip if 0 and not forced.
    const subCount = snapshot.subscriberCount ?? 0;
    if (!input.forceRun && subCount === 0) {
        return {
            chapter: '',
            anchored: false,
            skipReason: 'no_subscribers',
            snapshot: stripInternal(snapshot),
        };
    }

    const llm = llmText.createTextClient({ kind: 'primary' });
    const modelId = input.model ?? llm.defaultModel;

    const system = buildSystemPrompt();
    const user = buildUserPrompt({
        character: stripInternal(snapshot),
        triggerNarrative: input.triggerNarrative,
        recentMemorySnippets: input.recentMemorySnippets ?? [],
        dreamFragment: input.dreamFragment,
    });

    const response = await llm.chat({
        model: modelId,
        system,
        messages: [{ role: 'user', content: user }],
        // POV is literary — let it breathe. User said variable length OK,
        // cap at 3000 to leave headroom even for long emotional pieces.
        maxTokens: 3000,
        temperature: 0.85,
    });

    const chapter = response.text.trim();

    if (input.dryRun || !input.signer) {
        return {
            chapter,
            anchored: false,
            snapshot: stripInternal(snapshot),
        };
    }

    // Anchor: Walrus + commitment::commit.
    const anchor = await signAndAnchor({
        sagaId: input.sagaId,
        subjectId: input.characterId,
        content: new TextEncoder().encode(chapter),
        contentType: 'text/markdown',
        signer: input.signer.keypair,
    });

    return {
        chapter,
        anchored: true,
        commitmentId: anchor.commitmentId,
        blobId: anchor.blobId,
        blobUrl: anchor.blobUrl,
        contentHashHex: anchor.contentHashHex,
        digest: anchor.digest,
        snapshot: stripInternal(snapshot),
    };
}

/* ── snapshot ────────────────────────────────────────────────────── */

/** Internal snapshot — includes subscriber_count for gating. */
interface CharacterSnapshotInternal extends CharacterSnapshot {
    subscriberCount: number;
}

function stripInternal(s: CharacterSnapshotInternal): CharacterSnapshot {
    const { subscriberCount: _sc, ...rest } = s;
    return rest;
}

async function fetchCharacterSnapshot(
    client: SuiClient,
    characterId: string,
    sagaId: string,
    roleOverride?: string,
): Promise<CharacterSnapshotInternal | null> {
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
        state?: { current_scene_id?: string | null };
        subscriber_count?: number | string;
    };
    const sagaJson = sagaRes?.json as unknown as { name?: string } | undefined;

    // Resolve scene name (optional — null if character not in any scene).
    const sceneIdRaw = unwrapOption(charJson.state?.current_scene_id);
    const sceneName = sceneIdRaw
        ? await read.scene
              .getScene(client, sceneIdRaw)
              .then((r) => (r.json as { info?: { name?: string } })?.info?.name)
              .catch(() => undefined)
        : undefined;

    const attrMap: Record<string, number> = {};
    for (const a of charJson.attributes ?? []) {
        if (typeof a?.key === 'string' && a?.value != null) {
            attrMap[a.key] = Number(a.value);
        }
    }
    const physical = charJson.profile?.physical_facts;

    return {
        id: characterId,
        name: charJson.profile?.name ?? '無名',
        // Role is not on chain — caller supplies via roleOverride
        // (typically resolved from off-chain Recruitment.specialty
        // via voucher hint). Without override, render as '—' so the
        // LLM doesn't get misled into impersonating a wrong role.
        role: roleOverride ?? '—',
        gender: mapGender(physical?.gender ?? ''),
        ageYears: Number(physical?.age_years ?? 0),
        sagaName: sagaJson?.name ?? '無名戲班',
        sceneName,
        physicalFacts:
            [physical?.species, physical?.body].filter(Boolean).join(' / ') || '—',
        attributes: {
            appearance: attrMap.appearance,
            constitution: attrMap.constitution,
            acuity: attrMap.acuity,
            disposition: attrMap.disposition,
        },
        subscriberCount: charJson.subscriber_count != null ? Number(charJson.subscriber_count) : 0,
    };
}

function unwrapOption(raw: unknown): string | null {
    if (raw == null) return null;
    if (typeof raw === 'string') return raw;
    if (typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if ('Some' in obj && typeof obj.Some === 'string') return obj.Some;
    if ('vec' in obj && Array.isArray(obj.vec)) {
        return typeof obj.vec[0] === 'string' ? obj.vec[0] : null;
    }
    return null;
}

function mapGender(raw: string): string {
    if (raw === '男' || raw.toLowerCase() === 'male') return '男';
    if (raw === '女' || raw.toLowerCase() === 'female') return '女';
    return '中性';
}
