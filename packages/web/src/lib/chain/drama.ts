/**
 * Drama engine — chain I/O + per-beat commit (the orchestration layer).
 *
 * Server-only. Glues the pure DEMAND core (`drama-core`) to the on-chain SUPPLY
 * ledger (`resource.move`, read via the SDK) and the verifiable-commit pattern
 * (`signAndAnchor`). One call per tick:
 *
 *   1. read the saga's live DramaResources + their allocations off chain
 *   2. build the engine world (carry prior satisfaction; seed from baseline)
 *   3. relax satisfaction one step → derive tension  (pure, `deriveBeat`)
 *   4. commit the self-verifying beat blob to Walrus + chain  (signAndAnchor)
 *   5. hand back per-character tension hints for decide/POV prompts
 *
 * **Graceful no-op** (mirrors memory.ts): if the package predates resource.move
 * or the saga has no contested resources yet, `readResourceLedger` returns [] and
 * the whole thing skips — the narrative loop is unaffected. The drama layer only
 * lights up once resources are instantiated on a redeployed package.
 *
 * **Continuity**: prior satisfaction is carried in a process-level cache (the
 * demo runs the world-loop against one server process). On cold start, desires
 * re-seed from baseline and re-converge within a few beats. The committed blob
 * is self-contained (input world + tuning + output) so an external verifier can
 * reproduce each beat regardless of the cache — the cache is a convenience, not
 * a trust anchor.
 */
import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
    tx as endlessTx,
    type SuiClient,
} from '@endless-story/sdk';
import { signAndAnchor } from '@endless-story/runner';
import { resolveNetwork } from './network.js';
import { withAdminLock } from './admin-signer.js';
import {
    buildBeat,
    buildWorld,
    defaultDesiresForCast,
    deriveBeat,
    dramaHintForAgent,
    encodeBeat,
    extractSatisfaction,
    satKey,
    tensionFraction,
    type AgentSpec,
    type DramaTensionRow,
    type ResourceSnapshot,
} from './drama-core.js';
import { isResolvedDirectorResource } from './resource-proposal.js';
import { readResourceIntents } from './resource-intents.js';

/* ── process-level satisfaction carry-over (see header) ───────────────── */
const lastSatBySaga = new Map<string, Map<string, bigint>>();
const lastBeatCommitmentBySaga = new Map<string, string>();

/** True once a package that includes resource.move is deployed. We can't know
 *  statically, so callers rely on `readResourceLedger` returning [] instead. */
export function dramaConfigured(): boolean {
    return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}

/* ── read the on-chain supply ledger ──────────────────────────────────── */

/** Decoded `DramaResource` struct JSON (the shape `getManyResources` returns under `.json`). */
interface DramaResourceJson {
    id: string;
    saga_id: string;
    archetype: string;
    label: string;
    capacity: string;
    allocations: { id: string; size: string };
    total_allocated: string;
    created_at_ms: string;
}

/**
 * Read every live DramaResource for a saga + its per-holder allocations.
 * Returns [] (graceful) when the package has no resource module, the saga has
 * no resources, or any query fails — the caller treats [] as "drama dormant".
 */
export async function readResourceLedger(
    client: SuiClient,
    packageId: string,
    sagaId: string,
): Promise<ResourceSnapshot[]> {
    let live: { resourceId: string }[];
    try {
        const [instantiated, retired] = await Promise.all([
            read.resource.listResourceInstantiations(client, packageId, { sagaId }),
            read.resource.listResourceRetirements(client, packageId, { sagaId }),
        ]);
        const dead = new Set(retired.map((r) => r.resourceId));
        live = instantiated.filter((r) => !dead.has(r.resourceId));
    } catch {
        return []; // package predates resource.move, or RPC hiccup → drama dormant
    }
    if (live.length === 0) return [];

    const objects = await read.resource
        .getManyResources(
            client,
            live.map((r) => r.resourceId),
        )
        .catch(() => [] as Awaited<ReturnType<typeof read.resource.getManyResources>>);

    const snapshots: ResourceSnapshot[] = [];
    for (const obj of objects) {
        // Decoded struct fields live under `.json` (see character-read.ts);
        // `allocations` is a Table handle { id, size }.
        const json = (obj as { json?: DramaResourceJson } | null | undefined)?.json;
        if (!json) continue;
        const tableId = json.allocations?.id;
        const allocations = tableId ? await readAllocations(client, tableId) : {};
        snapshots.push({
            id: String(json.id),
            archetype: String(json.archetype ?? ''),
            label: String(json.label ?? ''),
            capacity: BigInt(json.capacity ?? 0),
            allocations,
        });
    }
    return snapshots;
}

/**
 * Enumerate a `Table<ID, u64>`'s entries: holder Character id → units held.
 * The Table stores each entry as a dynamic field; we page the field ids then
 * multi-get the wrappers to read `name` (holder) + `value` (units).
 */
async function readAllocations(client: SuiClient, tableId: string): Promise<Record<string, bigint>> {
    const out: Record<string, bigint> = {};
    const fieldIds: string[] = [];
    let cursor: string | null | undefined = null;
    try {
        for (;;) {
            const page = await client.getDynamicFields({ parentId: tableId, cursor: cursor ?? null });
            for (const f of page.data) fieldIds.push(f.objectId);
            if (!page.hasNextPage || !page.nextCursor) break;
            cursor = page.nextCursor;
        }
        for (let i = 0; i < fieldIds.length; i += 50) {
            const slice = fieldIds.slice(i, i + 50);
            const objs = await client.multiGetObjects({ ids: slice, options: { showContent: true } });
            for (const o of objs) {
                const content = o.data?.content;
                if (!content || content.dataType !== 'moveObject') continue;
                const fields = content.fields as { name?: unknown; value?: unknown };
                const holder = normalizeId(fields.name);
                if (!holder) continue;
                out[holder] = BigInt(String(fields.value ?? '0'));
            }
        }
    } catch {
        return out; // partial read → return what we have (caller degrades gracefully)
    }
    return out;
}

/** A dynamic-field `name` for a `Table<ID,_>` may be a bare string or `{id}`. */
function normalizeId(name: unknown): string | null {
    if (typeof name === 'string') return name;
    if (name && typeof name === 'object') {
        const v = (name as { id?: unknown; name?: unknown }).id ?? (name as { name?: unknown }).name;
        if (typeof v === 'string') return v;
    }
    return null;
}

/* ── derive + commit one beat ─────────────────────────────────────────── */

export interface DramaCharacter {
    id: string;
    name?: string;
    tags?: string[];
}

export interface DramaBeatResult {
    /** true when resources existed and a beat was derived. */
    active: boolean;
    /** why we skipped (when active === false). */
    skipped?: string;
    /** per-character prompt hint (dominant unmet desire), for decide/POV. */
    hints: Record<string, string>;
    /** flat tension rows (all agents), highest-first within each agent. */
    tensions: DramaTensionRow[];
    /** number of contested resources read this beat. */
    resourceCount: number;
    /** commitment id of the anchored beat (when committed). */
    commitmentId?: string;
    /** blob url of the anchored beat. */
    blobUrl?: string;
}

export interface DeriveDramaOptions {
    sagaId: string;
    /** the saga's cast — agents that hold desires. */
    cast: DramaCharacter[];
    /** authored desires per character; falls back to default contention desires. */
    desiresByCharacter?: Record<string, AgentSpec['desires']>;
    /** signer for the commit (StorytellerCap holder). Omit → derive only, no commit. */
    signer?: Keypair;
    /** pre-built client (reuse the tick loop's). */
    client?: SuiClient;
}

/**
 * The DR-5 entrypoint. Reads supply, relaxes demand, commits the beat, returns
 * tension hints. Pure-fails closed: any error → `active:false` with a reason,
 * never throws into the tick loop.
 */
export async function deriveAndCommitDramaBeat(opts: DeriveDramaOptions): Promise<DramaBeatResult> {
    const empty: DramaBeatResult = { active: false, hints: {}, tensions: [], resourceCount: 0 };
    if (!dramaConfigured()) return { ...empty, skipped: 'package-not-deployed' };

    const packageId = ENDLESS_STORY_DEPLOYMENT.packageId;
    const client = opts.client ?? makeSuiClient({ network: resolveNetwork() });

    const ledger = await readResourceLedger(client, packageId, opts.sagaId);
    // Auto-retire RESOLVED director stakes: a director-created resource whose scarce
    // capacity is fully claimed is a settled contest — drop it so it stops generating
    // desires (and below, stops counting toward the director cap). This is what lets
    // the mechanism run long-term: settled stakes make room for fresh ones. Built-in
    // (seed) resources never retire.
    const resources = ledger.filter((r) => !isResolvedDirectorResource(r));
    if (resources.length === 0) return { ...empty, skipped: 'no-resources' };

    // Per-stake WANT overrides (who a director-authored resource is FOR) — off-chain
    // DEMAND, read once and threaded into the pure desire function.
    const resourceIntents = readResourceIntents();

    // 1. assemble agent specs (authored desires, else default contention desires).
    // Defaults can depend on the agent name: a star named in a label like
    // `partnership:Wen` should not receive "I want to partner with Wen".
    const agents: AgentSpec[] = opts.cast.map((c) => ({
        id: c.id,
        name: c.name,
        tags: c.tags,
        desires:
            opts.desiresByCharacter?.[c.id] ??
            defaultDesiresForCast(resources, opts.cast.length, {
                agentName: c.name,
                agentTags: c.tags,
                resourceIntents,
            }),
    }));

    // 2. build world from chain + prior satisfaction
    const prior = lastSatBySaga.get(opts.sagaId) ?? new Map<string, bigint>();
    const tickGuess = BigInt(prior.size); // monotone-ish; exact value isn't load-bearing off chain
    const world = buildWorld(resources, agents, prior, tickGuess);

    // 3. relax + derive tension (pure)
    const derived = deriveBeat(world);

    // 4. carry satisfaction forward for the next beat
    lastSatBySaga.set(opts.sagaId, extractSatisfaction(derived.next));

    // 5. commit the self-verifying beat (best-effort; tension hints stand regardless)
    let commitmentId: string | undefined;
    let blobUrl: string | undefined;
    if (opts.signer) {
        const signer = opts.signer;
        try {
            const beat = buildBeat(
                opts.sagaId,
                world,
                derived,
                lastBeatCommitmentBySaga.get(opts.sagaId) ?? null,
            );
            const res = await withAdminLock(() =>
                signAndAnchor({
                    sagaId: opts.sagaId,
                    // World-level affect snapshot. Subject = worldId (NOT sagaId) so these
                    // machine-readable JSON beats never collide with the saga's prose gazette
                    // commitments (subject = sagaId) and never surface in the gazette feed.
                    // The saga is still recorded via the commitment's saga_id field + the beat
                    // JSON. Fall back to sagaId only if worldId is unset (gazette-read also
                    // content-filters drama beats as a safety net for older saga-subject ones).
                    subjectId: ENDLESS_STORY_DEPLOYMENT.worldId || opts.sagaId,
                    content: encodeBeat(beat),
                    signer,
                    contentType: 'application/json',
                }),
            );
            commitmentId = res.commitmentId;
            blobUrl = res.blobUrl;
            lastBeatCommitmentBySaga.set(opts.sagaId, res.commitmentId);
        } catch (err) {
            // commit failure must not break the tick — log + carry on with hints.
            console.warn('[drama] beat commit failed:', err instanceof Error ? err.message : err);
        }
    }

    // 6. hints for prompts
    const hints: Record<string, string> = {};
    for (const c of opts.cast) {
        const h = dramaHintForAgent(derived.next, c.id);
        if (h) hints[c.id] = h;
    }

    return {
        active: true,
        hints,
        tensions: derived.tensions,
        resourceCount: resources.length,
        commitmentId,
        blobUrl,
    };
}

/* ── supply-side settlement: resolve → apply transfers on chain ───────── */

/**
 * Settle a resolved event's resource transfers ON CHAIN — the "dispose" half.
 *
 * After `event::resolve_event` validated the resolution's `resource_transfers`
 * (every holder must be a participant), the director calls this once to apply
 * them: one `apply_resource_transfers` move-call per touched DramaResource, all
 * in ONE PTB. The Move side re-checks conservation and applies each batch
 * atomically — it never trusts the off-chain proposal, it re-validates it.
 *
 * This is the ready settlement primitive for DR-6. It fires only when a
 * resolution actually carried transfers (a director/LLM PROPOSED them by
 * resolving with `outcomes_with_resource_transfers` instead of `empty_outcomes`)
 * AND the package is redeployed with resource.move. The PROPOSAL policy (which
 * card play maps to which seize) is the LLM-director step layered on top; this
 * function is the deterministic disposal it drives.
 */
export async function settleResolvedTransfers(opts: {
    sagaId: string;
    capId: string;
    eventId: string;
    /** DramaResource object ids touched by this resolution (one call each). */
    resourceIds: string[];
    signer: Keypair;
    client?: SuiClient;
}): Promise<{ ok: boolean; digest?: string; error?: string }> {
    if (opts.resourceIds.length === 0) return { ok: true };
    const client = opts.client ?? makeSuiClient({ network: resolveNetwork() });
    try {
        const tx = new Transaction();
        for (const rid of opts.resourceIds) {
            tx.add(
                endlessTx.event.applyResourceTransfers({
                    cap: opts.capId,
                    saga: opts.sagaId,
                    budgetEvent: opts.eventId,
                    dramaResource: rid,
                }),
            );
        }
        const res = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: opts.signer,
            options: { showEffects: true },
        });
        const ok = res.effects?.status?.status === 'success';
        return { ok, digest: res.digest, error: ok ? undefined : res.effects?.status?.error };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** Convenience for callers that have only the saga id: fetch the cast, derive. */
export async function deriveDramaForSaga(
    sagaId: string,
    signer?: Keypair,
    client?: SuiClient,
): Promise<DramaBeatResult> {
    const c = client ?? makeSuiClient({ network: resolveNetwork() });
    const result = await read.character
        .listMintedCharacters(c, ENDLESS_STORY_DEPLOYMENT.packageId, { sagaId })
        .catch(() => null);
    const cast: DramaCharacter[] =
        result?.summaries.map((s, i) => ({
            id: s.characterId,
            name: s.name,
            tags: extractTagLabels((result.characters[i] as { json?: unknown } | undefined)?.json),
        })) ?? [];
    return deriveAndCommitDramaBeat({ sagaId, cast, signer, client: c });
}

/**
 * A short, public, LLM-free "where the tension is right now" headline for the gazette teaser —
 * the top contested resources right now (deterministic, read-only: no signer →
 * derive without committing). Returns null when drama is dormant / on any error
 * so the teaser falls back to the plain gazette excerpt.
 */
export async function fetchTensionHeadline(sagaId: string, max = 2): Promise<string | null> {
    try {
        const r = await deriveDramaForSaga(sagaId); // no signer = read-only derive
        if (!r.active || r.tensions.length === 0) return null;
        const ranked = [...r.tensions].sort((a, b) =>
            b.value > a.value ? 1 : b.value < a.value ? -1 : 0,
        );
        const seen = new Set<string>();
        const labels: string[] = [];
        for (const t of ranked) {
            const label = humanResourceFromStatement(t.statement);
            if (!label || seen.has(label)) continue;
            seen.add(label);
            labels.push(label);
            if (labels.length >= max) break;
        }
        return labels.length > 0 ? labels.join('、') : null;
    } catch {
        return null;
    }
}

/** Strip the 「…」 wrapper and any `prefix:` from a statement, e.g. "win 「spotlight:X」" → "X". */
function humanResourceFromStatement(statement: string): string {
    const m = statement.match(/「([^」]+)」/);
    const inner = m ? m[1] : statement;
    return inner.replace(/^[a-z]+:/, '').trim();
}

function extractTagLabels(json: unknown): string[] {
    const tags = (json as { tags?: Array<{ label?: unknown }> } | undefined)?.tags ?? [];
    return tags.map((t) => t.label).filter((x): x is string => typeof x === 'string');
}

export { satKey, tensionFraction };
export type { DramaTensionRow };
