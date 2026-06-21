// Recall-quality metrics, fact-based so chunk (N records) and raw (1 record) compare
// fairly: the unit is "did the right FACT surface in top-K", not "which memory id".

export interface RankedHit {
    id: string;
    sourceId: string;
    facts: string[];
    /** composite three-factor score the ranking used. */
    score: number;
    /** raw cosine(query, embedText) before importance/recency weighting. */
    cosine: number;
    /** length of the stored prose (for "long memory hogging" inspection). */
    chars: number;
}

export interface QueryMetrics {
    recall: number;
    precision: number;
    ndcg: number;
    coveredRel: string[];
    missed: string[];
}

function dcg(rels: number[]): number {
    return rels.reduce((s, r, i) => s + r / Math.log2(i + 2), 0);
}

export function ndcg(rels: number[]): number {
    const ideal = [...rels].sort((a, b) => b - a);
    const idcg = dcg(ideal);
    return idcg === 0 ? 0 : dcg(rels) / idcg;
}

export function median(xs: number[]): number {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Score one query's ranking against its ground-truth relevant facts. */
export function scoreQuery(
    ranked: RankedHit[],
    relevantFacts: string[],
    k: number,
): QueryMetrics {
    const top = ranked.slice(0, k);
    const relSet = new Set(relevantFacts);
    const covered = new Set<string>();
    const rels: number[] = [];
    let hitRecords = 0;
    for (const r of top) {
        const hit = r.facts.some((f) => relSet.has(f));
        rels.push(hit ? 1 : 0);
        if (hit) hitRecords += 1;
        for (const f of r.facts) if (relSet.has(f)) covered.add(f);
    }
    return {
        recall: relSet.size ? covered.size / relSet.size : 0,
        precision: top.length ? hitRecords / top.length : 0,
        ndcg: ndcg(rels),
        coveredRel: [...covered],
        missed: relevantFacts.filter((f) => !covered.has(f)),
    };
}

export interface Aggregate {
    recall: number;
    precision: number;
    ndcg: number;
}

export function aggregate(ms: QueryMetrics[]): Aggregate {
    const mean = (f: (m: QueryMetrics) => number) =>
        ms.length ? ms.reduce((s, m) => s + f(m), 0) / ms.length : 0;
    return {
        recall: mean((m) => m.recall),
        precision: mean((m) => m.precision),
        ndcg: mean((m) => m.ndcg),
    };
}

/** top-1 vs median(top-K) score gap — how well the ranking separates the best hit from
 *  the pack. Higher = more discriminative (less score compression). */
export function discrimination(ranked: RankedHit[], k: number): number {
    const top = ranked.slice(0, k).map((r) => r.score);
    if (top.length < 2) return 0;
    return top[0] - median(top);
}

export const pct = (x: number): string => (x * 100).toFixed(1) + '%';
export const f3 = (x: number): string => x.toFixed(3);
