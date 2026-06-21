# Recall eval — findings

Bench: 32 source memories (1 character namespace), 12 facts, 5 queries. Scorer =
`../src/score.ts` (importance × recency × relevance). Embedding = `text-embedding-3-small`.
Evaluation unit = fact (so chunk vs raw compare fairly).

Two corpus variants were run, and **they disagree** — which is the whole point:

- **v1 — short chapters** (M3 ≈ 600 字 / 5 段): chunk won.
- **v2 — real spec** (M3 = 889 字 / 7 段, M7 = 518 字 / 5 段, with filler paragraphs,
  matching character-worker/prompt.ts: 700–1100 字, 4–7 段): **the win evaporated.**

The numbers below are v2 (real spec), because that is what production actually writes.

## A. Strategy × recall quality (real-spec corpus)

| strategy | records | R@3 | R@6 | P@3 | nDCG@3 | nDCG@6 |
|----------|---------|-----|-----|-----|--------|--------|
| **raw (current)** | 32 | **90.0%** | **100%** | **53.3%** | **0.826** | 0.803 |
| extractive | 32 | 80.0% | 100% | 40.0% | 0.726 | 0.807 |
| summary    | 32 | 70.0% | 80.0% | 40.0% | 0.665 | 0.666 |
| chunk      | 42 | 70.0% | 90.0% | 46.7% | 0.726 | 0.791 |
| chunk+dedup| 42 | 70.0% | 80.0% | 46.7% | 0.726 | 0.796 |

Under real-spec chapters, **nothing beats raw**.

## B. Weight sweep — halfLife interacts with the strategy (opposite directions)

| config | raw R@3 / nDCG@3 | chunk R@3 / nDCG@3 |
|--------|------------------|--------------------|
| mul, halfLife=2 (current) | **90% / 0.826** | 70% / 0.726 |
| mul, halfLife=4 | 80% / 0.684 | **80% / 0.884** |
| mul, recency off | 80% / 0.668 | 80% / 0.894 |
| sum, halfLife=2 | 60% / 0.600 | 70% / 0.726 |

`halfLife=2 + multiply` is already a **local optimum for raw**. Widening it *hurts* raw.
(chunk wants halfLife=4 — but chunk doesn't win in the first place.)

## C. Why the reversal

1. **Dilution is real** (E table: a buried sub-topic loses 24–33% cosine vs. its own
   segment). That part of the v1 story holds.

2. **But "whole chapter" is accidentally a broad net.** A 4–5-topic chapter has medium
   cosine to *any* query touching *any* of its topics, so it gets dragged into top-K and
   covers the fact. Chunking replaces that with narrow, deep vectors that only fire on a
   precise topical match — and in a namespace full of chunks + filler, a narrow chunk for
   a weak/diffuse query (Q4「梁照水＋魚湯」) sinks. raw 50% → chunk **0%** on Q4.

3. **Importance crushes narrow chunks.** A chapter chunk is still i=5. Split into many
   narrow i=5 records, each must out-score i=7/8/9 reflections/relationships/dreams. A
   narrow chunk with medium cosine loses to a pinned high-importance memory; the whole
   chapter (broader cosine) didn't.

4. **Real chapters are mostly atmosphere.** ~30% of a real chapter is scene-setting prose
   carrying no recallable fact. Chunking turns that into standalone noise records that add
   competition without adding signal.

## D. The one robust finding

**`summary` / `extractive` embedText is a net loss in both corpus variants** (lossy
compression drops sub-topic anchors). Do not ship it.

## E. Recommendation

For the **current production parameters** (700–1100 字 multi-topic chapters, three-factor
multiply, halfLife=2), the bench could not find a write-time pre-processing or weight
change that beats what's already shipping. Specifically:

- **Do NOT chunk** as a blanket change: no net recall win at this scale, and it costs 4–7×
  MemWal writes (SEAL/Walrus) per chapter.
- **Do NOT widen halfLife for raw**: 2 is already its optimum; 4 drops R@3 90% → 80%.
- **Do NOT summarize the embedText**: strictly worse, both variants.
- The current design's strong reliance on recency is, it turns out, *compensating* for the
  dilution rather than being broken by it.

## F. Caveats (where this could flip)

- **Scale.** 32–42 records ≪ the "hundreds–thousands" real namespaces. Larger scale
  amplifies *both* dilution (helps chunk) and narrow-chunk drowning (hurts chunk) — which
  dominates is unproven above this size.
- **Synthetic corpus + hand-labeled ground truth** (5 queries / 12 facts). Query mix
  drives the result; diffuse queries (Q4) punish chunk hardest.
- **Where chunk still helps:** precise single-topic queries (Q1 水袖) get cleaner top-K
  under chunk. If real agent queries skew precise/topical rather than diffuse, chunk's
  case improves. Worth a larger-scale rerun before ruling it out for good.
