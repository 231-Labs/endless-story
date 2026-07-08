/**
 * LocalRecall — the RecallPort for local-first runs. Ports the ES_NARRATIVE
 * in-memory recall out of web `lib/chain/memory.ts` (narrativeEmbed + cosine +
 * importance × recency × relevance scoring) and backs it with a JSON file so a
 * character's memory survives a restart — the same durability the WorldState
 * snapshot gives the world.
 *
 *   · OPENAI_API_KEY set → real text-embedding-3-small (genuine relevance).
 *   · no key            → deterministic token-hash vectors (mechanism only;
 *                          the wiring runs and hits, relevance is crude).
 *
 * LOUD on failure: a configured embedding call that errors THROWS — the tick run
 * fails with a clear message rather than silently recalling nothing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MemoryKind, RecallPort, RecalledMemory, RememberOpts } from '../../ports.ts';

interface StoredMemory {
    content: string;
    embedding: number[];
    kind: MemoryKind;
    day: number;
    importance: number;
    /** insertion order — tiebreaker so newest wins on equal score. */
    seq: number;
}

const EMBED_DIM = 256;
const RECENCY_HALFLIFE_DAYS = 2;
const STORE_FILE = 'recall.json';

/** Recency decay by narrative day (half-life 2 days), from memory-tags.ts. */
function recencyWeight(memDay: number | undefined, today: number): number {
    if (memDay == null) return 1;
    return Math.pow(0.5, Math.max(0, today - memDay) / RECENCY_HALFLIFE_DAYS);
}

/** Relevance from cosine distance (lower distance = closer), from memory-tags.ts. */
function relevanceWeight(distance: number): number {
    if (!Number.isFinite(distance)) return 0.5;
    return Math.max(0.05, 1 - Math.min(1, distance));
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

export class LocalRecall implements RecallPort {
    private store = new Map<string, StoredMemory[]>();
    private seq = 0;
    private readonly file?: string;
    /** Cumulative recall hits — the smoke reports it as a mechanical counter. */
    hits = 0;

    /** @param dir when set, memory is persisted to `<dir>/recall.json`. */
    constructor(dir?: string) {
        this.file = dir ? path.join(dir, STORE_FILE) : undefined;
        this.load();
    }

    private load(): void {
        if (!this.file || !fs.existsSync(this.file)) return;
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as {
            seq: number;
            store: Record<string, StoredMemory[]>;
        };
        this.seq = raw.seq ?? 0;
        this.store = new Map(Object.entries(raw.store ?? {}));
    }

    private save(): void {
        if (!this.file) return;
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(
            this.file,
            JSON.stringify({ seq: this.seq, store: Object.fromEntries(this.store) }, null, 0),
        );
    }

    private async embed(text: string): Promise<number[]> {
        const key = process.env.OPENAI_API_KEY;
        if (key) {
            const apiBase = (process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1').replace(/\/$/, '');
            const model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
            const resp = await fetch(`${apiBase}/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                body: JSON.stringify({ model, input: text.slice(0, 8000) }),
            });
            if (!resp.ok) {
                throw new Error(`[local-recall] embedding API error (${resp.status}): ${await resp.text()}`);
            }
            const data = (await resp.json()) as { data?: { embedding: number[] }[] };
            const vec = data.data?.[0]?.embedding;
            if (!vec) throw new Error('[local-recall] embedding API returned no data');
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

    async remember(characterId: string, text: string, opts: RememberOpts): Promise<boolean> {
        if (!text.trim()) return false;
        const embedding = await this.embed(text);
        const list = this.store.get(characterId) ?? [];
        list.push({
            content: text,
            embedding,
            kind: opts.kind ?? 'observation',
            day: opts.day,
            importance: opts.importance ?? 5,
            seq: this.seq++,
        });
        this.store.set(characterId, list);
        this.save();
        return true;
    }

    async recall(characterId: string, query: string, limit: number, today: number): Promise<RecalledMemory[]> {
        const list = this.store.get(characterId);
        if (!list || list.length === 0) return [];
        const q = await this.embed(query);
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
        this.hits += out.length;
        return out;
    }
}
