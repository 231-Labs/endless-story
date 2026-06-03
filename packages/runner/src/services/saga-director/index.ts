/**
 * Saga Director — turns admin intent into typed chain capabilities.
 *
 * Flow:
 *   1. Read saga snapshot (saga + scenes + characters) from chain
 *   2. Build LLM prompt with capability catalog + snapshot
 *   3. Call LLM → JSON response with capability calls
 *   4. Parse + validate against catalog schema
 *   5. (unless dryRun) build PTB dispatching all capabilities → sign
 *   6. Return capabilities + digest + rationale
 *
 * Caller responsibility: provide the admin/storyteller keypair (this
 * service is signer-agnostic so it can be invoked from web server
 * actions OR a standalone runner process).
 */

import type { Keypair } from '@mysten/sui/cryptography';
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
    type SuiClient,
} from '@endless-story/sdk';
import { text as llmText } from '@endless-story/llm';
import { resolveNetwork } from '../../infra/network.js';
import type { DirectorCapability } from '../../types/capabilities.js';
import { buildSystemPrompt, buildUserPrompt, type SagaSnapshot } from './prompt.js';
import { parseDirectorResponse } from './parse.js';
import { buildDispatchTransaction } from './dispatch.js';

export {
    buildSystemPrompt as buildDirectorSystemPrompt,
    buildUserPrompt as buildDirectorUserPrompt,
    type SagaSnapshot,
} from './prompt.js';

export interface RunDirectorInput {
    sagaId: string;
    /** Free-form admin intent, e.g. "想看感情戲". */
    intent: string;
    /** Storyteller signer + the StorytellerCap id it controls. Required
     *  unless dryRun. */
    signer?: { keypair: Keypair; storytellerCapId: string };
    /** Override LLM model. */
    model?: string;
    /** Dry-run: produce capabilities but do NOT sign/dispatch. */
    dryRun?: boolean;
}

export interface RunDirectorResult {
    capabilities: DirectorCapability[];
    rationale: string;
    dispatched: boolean;
    digest?: string;
    errors?: string[];
    /** Snapshot used to build the prompt — handy for debugging. */
    snapshot: SagaSnapshot;
    /** Raw LLM text (for surfacing in admin UI / debug). */
    llmResponseRaw: string;
}

export async function runOnce(input: RunDirectorInput): Promise<RunDirectorResult> {
    const client = makeSuiClient({ network: resolveNetwork() });
    const snapshot = await fetchSagaSnapshot(client, input.sagaId);

    // 'primary' = creative writing tier; director benefits from the
    // smarter model since capability picking quality matters more than
    // throughput.
    const llm = llmText.createTextClient({ kind: 'primary' });
    const modelId = input.model ?? llm.defaultModel;

    const system = buildSystemPrompt();
    const user = buildUserPrompt(snapshot, input.intent);

    const response = await llm.chat({
        model: modelId,
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: 1500,
        temperature: 0.4,
    });

    const parsed = parseDirectorResponse(response.text);

    if (parsed.capabilities.length === 0) {
        return {
            capabilities: [],
            rationale: parsed.rationale,
            dispatched: false,
            errors: ['LLM produced no valid capabilities', ...parsed.rawErrors],
            snapshot,
            llmResponseRaw: response.text,
        };
    }

    if (input.dryRun || !input.signer) {
        return {
            capabilities: parsed.capabilities,
            rationale: parsed.rationale,
            dispatched: false,
            errors: parsed.rawErrors.length > 0 ? parsed.rawErrors : undefined,
            snapshot,
            llmResponseRaw: response.text,
        };
    }

    const tx = buildDispatchTransaction(parsed.capabilities, {
        sagaId: input.sagaId,
        storytellerCapId: input.signer.storytellerCapId,
    });
    const res = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: input.signer.keypair,
        options: { showEffects: true },
    });
    const status = res.effects?.status?.status;
    if (status !== 'success') {
        return {
            capabilities: parsed.capabilities,
            rationale: parsed.rationale,
            dispatched: false,
            errors: [`tx failed: ${res.effects?.status?.error ?? 'unknown'}`, ...parsed.rawErrors],
            digest: res.digest,
            snapshot,
            llmResponseRaw: response.text,
        };
    }

    return {
        capabilities: parsed.capabilities,
        rationale: parsed.rationale,
        dispatched: true,
        digest: res.digest,
        errors: parsed.rawErrors.length > 0 ? parsed.rawErrors : undefined,
        snapshot,
        llmResponseRaw: response.text,
    };
}

/* ── snapshot reader ─────────────────────────────────────────────── */

async function fetchSagaSnapshot(client: SuiClient, sagaId: string): Promise<SagaSnapshot> {
    const sagaRes = await read.saga.getSaga(client, sagaId);
    const sagaJson = sagaRes.json as unknown as {
        name?: string;
        departure_policy?: string;
        anchor_scene_ids?: string[];
    };

    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    const sceneIds = sagaJson.anchor_scene_ids ?? [];
    const [scenesRes, charactersRes] = await Promise.all([
        sceneIds.length > 0
            ? read.scene.getManyScenes(client, sceneIds)
            : Promise.resolve([] as unknown[]),
        pkg
            ? read.character.listMintedCharacters(client, pkg, { sagaId })
            : Promise.resolve({ summaries: [] as { name: string; characterId: string }[] }),
    ]);
    type SceneEntry = { json?: { info?: { name?: string } }; objectId?: string };
    const scenes = (scenesRes as SceneEntry[]).map((s) => {
        const obj = s.objectId;
        const name = s.json?.info?.name ?? '';
        return obj ? { id: obj, name } : null;
    }).filter((x): x is { id: string; name: string } => x !== null);
    const characters = (charactersRes as { summaries: { characterId: string; name: string }[] })
        .summaries
        .map((c) => ({ id: c.characterId, name: c.name }));

    return {
        sagaId,
        sagaName: sagaJson.name ?? '無名戲班',
        departurePolicy: sagaJson.departure_policy,
        scenes,
        characters,
    };
}
