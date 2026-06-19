/**
 * Director scarcity (flag-gated) — let the LLM director ADD a contested resource.
 *
 * EVENT_LIFECYCLE Phase 3. When the cast's tensions call for it, the storyteller
 * may instantiate ONE new scarce slot mid-story ("this arc should make them
 * fight over X"). The on-chain ledger stays the source of truth:
 *
 *   1. read the saga's live resource labels (dedupe + the bound)
 *   2. ask the cheap LLM whether a NEW slot would deepen unmet contention
 *   3. validate the proposal against the SAME rails as bootstrap (pure,
 *      `resource-proposal.ts`) — the LLM never bypasses conservation
 *   4. `instantiate` it cap-signed; the DEMAND layer (`defaultDesiresForCast`)
 *      auto-derives desires for it next tick, and the spine settles it like any
 *      built-in (templateId `contention:<kind>` keyed on the label prefix)
 *
 * Bounded so the world can't be flooded: the director is consulted only once
 * every `COOLDOWN_CALLS` invocations per saga, and never past
 * `MAX_DIRECTOR_RESOURCES` live director-created slots. Failure-isolated; ANY
 * problem returns a skip, never throws. Default off (`directorResources` input).
 *
 * Server-only module (LLM + chain); NOT a 'use server' action — invoked from the
 * tick loop, same as event-spine.ts.
 */

import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx, type SuiClient } from '@endless-story/sdk';
import { createTextClient } from '@endless-story/llm/text';
import { readResourceLedger } from '@/lib/chain/drama';
import {
    validateResourceProposal,
    countActiveDirectorResources,
    isResolvedDirectorResource,
    type RawProposal,
    type ValidProposal,
} from '@/lib/chain/resource-proposal';

/* ── per-process cadence guards (same lifetime model as the spine registries) ─ */
const callCountBySaga = new Map<string, number>();
/** Consult the director on calls 1, 1+N, 1+2N… — bounds LLM spend + creation rate. */
const COOLDOWN_CALLS = 6;
/** Hard ceiling on live director-created slots (built-ins don't count). */
const MAX_DIRECTOR_RESOURCES = 3;

export interface ProposeResourceInput {
    sagaId: string;
    capId: string;
    /** active cast (names + roles) — context for the director + cast-size bound. */
    cast: { name: string; role?: string }[];
    /** current top tensions (statement + 0..1) — what's already aching. */
    tensions: { statement: string; tension: number }[];
    signer: Keypair;
    client: SuiClient;
    /** Decide + validate but don't instantiate (preview). */
    dryRun?: boolean;
}

export interface ProposeResourceResult {
    ok: boolean;
    /** the validated proposal, when one was created (or previewed under dryRun). */
    created?: ValidProposal;
    /** new on-chain DramaResource id, when instantiated. */
    resourceId?: string;
    /** why nothing was created (cooldown / cap / declined / invalid). */
    reason?: string;
    error?: string;
}

/** Pull the first balanced `{…}` object out of an LLM reply and JSON-parse it. */
function extractJson(text: string): RawProposal & { propose?: unknown } {
    const start = text.indexOf('{');
    if (start < 0) return {};
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) {
            try {
                return JSON.parse(text.slice(start, i + 1));
            } catch {
                return {};
            }
        }
    }
    return {};
}

export async function proposeResourceAction(
    input: ProposeResourceInput,
): Promise<ProposeResourceResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.packageId || !d.sagaId) return { ok: false, reason: 'unconfigured' };

    // Cadence: only consult on calls 1, 1+N, 1+2N… per saga.
    const n = (callCountBySaga.get(input.sagaId) ?? 0) + 1;
    callCountBySaga.set(input.sagaId, n);
    if (n % COOLDOWN_CALLS !== 1) return { ok: false, reason: 'cooldown' };

    // RESOLVED director stakes auto-retire: exclude them from BOTH the dedup rails
    // (so a kind can be re-used once its old contest settled — else `feud` is locked
    // forever after one feud resolves) AND the cap (so the slot frees up).
    let existingLabels: string[];
    let activeDirectorCount: number;
    try {
        const live = await readResourceLedger(input.client, d.packageId, input.sagaId);
        const active = live.filter((r) => !isResolvedDirectorResource(r));
        existingLabels = active.map((r) => r.label).filter(Boolean);
        activeDirectorCount = countActiveDirectorResources(active);
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (activeDirectorCount >= MAX_DIRECTOR_RESOURCES)
        return { ok: false, reason: 'director-resource cap reached' };

    // Ask the director whether a NEW slot is warranted.
    const castSize = input.cast.length;
    let raw: RawProposal & { propose?: unknown };
    try {
        const client = createTextClient({ kind: 'cheap' });
        const castLines = input.cast
            .slice(0, 8)
            .map((c) => `- ${c.name}${c.role ? `（${c.role}）` : ''}`)
            .join('\n');
        const tensionLines = input.tensions
            .slice(0, 6)
            .map((t) => `- ${t.statement}（張力 ${t.tension.toFixed(2)}）`)
            .join('\n');
        const res = await client.chat({
            system:
                '你是民國戲曲世界的自治導演。你可以為這條故事弧「立題」——新增一個眾人爭奪的稀缺標的，' +
                '讓既有張力有新的出口。只有當現有衝突已嫌單薄、且一個新標的能讓矛盾更深時才立題；否則按下不表。\n' +
                '回傳純 JSON，不要多餘文字：\n' +
                '{"propose": true|false, "kind": "ascii小寫slug(如 feud/patron/venue)", ' +
                '"display": "中文標的名(≤12字)", "capacity": 1, "reason": "一句理由"}\n' +
                'kind 必須是英文小寫slug，且不可是 spotlight/recording/partnership。capacity 通常為 1（越稀缺越有戲）。',
            messages: [
                {
                    role: 'user',
                    content:
                        `在場角色：\n${castLines || '（無）'}\n\n` +
                        `當前張力：\n${tensionLines || '（尚無明顯張力）'}\n\n` +
                        '該為這條弧立一個新爭奪標的嗎？',
                },
            ],
            maxTokens: 160,
            temperature: 0.7,
        });
        raw = extractJson(res.text);
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (raw.propose !== true) return { ok: false, reason: 'director declined' };

    const check = validateResourceProposal(raw, existingLabels, castSize);
    if (!check.ok) return { ok: false, reason: `rejected: ${check.reason}` };
    const proposal = check.proposal;

    if (input.dryRun) return { ok: true, created: proposal };
    return instantiateProposal(proposal, {
        sagaId: input.sagaId,
        capId: input.capId,
        signer: input.signer,
        client: input.client,
    });
}

/** Cap-signed on-chain instantiate of a validated proposal. Shared by the
 *  auto-cadence path (proposeResourceAction) and the deliberate director-tool
 *  path (registerResourceDirect). The contract re-checks capacity > 0 on chain. */
async function instantiateProposal(
    proposal: ValidProposal,
    ctx: { sagaId: string; capId: string; signer: Keypair; client: SuiClient },
): Promise<ProposeResourceResult> {
    try {
        const txb = new Transaction();
        txb.add(
            endlessTx.resource.instantiate({
                cap: ctx.capId,
                saga: ctx.sagaId,
                archetype: proposal.archetype,
                label: proposal.label,
                capacity: BigInt(proposal.capacity),
            }),
        );
        const res = await ctx.client.signAndExecuteTransaction({
            transaction: txb,
            signer: ctx.signer,
            options: { showEffects: true, showObjectChanges: true },
        });
        if (res.effects?.status?.status !== 'success')
            return { ok: false, created: proposal, error: res.effects?.status?.error ?? 'instantiate failed' };
        await ctx.client.waitForTransaction({ digest: res.digest }).catch(() => {});
        const created = res.objectChanges?.find(
            (c) => c.type === 'created' && 'objectType' in c && c.objectType.includes('::resource::DramaResource'),
        );
        const resourceId = created && 'objectId' in created ? created.objectId : undefined;
        return { ok: true, created: proposal, resourceId };
    } catch (err) {
        return { ok: false, created: proposal, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * DELIBERATE director-authored resource. The Showrunner agent (heartbeat / admin
 * chat) decides kind+display+capacity itself, so this SKIPS the auto path's
 * cooldown + cheap-LLM-decide and just enforces the same rails (director cap +
 * validation) and instantiates. Same conservation guarantees. Wrapped by the
 * 'use server' registerResourceAction → the register_resource director tool.
 */
export async function registerResourceDirect(input: {
    sagaId: string;
    capId: string;
    signer: Keypair;
    client: SuiClient;
    kind: string;
    display: string;
    capacity?: number;
    /** number of characters who could contend (clamps capacity to stay scarce). */
    castSize: number;
    dryRun?: boolean;
}): Promise<ProposeResourceResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.packageId) return { ok: false, reason: 'unconfigured' };

    let existingLabels: string[];
    let activeDirectorCount: number;
    try {
        const live = await readResourceLedger(input.client, d.packageId, input.sagaId);
        // Exclude RESOLVED director stakes from dedup + cap (see proposeResourceAction).
        const active = live.filter((r) => !isResolvedDirectorResource(r));
        existingLabels = active.map((r) => r.label).filter(Boolean);
        activeDirectorCount = countActiveDirectorResources(active);
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (activeDirectorCount >= MAX_DIRECTOR_RESOURCES)
        return {
            ok: false,
            reason: `已有 ${MAX_DIRECTOR_RESOURCES} 個未結的導演標的，先讓一個落定（結算後會自動退場騰位）再開新的`,
        };

    const check = validateResourceProposal(
        { kind: input.kind, display: input.display, capacity: input.capacity ?? 1 },
        existingLabels,
        input.castSize,
    );
    if (!check.ok) return { ok: false, reason: `rejected: ${check.reason}` };

    if (input.dryRun) return { ok: true, created: check.proposal };
    return instantiateProposal(check.proposal, {
        sagaId: input.sagaId,
        capId: input.capId,
        signer: input.signer,
        client: input.client,
    });
}
