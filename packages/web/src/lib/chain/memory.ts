/**
 * MemWal character memory — recall + remember helpers.
 *
 * Server-only. Encapsulates the SagaMemoryClient lifecycle so callers
 * (pov-core, run-reflection) don't touch the client directly:
 *   - resolve the character's admin-held ControlCap (from CharacterMinted)
 *   - build a SagaMemoryClient from env
 *   - run one recall / remember, then destroy
 *
 * **Graceful no-op**: if the MemWal env isn't configured (no relayer
 * creds yet), `recall` returns [] and `remember` returns false — the
 * narrative pipeline keeps working without long-term memory. This lets
 * the integration land before creds arrive and light up the moment
 * `MEMWAL_DELEGATE_KEY` + `MEMWAL_ACCOUNT_ID` are set.
 *
 * **Network**: SEAL only runs on testnet/mainnet, so the client is
 * pinned there (devnet deployments can't encrypt/decrypt). See the
 * Phase-3 migration note in AGENTS / the seal backlog memory.
 *
 * Architecture: web → memwal is the sanctioned path (memwal is the sole
 * Walrus/SEAL entrypoint). Never import @mysten/seal here directly.
 */

import { SagaMemoryClient } from '@endless-story/memwal';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';
import { getAdminAddress } from './admin-signer.js';

interface MemEnv {
    delegateKey?: string;
    accountId?: string;
    serverUrl?: string;
    suiPrivateKey?: string;
    embeddingApiKey?: string;
}

// Official env names match the MemWal docs / dashboard:
//   MEMWAL_PRIVATE_KEY = the ed25519 delegate private key (relayer auth)
//   MEMWAL_ACCOUNT_ID  = MemWalAccount object id (from the dashboard)
//   MEMWAL_SERVER_URL  = relayer base URL (optional; we default by network)
function memEnv(): MemEnv {
    return {
        delegateKey: process.env.MEMWAL_PRIVATE_KEY,
        accountId: process.env.MEMWAL_ACCOUNT_ID,
        serverUrl: process.env.MEMWAL_SERVER_URL,
        suiPrivateKey: process.env.SUI_ADMIN_PRIVATE_KEY,
        embeddingApiKey: process.env.OPENAI_API_KEY,
    };
}

/** True when all required MemWal creds are present. */
export function isMemoryConfigured(): boolean {
    const e = memEnv();
    return Boolean(
        e.delegateKey && e.accountId && e.suiPrivateKey && e.embeddingApiKey,
    );
}

/** SEAL only runs on testnet/mainnet; clamp anything else to testnet. */
function sealNetwork(): 'testnet' | 'mainnet' {
    return resolveNetwork() === 'mainnet' ? 'mainnet' : 'testnet';
}

/**
 * Per-character namespace. The relayer's vector index is scoped by
 * (owner, namespace) — without this, every character would share the
 * admin's single default space and recall would pull cross-character
 * blob ids (SEAL would then drop them on decrypt, but wastefully).
 * Scoping by characterId keeps each character's index clean.
 */
function namespaceFor(characterId: string): string {
    return `char_${characterId}`;
}

/**
 * Relayer base URL. The managed relayer is network-specific:
 *   testnet → staging.memwal.ai, mainnet → relayer.memwal.ai.
 * Defaulting wrong (e.g. mainnet relayer with a testnet account) yields
 * 401s, so we pick by network unless MEMWAL_SERVER_URL overrides.
 */
function relayerUrl(): string {
    const override = memEnv().serverUrl;
    if (override) return override;
    return sealNetwork() === 'mainnet'
        ? 'https://relayer.memwal.ai'
        : 'https://relayer.staging.memwal.ai';
}

/**
 * Resolve the **current** admin-held ControlCap for a character.
 *
 * Prefers the highest-epoch ControlCap owned by the admin address — this
 * survives `revoke_all_control` / `reassign_saga`, which bump the
 * character's epoch and strand older caps in the wallet. Falls back to
 * the mint-time cap from the CharacterMinted event if the owned-objects
 * scan finds nothing (e.g. admin address unavailable).
 *
 * Returns null when no usable cap is found — after a revoke with no
 * re-issue, the stale cap is still returned but recall will hit
 * `ENoAccess` at the SEAL key server (epoch mismatch), which the caller
 * swallows → [] (i.e. access is cut, as intended).
 */
async function resolveControlCapId(characterId: string): Promise<string | null> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return null;
    const client = makeSuiClient({ network: resolveNetwork() });

    // Primary: highest-epoch ControlCap the admin currently owns.
    try {
        const admin = getAdminAddress();
        const caps = await read.character.listControlCapsForAddress(client, admin, pkg);
        const mine = caps
            .filter((c) => c.characterId === characterId)
            .sort((a, b) => b.epoch - a.epoch);
        if (mine.length > 0) return mine[0].capId;
    } catch (err) {
        console.warn('[memory] listControlCapsForAddress failed, falling back:', err);
    }

    // Fallback: mint-time cap from the CharacterMinted event.
    try {
        const summaries = await read.character.listMintedCharacterSummaries(client, pkg, {});
        const match = summaries.find((s) => s.characterId === characterId);
        return match?.controlCapId || null;
    } catch (err) {
        console.warn('[memory] resolveControlCapId fallback failed:', err);
        return null;
    }
}

async function clientFor(characterId: string): Promise<SagaMemoryClient | null> {
    if (!isMemoryConfigured()) return null;
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return null;
    const controlCapId = await resolveControlCapId(characterId);
    if (!controlCapId) return null;
    const e = memEnv();
    try {
        return SagaMemoryClient.create({
            key: e.delegateKey!,
            accountId: e.accountId!,
            serverUrl: relayerUrl(),
            suiPrivateKey: e.suiPrivateKey!,
            embeddingApiKey: e.embeddingApiKey!,
            packageId: pkg,
            characterId,
            controlCapId,
            suiNetwork: sealNetwork(),
        });
    } catch (err) {
        console.warn('[memory] SagaMemoryClient.create failed:', err);
        return null;
    }
}

/* ── memory type + importance weighting ─────────────────────────────
 * MemWal stores flat encrypted text; it has no importance/recency/type
 * scoring of its own. We restore the Smallville weighting (proposal
 * §5.2) by tagging each stored memory with a tiny parseable header
 * `[[m|t=<type>|i=<importance>]]` and re-ranking recall results by
 * importance. The tag is STRIPPED before the text reaches a prompt, and
 * surfaced structurally for the dossier MemoriesTab UI. */

export type MemoryKind =
    | 'dream'
    | 'reflection'
    | 'chapter'
    | 'observation'
    | 'relationship'
    | 'genesis';

/** Default importance per kind (1-10). Dreams highest (owner paid, must
 *  surface first — §5.2); observations lowest. */
const DEFAULT_IMPORTANCE: Record<MemoryKind, number> = {
    dream: 9,
    relationship: 8,
    reflection: 7,
    genesis: 7,
    chapter: 5,
    observation: 4,
};

// Tag carries kind + importance + narrative day `d=` (for recency decay).
// Three-factor recall score = importance × recency(narrative-day) ×
// relevance(semantic distance) — Smallville-style, adapted to MemWal:
// `importance` from our tag, `recency` from the day stamp + decay,
// `relevance` from MemWal's own vector distance. The one thing we can't
// match vs a local store: we only score the semantically-retrieved
// candidate set, not the full memory store (mitigated by over-fetch).
// `a=1` marks a sleep-consolidated reflection: a high-density memory the
// REFLECT/sleep step produced from scattered observations. The next sleep
// must NOT re-compress these (else it eats its own output and the dense
// reflection degrades back into noise) — N2. The flag is optional so all
// pre-N2 memories parse unchanged.
const TAG_RE = /^\[\[m\|t=([a-z]+)\|i=(\d+)(?:\|d=(\d+))?(?:\|a=([01]))?\]\]\s*([\s\S]*)$/;

export interface RecalledMemory {
    text: string;
    kind: MemoryKind | 'unknown';
    importance: number;
    /** Narrative day written (recency); undefined for legacy untagged. */
    day?: number;
    /** Sleep-consolidated (anchor=true) — excluded from re-consolidation. */
    anchored?: boolean;
}

function tagMemory(
    text: string,
    kind: MemoryKind,
    importance: number,
    day: number,
    anchored = false,
): string {
    const i = Math.max(1, Math.min(10, Math.round(importance)));
    const a = anchored ? '|a=1' : '';
    return `[[m|t=${kind}|i=${i}|d=${Math.max(0, Math.round(day))}${a}]] ${text}`;
}

function parseMemory(stored: string): RecalledMemory {
    const m = stored.match(TAG_RE);
    if (m) {
        return {
            kind: m[1] as MemoryKind,
            importance: Number(m[2]) || 5,
            day: m[3] != null ? Number(m[3]) : undefined,
            anchored: m[4] === '1',
            text: m[5].trim(),
        };
    }
    // Untagged (legacy / pre-tagging): treat as mid-importance observation.
    return { kind: 'unknown', importance: 5, text: stored.trim() };
}

/** Current narrative day from the World tick (chain). Falls back to 1.
 *  Recency uses narrative time (not wall-clock) so a dream fades as the
 *  storyteller advances days — semantically right + demoable. */
async function currentNarrativeDay(): Promise<number> {
    const worldId = ENDLESS_STORY_DEPLOYMENT.worldId;
    if (!worldId) return 1;
    try {
        const client = makeSuiClient({ network: resolveNetwork() });
        const res = await read.world.getWorld(client, worldId);
        const json = res.json as unknown as {
            state?: { current_tick?: number | string };
            time_config?: { days_per_tick_bp?: number | string };
        };
        const tick = Number(json.state?.current_tick ?? 0);
        const bp = Number(json.time_config?.days_per_tick_bp ?? 1670) || 1670;
        return Math.floor((tick * bp) / 10_000) + 1;
    } catch {
        return 1;
    }
}

/** Recency decay by narrative day. Half-life 2 days: 2 days old → 0.5,
 *  4 days → 0.25. A high-importance dream (i=9) thus starts on top but is
 *  overtaken by fresh memories as days pass. Legacy (no day) → neutral 1. */
const RECENCY_HALFLIFE_DAYS = 2;
function recencyWeight(memDay: number | undefined, today: number): number {
    if (memDay == null) return 1;
    return Math.pow(0.5, Math.max(0, today - memDay) / RECENCY_HALFLIFE_DAYS);
}

/** Relevance from MemWal semantic distance (lower = closer). */
function relevanceWeight(distance: number): number {
    if (!Number.isFinite(distance)) return 0.5;
    return Math.max(0.05, 1 - Math.min(1, distance));
}

/**
 * Recall a character's memories, importance-re-ranked. Returns decrypted
 * text (tags stripped), highest-importance first, [] when unconfigured.
 * Over-fetches then re-ranks so a high-importance memory (e.g. an owner
 * dream) isn't buried under closer-but-trivial observations.
 */
export async function recallForCharacter(
    characterId: string,
    query: string,
    limit = 6,
): Promise<string[]> {
    const structured = await recallStructuredForCharacter(characterId, query, limit);
    return structured.map((m) => m.text);
}

/** Structured recall (kind + importance) for UI surfaces (MemoriesTab). */
export async function recallStructuredForCharacter(
    characterId: string,
    query: string,
    limit = 6,
): Promise<RecalledMemory[]> {
    const client = await clientFor(characterId);
    if (!client) return [];
    try {
        // Over-fetch (3×) so three-factor re-rank has candidates to work with.
        const [res, today] = await Promise.all([
            client.recall(query, limit * 3, namespaceFor(characterId)),
            currentNarrativeDay(),
        ]);
        const scored: { m: RecalledMemory; score: number; idx: number }[] = [];
        let idx = 0;
        for (const hit of res.results) {
            if ('text' in hit && typeof hit.text === 'string' && hit.text.trim()) {
                const m = parseMemory(hit.text);
                const distance =
                    'distance' in hit && typeof (hit as { distance?: number }).distance === 'number'
                        ? (hit as { distance: number }).distance
                        : 0.5;
                const score =
                    (m.importance / 10) *
                    recencyWeight(m.day, today) *
                    relevanceWeight(distance);
                scored.push({ m, score, idx: idx++ });
            }
        }
        const ranked = scored
            .sort((a, b) => b.score - a.score || a.idx - b.idx)
            .slice(0, limit)
            .map((x) => x.m);
        console.log(
            `[memory] recall ${characterId.slice(0, 10)}… → ${ranked.length} memories (re-ranked)`,
        );
        return ranked;
    } catch (err) {
        console.warn('[memory] recall failed:', err);
        return [];
    } finally {
        client.destroy();
    }
}

/**
 * Recall the **scattered raw material** for a sleep/consolidation pass (N2).
 *
 * Unlike `recallStructuredForCharacter` (which re-ranks for prompt-time
 * relevance), this returns the low-density memories worth compressing:
 * observations + POV chapters that are NOT already sleep-consolidated.
 * It deliberately EXCLUDES anchored reflections, dreams, relationships and
 * genesis — those are either already dense or must stay verbatim, so feeding
 * them back into compression would either degrade them or loop. Recency-
 * biased (newest first) since sleep digests "what just happened".
 *
 * Returns [] when unconfigured. The query seeds MemWal's semantic search;
 * we over-fetch wide then filter by kind/anchored locally.
 */
export async function recallForConsolidation(
    characterId: string,
    query: string,
    limit = 12,
): Promise<RecalledMemory[]> {
    const client = await clientFor(characterId);
    if (!client) return [];
    try {
        const res = await client.recall(query, limit * 3, namespaceFor(characterId));
        const candidates: RecalledMemory[] = [];
        for (const hit of res.results) {
            if ('text' in hit && typeof hit.text === 'string' && hit.text.trim()) {
                const m = parseMemory(hit.text);
                const consolidatable =
                    !m.anchored &&
                    (m.kind === 'observation' || m.kind === 'chapter' || m.kind === 'unknown');
                if (consolidatable) candidates.push(m);
            }
        }
        // Newest-first (sleep digests recent experience); undated last.
        candidates.sort((a, b) => (b.day ?? -1) - (a.day ?? -1));
        const out = candidates.slice(0, limit);
        console.log(
            `[memory] recallForConsolidation ${characterId.slice(0, 10)}… → ${out.length} scattered`,
        );
        return out;
    } catch (err) {
        console.warn('[memory] recallForConsolidation failed:', err);
        return [];
    } finally {
        client.destroy();
    }
}

/**
 * Store a memory for a character, tagged with kind + importance so recall
 * can weight it. Returns true if written, false when unconfigured / on
 * failure (non-fatal — chain anchor already happened).
 *
 * `anchored` marks a sleep-consolidated reflection (N2) so the next sleep
 * won't re-compress it.
 */
export async function rememberForCharacter(
    characterId: string,
    text: string,
    opts?: { kind?: MemoryKind; importance?: number; anchored?: boolean },
): Promise<boolean> {
    if (!text.trim()) return false;
    const client = await clientFor(characterId);
    if (!client) return false;
    const kind = opts?.kind ?? 'observation';
    const importance = opts?.importance ?? DEFAULT_IMPORTANCE[kind] ?? 5;
    const day = await currentNarrativeDay();
    try {
        await client.remember(
            tagMemory(text, kind, importance, day, opts?.anchored ?? false),
            namespaceFor(characterId),
        );
        console.log(
            `[memory] remember ${characterId.slice(0, 10)}… ✓ [${kind} i=${importance}${
                opts?.anchored ? ' anchored' : ''
            }] (${text.length} chars)`,
        );
        return true;
    } catch (err) {
        console.warn('[memory] remember failed:', err);
        return false;
    } finally {
        client.destroy();
    }
}
