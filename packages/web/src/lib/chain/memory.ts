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
import { resolveControlCapId } from './control-caps.js';
import { writePlanIntentFromText } from './plan-intent-store.js';
import {
    DEFAULT_IMPORTANCE,
    parseMemory,
    recencyWeight,
    relevanceWeight,
    tagMemory,
    type MemoryKind,
    type RecalledMemory,
} from './memory-tags.js';

// Tag format + scoring live in memory-tags.ts (client-safe, shared with the
// Owner-side browser decrypt path). Re-exported so existing imports hold.
export { parseMemory, recencyWeight, relevanceWeight } from './memory-tags.js';
export type { MemoryKind, RecalledMemory } from './memory-tags.js';

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

/** SEAL only runs on testnet/mainnet; clamp anything else to testnet.
 *  Exported so the dossier page can hand the network to the Owner-side
 *  browser decrypt component. */
export function sealNetwork(): 'testnet' | 'mainnet' {
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
/**
 * True once the SELF-HOSTED three-factor relayer is live (set
 * `MEMWAL_RELAYER_THREE_FACTOR=1`). It ranks the FULL namespace by
 * importance × recency × relevance and returns the true top-N, so recall fetches
 * only N blobs (≈3× fewer SEAL decrypts → much faster) and trusts its order.
 * Default off → managed relayer (top-K by distance) + client-side re-rank.
 */
function relayerRanksThreeFactor(): boolean {
    const v = process.env.MEMWAL_RELAYER_THREE_FACTOR;
    return v === '1' || v === 'true';
}

function relayerUrl(): string {
    const override = memEnv().serverUrl;
    if (override) return override;
    return sealNetwork() === 'mainnet'
        ? 'https://relayer.memwal.ai'
        : 'https://relayer.staging.memwal.ai';
}

// ControlCap resolution (current admin-held cap per character) lives in
// ./control-caps — shared with the card-play path so both agree on which cap
// is current. `resolveControlCapId` is imported above.

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

/** Current narrative day from the World tick (chain). Falls back to 1.
 *  Recency uses narrative time (not wall-clock) so a dream fades as the
 *  storyteller advances days — semantically right + demoable. */
export async function currentNarrativeDay(): Promise<number> {
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

const MEMORY_WARNINGS: string[] = [];

function pushMemoryWarning(message: string): void {
    MEMORY_WARNINGS.push(message);
    if (MEMORY_WARNINGS.length > 80) MEMORY_WARNINGS.shift();
}

export function drainMemoryWarnings(): string[] {
    return MEMORY_WARNINGS.splice(0, MEMORY_WARNINGS.length);
}

function isRateLimitError(err: unknown): boolean {
    if (!err) return false;
    const e = err as { status?: number; statusText?: string; message?: string };
    return (
        e.status === 429 ||
        /429|too many requests|rate.?limit/i.test(e.statusText ?? '') ||
        /429|too many requests|rate.?limit/i.test(e.message ?? '')
    );
}

async function sleepMs(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withMemoryRetry<T>(
    label: string,
    characterId: string,
    op: () => Promise<T>,
): Promise<T> {
    const maxAttempts = Math.max(1, Number(process.env.MEMWAL_RECALL_RETRY_ATTEMPTS) || 3);
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await op();
        } catch (err) {
            lastErr = err;
            if (!isRateLimitError(err) || attempt >= maxAttempts) break;
            const wait = 450 * attempt + Math.floor(Math.random() * 250);
            console.warn(
                `[memory] ${label} rate-limited for ${characterId.slice(0, 10)}… retry ${attempt}/${maxAttempts - 1} in ${wait}ms`,
            );
            await sleepMs(wait);
        }
    }
    if (isRateLimitError(lastErr)) {
        pushMemoryWarning(`${characterId.slice(0, 10)}… ${label} hit MemWal/SEAL 429`);
    }
    throw lastErr;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * NARRATIVE OBSERVATORY — in-memory, recall-capable fake memory (ES_NARRATIVE=1).
 *
 * The full-tick *mechanism* harness fakes the chain AND turns memory off (no
 * MemWal creds → isMemoryConfigured() false → recall returns []). That isolates the
 * chain seam but kills the iteration engine: with no recall, every POV starts from
 * a blank slate and the story can only loop. The narrative observatory flips memory
 * back ON without the relayer/SEAL/Walrus/chain round-trips — a module-level store
 * keyed by characterId, with REAL embedding-based cosine recall when an OpenAI key
 * is present (deterministic fake vectors otherwise, for a no-key smoke).
 *
 * This is the iteration engine: each tick a character remember()s its plan /
 * observations / relationships / chapter; at POV time it recall()s the relevant
 * past so the new chapter CONTINUES from it. Watching the printed chapters tick over
 * ticks tells us whether the narrative advances or circles the same standoff.
 *
 * It deliberately mirrors the real path's *return shapes* (recall → string[] of
 * tag-stripped text; plan → latest kind=plan text) so callers (pov-core, plan)
 * behave identically — only the storage + transport differ.
 * ──────────────────────────────────────────────────────────────────────────── */

interface InMemMemory {
    content: string;
    embedding: number[];
    kind: MemoryKind;
    day: number;
    importance: number;
    /** insertion order — tiebreaker so newest wins on equal score. */
    seq: number;
}

/** True when the narrative observatory's in-memory memory path is active. */
function narrativeMemoryOn(): boolean {
    return process.env.ES_NARRATIVE === '1';
}

const NARRATIVE_STORE = new Map<string, InMemMemory[]>();
let _narrativeSeq = 0;

/** Wipe the in-memory store (between observatory runs). */
export function __resetNarrativeMemory(): void {
    NARRATIVE_STORE.clear();
    _narrativeSeq = 0;
}

/** Cumulative recall hit count this process — the observatory reports it per tick. */
let _narrativeRecallHits = 0;
export function __drainNarrativeRecallHits(): number {
    const n = _narrativeRecallHits;
    _narrativeRecallHits = 0;
    return n;
}

const EMBED_DIM = 256;

/**
 * Embed text for the in-memory store.
 *   · with OPENAI_API_KEY → real text-embedding-3-small (same call shape as
 *     MemWalManual.embed), so relevance is genuine and the iteration is real.
 *   · without a key → a deterministic token-hash bag-of-words vector. The mechanism
 *     (remember → cosine → recall) runs and hits, but relevance is crude — only for
 *     the no-key smoke that proves the wiring, not for reading real iteration.
 */
async function narrativeEmbed(text: string): Promise<number[]> {
    const key = process.env.OPENAI_API_KEY;
    if (key) {
        const apiBase = (process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1').replace(/\/$/, '');
        const model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
        const resp = await fetch(`${apiBase}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({ model, input: text.slice(0, 8000) }),
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`[narrative] embedding API error (${resp.status}): ${errText}`);
        }
        const data = (await resp.json()) as { data?: { embedding: number[] }[] };
        const vec = data.data?.[0]?.embedding;
        if (!vec) throw new Error('[narrative] embedding API returned no data');
        return vec;
    }
    // Deterministic fallback: hash tokens into a fixed-dim bag (mechanism-only).
    const vec = new Array<number>(EMBED_DIM).fill(0);
    const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    for (const tok of tokens) {
        let h = 2166136261;
        for (let i = 0; i < tok.length; i++) {
            h ^= tok.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        vec[Math.abs(h) % EMBED_DIM] += 1;
    }
    return vec;
}

function cosine(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < n; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** In-memory remember: embed + push. Returns true (always stored). */
async function narrativeRemember(
    characterId: string,
    text: string,
    kind: MemoryKind,
    importance: number,
    day: number,
): Promise<boolean> {
    const embedding = await narrativeEmbed(text);
    const list = NARRATIVE_STORE.get(characterId) ?? [];
    list.push({ content: text, embedding, kind, day, importance, seq: _narrativeSeq++ });
    NARRATIVE_STORE.set(characterId, list);
    console.log(
        `[narrative-mem] remember ${characterId.slice(0, 10)}… ✓ [${kind} i=${importance}] ` +
            `(${text.length} chars, store=${list.length})`,
    );
    return true;
}

/**
 * In-memory recall: embed query → cosine vs this character's store → top-`limit`.
 * Scored like the real managed-relayer path (importance × recency × relevance) so
 * the ordering matches production, then returns tag-free `content` strings.
 */
async function narrativeRecall(
    characterId: string,
    query: string,
    limit: number,
    today: number,
): Promise<RecalledMemory[]> {
    const list = NARRATIVE_STORE.get(characterId);
    if (!list || list.length === 0) return [];
    const q = await narrativeEmbed(query);
    const scored = list.map((m) => {
        const relevance = relevanceWeight(1 - cosine(q, m.embedding)); // distance = 1 - cos
        const score = (m.importance / 10) * recencyWeight(m.day, today) * relevance;
        return { m, score };
    });
    scored.sort((a, b) => b.score - a.score || b.m.seq - a.m.seq);
    const out = scored.slice(0, limit).map(({ m }) => ({
        text: m.content,
        kind: m.kind,
        importance: m.importance,
        day: m.day,
        anchored: false,
    }));
    _narrativeRecallHits += out.length;
    console.log(
        `[narrative-mem] recall ${characterId.slice(0, 10)}… → ${out.length}/${list.length} (in-memory cosine)`,
    );
    return out;
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
    if (narrativeMemoryOn()) {
        const today = await currentNarrativeDay();
        const mems = await narrativeRecall(characterId, query, limit, today);
        return mems.map((m) => m.text);
    }
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
        const today = await currentNarrativeDay();

        // Self-hosted three-factor relayer: it already ranked the FULL namespace by
        // importance × recency × relevance and returned the true top-N. Fetch only N
        // blobs (≈3× fewer SEAL decrypts) and keep the relayer's order — no client re-rank.
        if (relayerRanksThreeFactor()) {
            const res = await withMemoryRetry('recall', characterId, () =>
                client.recall(query, limit, namespaceFor(characterId), { today }),
            );
            const out: RecalledMemory[] = [];
            for (const hit of res.results) {
                if ('text' in hit && typeof hit.text === 'string' && hit.text.trim()) {
                    out.push(parseMemory(hit.text));
                }
            }
            console.log(
                `[memory] recall ${characterId.slice(0, 10)}… → ${out.length} memories (relayer three-factor)`,
            );
            return out.slice(0, limit);
        }

        // Managed relayer (top-K by distance): over-fetch ×3 then re-rank client-side by
        // importance × recency × relevance — correct without a three-factor backend.
        const res = await withMemoryRetry('recall', characterId, () =>
            client.recall(query, limit * 3, namespaceFor(characterId), { today }),
        );
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

/** One still-sealed memory blob, JSON-safe for the encrypted-recall API. */
export interface EncryptedMemoryBlob {
    blobId: string;
    /** SEAL ciphertext, base64. Useless without an OwnerCap/ControlCap. */
    dataB64: string;
    distance: number;
}

/**
 * Search + download a character's memory blobs WITHOUT decrypting them.
 *
 * This is the server half of the Owner read path: the server only embeds
 * the query, asks the relayer for the top-N blob ids, and fetches the SEAL
 * ciphertext from Walrus. The admin ControlCap is never exercised — the
 * blobs go back still sealed, and only a browser holding the character's
 * OwnerCap can open them (`decryptWithOwnerCap` + `seal_approve_owner`).
 * Handing ciphertext to an unauthenticated caller is safe by construction:
 * the same bytes are already public on Walrus.
 *
 * No over-fetch ×3 here (unlike recallStructuredForCharacter): every extra
 * blob is an extra wallet-side SEAL decrypt, so we trust distance order for
 * the candidate set and re-rank by importance × recency × relevance after
 * decryption on the client.
 */
export async function recallEncryptedForCharacter(
    characterId: string,
    query: string,
    limit = 24,
): Promise<EncryptedMemoryBlob[]> {
    const client = await clientFor(characterId);
    if (!client) return [];
    try {
        const today = await currentNarrativeDay();
        const res = await withMemoryRetry('recallEncrypted', characterId, () =>
            client.recallEncrypted(query, limit, namespaceFor(characterId), { today }),
        );
        console.log(
            `[memory] recallEncrypted ${characterId.slice(0, 10)}… → ${res.results.length} sealed blobs`,
        );
        return res.results.map((b) => ({
            blobId: b.blob_id,
            dataB64: b.data_b64,
            distance: b.distance,
        }));
    } catch (err) {
        console.warn('[memory] recallEncrypted failed:', err);
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
        const res = await withMemoryRetry('recallForConsolidation', characterId, () =>
            client.recall(query, limit * 3, namespaceFor(characterId)),
        );
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
 * Plan recall is a SEAL decrypt, and the tick loop reads the SAME plan up to
 * 4× per character per tick (PLAN → MOVE → ACT decide → POV). That fan-out
 * was a big chunk of the runner's SEAL 429s. Cache the plan text per
 * character with a short TTL so those reads collapse to one decrypt; writing
 * a new plan (rememberForCharacter kind=plan) invalidates it so the fresh
 * plan still flows through the rest of the tick.
 */
const PLAN_CACHE = new Map<string, { text: string | null; ts: number; source: 'write' | 'recall' }>();
const PLAN_CACHE_TTL_MS = 90_000;

function invalidatePlanCache(characterId: string): void {
    PLAN_CACHE.delete(characterId);
}

/**
 * Recall the character's CURRENT plan (N6) — the latest kind=plan memory.
 *
 * Plans are the character's standing goal + day intent + open subgoals,
 * rewritten each tick. The authoritative "current plan" is the one we last WROTE
 * (rememberForCharacter kind=plan sets a WRITE-set cache entry); that runs in the
 * same web-service process that serves /api/tick AND the dossier, so it's always
 * the freshest. A write-set entry therefore stays valid until the next write — it
 * does NOT expire. Only the cold-start RECALL fallback carries the short TTL.
 *
 * Why: the recall fallback below picks by DAY granularity (`> m.day`), so within a
 * single narrative day (many ticks) it can't tell same-day plans apart and keeps an
 * OLDER one. Ticks are minutes apart (> TTL), so a TTL'd cache used to expire between
 * ticks → fall to that day-granular recall → the dossier/PLAN got STUCK on an old
 * same-day plan. Trusting the write-set cache keeps the freshest plan flowing.
 */
export async function recallCurrentPlanText(characterId: string): Promise<string | null> {
    if (narrativeMemoryOn()) {
        // Latest kind=plan content for this character (no cache needed — the store is
        // process-local and authoritative; newest plan = highest seq).
        const list = NARRATIVE_STORE.get(characterId);
        if (!list) return null;
        let best: InMemMemory | null = null;
        for (const m of list) {
            if (m.kind !== 'plan') continue;
            if (!best || m.seq > best.seq) best = m;
        }
        return best?.content ?? null;
    }
    const cached = PLAN_CACHE.get(characterId);
    // Write-set = authoritative (the plan we just stored) → never stale. Recall-set =
    // cold-start best-effort → honour the TTL so it re-recalls.
    if (cached && (cached.source === 'write' || Date.now() - cached.ts < PLAN_CACHE_TTL_MS)) {
        return cached.text;
    }

    const client = await clientFor(characterId);
    if (!client) return null;
    try {
        const res = await withMemoryRetry(
            'recallCurrentPlan',
            characterId,
            () =>
                client.recall(
                    '我的目標 長期打算 此刻想做的事 未竟之事 計畫',
                    18,
                    namespaceFor(characterId),
                ),
        );
        let best: RecalledMemory | null = null;
        for (const hit of res.results) {
            if ('text' in hit && typeof hit.text === 'string' && hit.text.trim()) {
                const m = parseMemory(hit.text);
                if (m.kind !== 'plan') continue;
                if (!best || (m.day ?? -1) > (best.day ?? -1)) best = m;
            }
        }
        const text = best?.text ?? null;
        PLAN_CACHE.set(characterId, { text, ts: Date.now(), source: 'recall' });
        return text;
    } catch (err) {
        console.warn('[memory] recallCurrentPlanText failed:', err);
        return null;
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
    const kind = opts?.kind ?? 'observation';
    const importance = opts?.importance ?? DEFAULT_IMPORTANCE[kind] ?? 5;
    const day = await currentNarrativeDay();
    if (narrativeMemoryOn()) {
        // In-memory store: embed + push, no relayer/SEAL/Walrus. Stores the RAW text
        // (no `[[m|...]]` tag) since recall returns content directly and the tag would
        // only pollute the embedding.
        return narrativeRemember(characterId, text, kind, importance, day);
    }
    const client = await clientFor(characterId);
    if (!client) return false;
    try {
        const tagged = tagMemory(text, kind, importance, day, opts?.anchored ?? false);
        const ns = namespaceFor(characterId);
        // Index metadata so a self-hosted three-factor relayer can rank the full namespace.
        // The encrypted blob still carries the tag (`tagged`), so display/parse is unchanged;
        // `embedText` is the RAW text so the `[[m|...]]` tag doesn't pollute the vector.
        const meta = { importance, day, kind, anchored: opts?.anchored ?? false, embedText: text };
        // MemWal's testnet relayer / SEAL occasionally 500s (or 429s / drops the
        // connection) transiently. Retry those a couple times with backoff so a
        // single hiccup doesn't leave a character memory-less; 4xx (bad payload /
        // auth) fail fast since retrying won't help.
        const MAX_TRIES = 3;
        for (let attempt = 1; ; attempt += 1) {
            try {
                await client.remember(tagged, ns, meta);
                break;
            } catch (err) {
                const status = (err as { status?: number })?.status;
                const transient = status === undefined || status >= 500 || status === 429;
                if (!transient || attempt >= MAX_TRIES) throw err;
                console.warn(
                    `[memory] remember ${characterId.slice(0, 10)}… attempt ${attempt}/${MAX_TRIES} ` +
                        `transient(${status ?? 'net'}); retrying…`,
                );
                await new Promise((r) => setTimeout(r, 600 * attempt));
            }
        }
        // A new plan supersedes the cached one — keep it hot (WRITE-set: authoritative,
        // never expires) so MOVE/SOCIAL/POV + the dossier read the freshest plan, not a
        // day-granular recall of an older same-day plan.
        if (kind === 'plan') {
            PLAN_CACHE.set(characterId, { text, ts: Date.now(), source: 'write' });
            // Persist the outward one-liners (此刻心境 / 將往何方) as durable plaintext so
            // the public dossier bar reads them without a flaky SEAL decrypt. Best-effort.
            writePlanIntentFromText(characterId, text, day);
        }
        console.log(
            `[memory] remember ${characterId.slice(0, 10)}… ✓ [${kind} i=${importance}${
                opts?.anchored ? ' anchored' : ''
            }] (${text.length} chars)`,
        );
        return true;
    } catch (err) {
        console.warn('[memory] remember failed (after retries):', err);
        return false;
    } finally {
        client.destroy();
    }
}
