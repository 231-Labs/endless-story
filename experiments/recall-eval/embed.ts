// Embedding + LLM-summary with on-disk cache.
//
// Same embedding model the live client uses (text-embedding-3-small, manual.ts:619), so
// the cosine numbers here match production. Results are cached under eval/.cache (keyed by
// content hash) so re-runs cost nothing and stay deterministic. OPENAI_API_KEY is read
// from the environment only — never written to disk or logged.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Kind } from './corpus.ts';

const CACHE_DIR = join(import.meta.dirname, '.cache');
const EMB_CACHE = join(CACHE_DIR, 'embeddings.json');
const SUM_CACHE = join(CACHE_DIR, 'summaries.json');

const KEY = process.env.OPENAI_API_KEY ?? '';
const BASE = (
    process.env.OPENAI_API_BASE ??
    process.env.OPENAI_BASE_URL ??
    'https://api.openai.com/v1'
).replace(/\/$/, '');
const EMBED_MODEL = process.env.EVAL_EMBED_MODEL ?? 'text-embedding-3-small';
const SUMMARY_MODEL = process.env.EVAL_SUMMARY_MODEL ?? 'gpt-4o-mini';

function load(p: string): Record<string, unknown> {
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}
const embCache = load(EMB_CACHE) as Record<string, number[]>;
const sumCache = load(SUM_CACHE) as Record<string, string>;
let embDirty = false;
let sumDirty = false;

const hash = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 20);

export function flush(): void {
    mkdirSync(CACHE_DIR, { recursive: true });
    if (embDirty) {
        writeFileSync(EMB_CACHE, JSON.stringify(embCache));
        embDirty = false;
    }
    if (sumDirty) {
        writeFileSync(SUM_CACHE, JSON.stringify(sumCache));
        sumDirty = false;
    }
}

async function postJson(path: string, body: unknown): Promise<any> {
    if (!KEY) throw new Error('OPENAI_API_KEY not set in env');
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const resp = await fetch(`${BASE}${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${KEY}`,
                },
                body: JSON.stringify(body),
            });
            if (!resp.ok) {
                const t = await resp.text();
                const err = new Error(`${path} ${resp.status}: ${t.slice(0, 200)}`);
                // 4xx (except 429) won't get better on retry.
                if (resp.status < 500 && resp.status !== 429) throw err;
                lastErr = err;
            } else {
                return resp.json();
            }
        } catch (e) {
            lastErr = e;
        }
        await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    throw lastErr;
}

export async function embed(text: string): Promise<number[]> {
    const k = hash(`${EMBED_MODEL}::${text}`);
    const hit = embCache[k];
    if (hit) return hit;
    const j = await postJson('/embeddings', { model: EMBED_MODEL, input: text });
    const v = j?.data?.[0]?.embedding;
    if (!Array.isArray(v)) throw new Error('embedding API returned no vector');
    embCache[k] = v;
    embDirty = true;
    return v;
}

const SUMMARY_SYSTEM =
    '你是角色記憶的檢索索引器。為下面這段記憶寫一條「檢索用摘要」：' +
    '列出其中的人物、地點、關鍵動作、情感與重要物件，用詞盡量貼近原文（務必保留人名、戲名、物件等專有名詞）。' +
    '40到80字，輸出單行純文字，只給摘要本身，不要任何前綴或解釋。';

export async function summarize(prose: string, kind: Kind): Promise<string> {
    const k = hash(`${SUMMARY_MODEL}::${kind}::${prose}`);
    const hit = sumCache[k];
    if (hit) return hit;
    const j = await postJson('/chat/completions', {
        model: SUMMARY_MODEL,
        temperature: 0,
        messages: [
            { role: 'system', content: SUMMARY_SYSTEM },
            { role: 'user', content: `【記憶種類】${kind}\n【記憶原文】\n${prose}` },
        ],
    });
    const s = j?.choices?.[0]?.message?.content?.trim();
    if (!s) throw new Error('summary API returned no content');
    sumCache[k] = s;
    sumDirty = true;
    return s;
}

export function keyPresent(): boolean {
    return Boolean(KEY);
}
