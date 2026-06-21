// Recall eval harness — main entry.
//
//   node internal/research/recall-eval/run.ts   (needs OPENAI_API_KEY in env; node >= 23 for .ts)
//
// For each write-time strategy (raw / extractive / summary / chunk / chunk+dedup) it
// builds the namespace, embeds with the SAME model production uses, ranks every query
// through the REAL three-factor scorer (packages/relayer/src/score.ts), and reports
// fact-level Recall@K / Precision@K / nDCG@K at K=3 and K=6, a top-K diff, a dilution
// table for the long chapter, and a weight sweep.

// Imports the REAL production scorer from the relayer package (this harness now lives in
// the gitignored internal/ tree; the relative path reaches back into the versioned src).
import { cosineSimilarity, scoreNamespace } from '../../../packages/relayer/src/score.ts';
import type { MemoryRecord } from '../../../packages/relayer/src/types.ts';
import { FACTS, QUERIES, SOURCE_MEMORIES } from './corpus.ts';
import { prepare, type PreparedMemory, type Strategy } from './preprocess.ts';
import { embed, flush, keyPresent, summarize } from './embed.ts';
import {
    aggregate,
    discrimination,
    f3,
    pct,
    scoreQuery,
    type RankedHit,
} from './metrics.ts';

const TODAY = 5; // narrative day "now" (corpus runs day 0-4)
const HALF_LIFE = 2; // production default

interface Spec {
    label: string;
    strategy: Strategy;
    dedup: boolean; // per-source dedup at recall time (keep best record per memory)
}
const SPECS: Spec[] = [
    { label: 'raw', strategy: 'raw', dedup: false },
    { label: 'extractive', strategy: 'extractive', dedup: false },
    { label: 'summary', strategy: 'summary', dedup: false },
    { label: 'chunk', strategy: 'chunk', dedup: false },
    { label: 'chunk+dedup', strategy: 'chunk', dedup: true },
];

function bar(label = ''): string {
    return `\n${'═'.repeat(80)}${label ? '\n' + label : ''}`;
}

// ---- per-strategy namespace build (cached so chunk & chunk+dedup share embeds) --------
interface Prep {
    prepared: PreparedMemory[];
    vecs: Map<string, number[]>;
    records: MemoryRecord[];
}
const prepCache = new Map<Strategy, Prep>();

async function getPrep(strategy: Strategy): Promise<Prep> {
    const cached = prepCache.get(strategy);
    if (cached) return cached;
    const prepared = await prepare(strategy, summarize);
    const vecs = new Map<string, number[]>();
    for (const p of prepared) vecs.set(p.id, await embed(p.embedText));
    const records: MemoryRecord[] = prepared.map((p) => ({
        blob_id: p.id,
        vector: vecs.get(p.id)!,
        importance: p.importance,
        day: p.day,
        kind: p.kind,
        anchored: p.anchored,
        created_at: 0,
    }));
    const prep = { prepared, vecs, records };
    prepCache.set(strategy, prep);
    flush();
    return prep;
}

function rank(prep: Prep, qvec: number[], dedup: boolean): RankedHit[] {
    const byId = new Map(prep.prepared.map((p) => [p.id, p]));
    const hits = scoreNamespace(prep.records, qvec, {
        today: TODAY,
        halfLife: HALF_LIFE,
        limit: 80,
    });
    const seen = new Set<string>();
    const out: RankedHit[] = [];
    for (const h of hits) {
        const p = byId.get(h.blob_id)!;
        if (dedup) {
            if (seen.has(p.sourceId)) continue;
            seen.add(p.sourceId);
        }
        out.push({
            id: p.id,
            sourceId: p.sourceId,
            facts: p.facts,
            score: h.score,
            cosine: 1 - h.distance,
            chars: p.text.length,
        });
    }
    return out;
}

interface SpecRun {
    spec: Spec;
    recordCount: number;
    perQuery: { qid: string; ranked: RankedHit[] }[];
}

async function runSpec(spec: Spec): Promise<SpecRun> {
    const prep = await getPrep(spec.strategy);
    const perQuery: { qid: string; ranked: RankedHit[] }[] = [];
    for (const q of QUERIES) {
        const qvec = await embed(q.text);
        perQuery.push({ qid: q.id, ranked: rank(prep, qvec, spec.dedup) });
    }
    return { spec, recordCount: prep.prepared.length, perQuery };
}

function aggAt(run: SpecRun, k: number) {
    const ms = QUERIES.map((q) =>
        scoreQuery(run.perQuery.find((p) => p.qid === q.id)!.ranked, q.relevantFacts, k),
    );
    const discs = run.perQuery.map((p) => discrimination(p.ranked, k));
    return { ...aggregate(ms), disc: discs.reduce((a, b) => a + b, 0) / discs.length };
}

function reportMain(runs: SpecRun[]): void {
    console.log(
        bar('A. 策略 × 召回品質（三因子=score.ts，halfLife=2，today=5）'),
    );
    console.log(
        '  ' +
            'strategy'.padEnd(13) +
            'recs'.padEnd(6) +
            'R@3'.padEnd(8) +
            'R@6'.padEnd(8) +
            'P@3'.padEnd(8) +
            'nDCG@3'.padEnd(9) +
            'nDCG@6'.padEnd(9) +
            'discr@3',
    );
    for (const r of runs) {
        const a3 = aggAt(r, 3);
        const a6 = aggAt(r, 6);
        console.log(
            '  ' +
                r.spec.label.padEnd(13) +
                String(r.recordCount).padEnd(6) +
                pct(a3.recall).padEnd(8) +
                pct(a6.recall).padEnd(8) +
                pct(a3.precision).padEnd(8) +
                f3(a3.ndcg).padEnd(9) +
                f3(a6.ndcg).padEnd(9) +
                f3(a3.disc),
        );
    }
}

function reportPerQueryRecall(runs: SpecRun[], k: number): void {
    console.log(bar(`B. 逐查詢 Recall@${k}（應召回的 fact 覆蓋率）`));
    console.log('  ' + 'query'.padEnd(14) + runs.map((r) => r.spec.label.padEnd(13)).join(''));
    for (const q of QUERIES) {
        let line = '  ' + q.id.padEnd(14);
        for (const r of runs) {
            const m = scoreQuery(
                r.perQuery.find((p) => p.qid === q.id)!.ranked,
                q.relevantFacts,
                k,
            );
            line += pct(m.recall).padEnd(13);
        }
        console.log(line);
    }
}

function reportMissed(runs: SpecRun[], k: number): void {
    console.log(bar(`C. K=${k} 漏掉的 fact（raw 漏的就是稀釋擠出 top-K 的）`));
    for (const r of runs) {
        const missed = new Set<string>();
        for (const q of QUERIES) {
            const m = scoreQuery(
                r.perQuery.find((p) => p.qid === q.id)!.ranked,
                q.relevantFacts,
                k,
            );
            m.missed.forEach((f) => missed.add(f));
        }
        console.log(`  ${r.spec.label.padEnd(13)} ${missed.size ? [...missed].join(', ') : '— 無漏'}`);
    }
}

function reportTopK(runs: SpecRun[], qid: string, k = 6): void {
    const q = QUERIES.find((x) => x.id === qid)!;
    console.log(bar(`D. top-${k} 對照 — ${qid}「${q.text}」`));
    console.log(`  ground-truth: ${q.relevantFacts.join(', ')}`);
    for (const label of ['raw', 'chunk+dedup']) {
        const r = runs.find((x) => x.spec.label === label)!;
        const ranked = r.perQuery.find((p) => p.qid === qid)!.ranked.slice(0, k);
        console.log(`\n  [${label}]`);
        ranked.forEach((h, i) => {
            const rel = h.facts.some((f) => q.relevantFacts.includes(f)) ? '✓' : ' ';
            console.log(
                `   ${rel}${String(i + 1).padStart(2)}. ${h.id.padEnd(18)} ` +
                    `score=${f3(h.score)} cos=${f3(h.cosine)} [${h.facts.join(',') || '—'}]`,
            );
        });
    }
}

async function reportDilution(): Promise<void> {
    console.log(bar('E. 稀釋對照 — M3_day3_night 長章回（整篇 embedding vs 該主題的 segment）'));
    const m3 = SOURCE_MEMORIES.find((m) => m.id === 'M3_day3_night')!;
    const fullVec = await embed(m3.segments.map((s) => s.text).join('\n\n'));
    const segVecs = await Promise.all(m3.segments.map((s) => embed(s.text)));
    console.log('  ' + 'query'.padEnd(14) + 'cos整篇'.padEnd(11) + 'cos該段'.padEnd(11) + '稀釋損失');
    for (const q of QUERIES) {
        const qvec = await embed(q.text);
        const cosFull = cosineSimilarity(qvec, fullVec);
        let best = -1;
        segVecs.forEach((v) => {
            const c = cosineSimilarity(qvec, v);
            if (c > best) best = c;
        });
        const loss = best > 0 ? (best - cosFull) / best : 0;
        console.log(
            '  ' + q.id.padEnd(14) + f3(cosFull).padEnd(11) + f3(best).padEnd(11) + (loss >= 0 ? pct(loss) : 'n/a'),
        );
    }
}

function scoreVariant(
    records: MemoryRecord[],
    qvec: number[],
    mode: 'mul' | 'sum',
    halfLife: number,
): { blob_id: string; score: number }[] {
    const floor = 0.1;
    const PIN = new Set(['plan', 'genesis']);
    const out: { blob_id: string; score: number }[] = [];
    for (const r of records) {
        const sim = Math.max(0, cosineSimilarity(qvec, r.vector));
        const pinned = r.anchored || PIN.has(r.kind);
        if (!pinned && sim < floor) continue;
        const iW = Math.max(1, Math.min(10, r.importance)) / 10;
        const rW = halfLife <= 0 ? 1 : Math.pow(0.5, Math.max(0, TODAY - r.day) / halfLife);
        out.push({ blob_id: r.blob_id, score: mode === 'mul' ? iW * rW * sim : (iW + rW + sim) / 3 });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
}

async function reportWeightSweep(): Promise<void> {
    const configs: { label: string; mode: 'mul' | 'sum'; hl: number }[] = [
        { label: 'mul, halfLife=2 (現狀)', mode: 'mul', hl: 2 },
        { label: 'mul, halfLife=4', mode: 'mul', hl: 4 },
        { label: 'mul, recency off', mode: 'mul', hl: 0 },
        { label: 'sum, halfLife=2', mode: 'sum', hl: 2 },
    ];
    for (const strat of ['raw', 'chunk'] as Strategy[]) {
        console.log(bar(`F. 權重 sweep on「${strat}」（mul=現狀相乘, sum=等權；K=3 與 K=6）`));
        const prep = await getPrep(strat);
        const byId = new Map(prep.prepared.map((p) => [p.id, p]));
        console.log('  ' + 'config'.padEnd(24) + 'R@3'.padEnd(8) + 'R@6'.padEnd(8) + 'nDCG@3'.padEnd(9) + 'discr@3');
        for (const cfg of configs) {
            const ms3 = [];
            const ms6 = [];
            const discs: number[] = [];
            for (const q of QUERIES) {
                const qvec = await embed(q.text);
                const scored = scoreVariant(prep.records, qvec, cfg.mode, cfg.hl);
                const ranked: RankedHit[] = scored.map((s) => {
                    const p = byId.get(s.blob_id)!;
                    return { id: p.id, sourceId: p.sourceId, facts: p.facts, score: s.score, cosine: 0, chars: p.text.length };
                });
                ms3.push(scoreQuery(ranked, q.relevantFacts, 3));
                ms6.push(scoreQuery(ranked, q.relevantFacts, 6));
                discs.push(discrimination(ranked, 3));
            }
            console.log(
                '  ' +
                    cfg.label.padEnd(24) +
                    pct(aggregate(ms3).recall).padEnd(8) +
                    pct(aggregate(ms6).recall).padEnd(8) +
                    f3(aggregate(ms3).ndcg).padEnd(9) +
                    f3(discs.reduce((a, b) => a + b, 0) / discs.length),
            );
        }
    }
}

async function main(): Promise<void> {
    if (!keyPresent()) {
        console.error('OPENAI_API_KEY not set in env.');
        process.exit(1);
    }
    console.log(
        `facts=${Object.keys(FACTS).length}  source-memories=${SOURCE_MEMORIES.length}  queries=${QUERIES.length}`,
    );
    const runs: SpecRun[] = [];
    for (const spec of SPECS) {
        process.stderr.write(`  …${spec.label}\n`);
        runs.push(await runSpec(spec));
    }
    reportMain(runs);
    reportPerQueryRecall(runs, 3);
    reportMissed(runs, 3);
    reportTopK(runs, 'Q2_shen', 6);
    reportTopK(runs, 'Q1_shuixiu', 6);
    await reportDilution();
    await reportWeightSweep();
    flush();
    console.log('\n' + '═'.repeat(80) + '\ndone.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
