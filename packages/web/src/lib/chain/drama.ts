/**
 * Drama engine orchestration (server-only): glues the pure demand core
 * (`drama-core`) to the on-chain supply ledger (`resource.move`) and the
 * verifiable commit (`signAndAnchor`). Graceful no-op when the package has no
 * resource module or the saga has no resources. Prior satisfaction is carried
 * in a process-level cache; the committed blob is self-contained, so the cache
 * is a convenience, not a trust anchor.
 */
import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
    signAndExecute,
    tx as endlessTx,
    type SuiClient,
} from '@endless-story/sdk';
import { signAndAnchor } from '@endless-story/runner';
import { resolveNetwork } from './network.js';
import { withAdminLock } from './admin-signer.js';
import {
    applyDreamStirs,
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

const lastSatBySaga = new Map<string, Map<string, bigint>>();
const lastBeatCommitmentBySaga = new Map<string, string>();

// §2.51 dream stir: a dream written only into memory is inert; the effective dose
// adds one tighten on the dreamer's hottest desire, consumed ONCE by the next
// beat (a jolt, not a standing buff). Off-chain demand only — the beat commits
// the stirred input world, so replay still reproduces the output.
const pendingDreamStirs = new Map<string, Map<string, number>>();

/** Queue a one-shot appraisal stir for a character (0..1 fraction of SCALE). */
export function queueDreamStir(sagaId: string, characterId: string, fraction = 0.18): void {
    if (!sagaId || !characterId || !(fraction > 0)) return;
    const bySaga = pendingDreamStirs.get(sagaId) ?? new Map<string, number>();
    bySaga.set(characterId, Math.max(bySaga.get(characterId) ?? 0, Math.min(1, fraction)));
    pendingDreamStirs.set(sagaId, bySaga);
}

/** Can't know statically whether the package includes resource.move; callers
 *  rely on `readResourceLedger` returning [] instead. */
export function dramaConfigured(): boolean {
    return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}

/** Decoded `DramaResource` struct JSON (as returned under `.json`). */
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

/** Read every live DramaResource + per-holder allocations. Returns [] on any
 *  failure — the caller treats [] as "drama dormant". */
export async function readResourceLedger(
    client: SuiClient,
    packageId: string,
    sagaId: string,
): Promise<ResourceSnapshot[]> {
    const rt0 = Date.now();
    const rmark = (m: string) => console.log(`[ch-timing] ledger t=${((Date.now() - rt0) / 1000).toFixed(1)}s ${m}`);
    let live: { resourceId: string }[];
    try {
        rmark('→ list instantiations + retirements (paged queryEvents)');
        const [instantiated, retired] = await Promise.all([
            read.resource.listResourceInstantiations(client, packageId, { sagaId }),
            read.resource.listResourceRetirements(client, packageId, { sagaId }),
        ]);
        const dead = new Set(retired.map((r) => r.resourceId));
        live = instantiated.filter((r) => !dead.has(r.resourceId));
        rmark(`list done (${instantiated.length} inst, ${retired.length} retired, ${live.length} live)`);
    } catch {
        rmark('list threw → [] (drama dormant)');
        return []; // package predates resource.move, or RPC hiccup
    }
    if (live.length === 0) return [];

    rmark(`→ getManyResources (${live.length})`);
    const objects = await read.resource
        .getManyResources(
            client,
            live.map((r) => r.resourceId),
        )
        .catch(() => [] as Awaited<ReturnType<typeof read.resource.getManyResources>>);
    rmark(`getMany done (${objects.length} objs) → readAllocations per object`);

    const snapshots: ResourceSnapshot[] = [];
    for (const obj of objects) {
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
    rmark(`done (${snapshots.length} snapshots)`);
    return snapshots;
}

/** Enumerate a `Table<ID, u64>`: holder Character id → units held (page the
 *  dynamic-field ids, then multi-get the wrappers). */
async function readAllocations(client: SuiClient, tableId: string): Promise<Record<string, bigint>> {
    const out: Record<string, bigint> = {};
    const fieldIds: string[] = [];
    let cursor: string | null = null;
    try {
        for (;;) {
            const page = await client.core.listDynamicFields({ parentId: tableId, cursor });
            for (const f of page.dynamicFields) fieldIds.push(f.fieldId);
            if (!page.hasNextPage || !page.cursor) break;
            cursor = page.cursor;
        }
        for (let i = 0; i < fieldIds.length; i += 50) {
            const slice = fieldIds.slice(i, i + 50);
            const objs = await client.core.getObjects({ objectIds: slice, include: { json: true } });
            for (const o of objs.objects) {
                if (o instanceof Error) continue;
                const fields = o.json as { name?: unknown; value?: unknown } | null;
                if (!fields) continue;
                const holder = normalizeId(fields.name);
                if (!holder) continue;
                out[holder] = BigInt(String(fields.value ?? '0'));
            }
        }
    } catch {
        return out; // partial read → return what we have
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
    resourceCount: number;
    commitmentId?: string;
    blobUrl?: string;
}

export interface DeriveDramaOptions {
    sagaId: string;
    cast: DramaCharacter[];
    /** authored desires per character; falls back to default contention desires. */
    desiresByCharacter?: Record<string, AgentSpec['desires']>;
    /** signer for the commit (StorytellerCap holder). Omit → derive only, no commit. */
    signer?: Keypair;
    client?: SuiClient;
}

/** DR-5 entrypoint: read supply, relax demand, commit the beat, return tension
 *  hints. Fails closed — any error yields `active:false`, never throws into the tick loop. */
export async function deriveAndCommitDramaBeat(opts: DeriveDramaOptions): Promise<DramaBeatResult> {
    const empty: DramaBeatResult = { active: false, hints: {}, tensions: [], resourceCount: 0 };
    if (!dramaConfigured()) return { ...empty, skipped: 'package-not-deployed' };

    const packageId = ENDLESS_STORY_DEPLOYMENT.packageId;
    const client = opts.client ?? makeSuiClient({ network: resolveNetwork() });

    const ledger = await readResourceLedger(client, packageId, opts.sagaId);
    // Auto-retire resolved director stakes (fully-claimed capacity = settled
    // contest) so settled stakes make room for fresh ones. Seed resources never retire.
    const resources = ledger.filter((r) => !isResolvedDirectorResource(r));
    if (resources.length === 0) return { ...empty, skipped: 'no-resources' };

    // Per-stake want overrides (who a director-authored resource is for).
    const resourceIntents = readResourceIntents();

    // Assemble agent specs. Defaults depend on the agent name: a star named in a
    // label like `partnership:Wen` must not receive "I want to partner with Wen".
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

    const prior = lastSatBySaga.get(opts.sagaId) ?? new Map<string, bigint>();
    const tickGuess = BigInt(prior.size); // monotone-ish; exact value isn't load-bearing off chain
    const world = buildWorld(resources, agents, prior, tickGuess);

    // §2.51: consume queued dream stirs, applied to the INPUT world so the
    // committed beat stays replayable.
    const stirs = pendingDreamStirs.get(opts.sagaId);
    if (stirs?.size) {
        for (const s of applyDreamStirs(world, stirs)) {
            console.log(
                `[drama] dream stir: ${s.agentId.slice(0, 8)}… 「${s.statement}」 satisfaction −${s.fraction} (夢攪動了她)`,
            );
        }
        pendingDreamStirs.delete(opts.sagaId);
    }

    const derived = deriveBeat(world);

    lastSatBySaga.set(opts.sagaId, extractSatisfaction(derived.next));

    // Commit the self-verifying beat (best-effort; tension hints stand regardless).
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
                    // Subject = worldId (NOT sagaId) so these JSON beats never collide
                    // with the saga's prose gazette commitments or surface in its feed.
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
            // Commit failure must not break the tick — log + carry on with hints.
            console.warn('[drama] beat commit failed:', err instanceof Error ? err.message : err);
        }
    }

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

/**
 * Apply a resolved event's resource transfers on chain — one
 * `apply_resource_transfers` call per touched DramaResource, all in one PTB.
 * The Move side re-validates the off-chain proposal; it never trusts it.
 */
export async function settleResolvedTransfers(opts: {
    sagaId: string;
    capId: string;
    eventId: string;
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
        const res = await signAndExecute(client, {
            transaction: tx,
            signer: opts.signer,
            waitForFinality: false,
        });
        return { ok: res.success, digest: res.digest, error: res.success ? undefined : (res.error ?? undefined) };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** Convenience: fetch the cast from the saga id, then derive. */
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

/** LLM-free tension headline for the gazette teaser. Null when drama is dormant
 *  or on any error, so the teaser falls back to the plain gazette excerpt. */
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
