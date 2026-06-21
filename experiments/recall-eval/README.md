# Recall eval harness

Offline test bench for MemWal three-factor recall. Answers one question: **does writing
an entire multi-topic POV chapter as one memory (current behavior) hurt recall, and which
write-time pre-processing fixes it?**

It decouples the two knobs that drive recall quality and measures each in isolation:

1. **write-time pre-processing** — how a memory's text becomes the embedded vector
   (`raw` / `extractive` / `summary` / `chunk` / `chunk+dedup`).
2. **scoring weights** — `importance × recency × relevance`, half-life, multiply-vs-sum.

It reuses the **real** scorer (`../../../packages/relayer/src/score.ts`) and the **same**
embedding model the live client uses (`text-embedding-3-small`), so the cosine numbers match
production.

> **Status:** parked in the gitignored `internal/` tree as paper material. **Headline
> finding:** under real-spec chapters (700–1100 字, 4–7 段) no write-time pre-processing or
> weight change beats the current `raw + halfLife=2`; `summary` embedText is strictly worse.
> Full reasoning in `RESULTS.md`.

## Run

```bash
nvm use                                      # node >= 23 (native .ts type-stripping)
export OPENAI_API_KEY=...                      # any OpenAI key (embeddings + gpt-4o-mini for summary)
node internal/research/recall-eval/run.ts      # from repo root
```

Embeddings + LLM summaries are cached under `.cache/` (keyed by content hash) — the first
run costs a few cents of embeddings; re-runs are free and deterministic. The whole
`internal/` tree is gitignored.

## Files

| file | role |
|------|------|
| `corpus.ts` | one character's memory namespace (葉庭芳/《白蛇傳》), segment-tagged with the *facts* each carries; queries + ground-truth relevant facts. Evaluation unit = **fact**, so chunk (N records) and raw (1 record) compare fairly. |
| `preprocess.ts` | the strategies: how source memories become stored records + `embedText`. |
| `embed.ts` | cached OpenAI embedding + retrieval-summary. Key from env only. |
| `metrics.ts` | fact-based Recall@K / Precision@K / nDCG@K, discrimination. |
| `run.ts` | builds each namespace, ranks every query through `score.ts`, prints the report. |

## Extending

- New scenario: add `SourceMemory`s + `EvalQuery`s to `corpus.ts` (tag segments with facts).
- New strategy: add a branch in `preprocess.ts` and an entry in `SPECS` (`run.ts`).
- Tune weights: edit the `configs` in `reportWeightSweep` (`run.ts`).

See `RESULTS.md` for the findings this bench produced.
