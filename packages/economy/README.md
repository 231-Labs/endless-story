# @endless-story/economy

Pure, zero-dependency **character-economy core** + offline validation harness.

Design + decisions: **[docs/CHARACTER_ECONOMY.md](../../docs/CHARACTER_ECONOMY.md)**.

This package is Part C of that plan: it **academically validates** the life-cycle mechanism
(does it actually work?) BEFORE any productization. Same discipline as `packages/drama` — the
pure `settleDay()` transition here is the single source of truth that `contracts/.../economy.move`
and the web adapter will later reuse, never reimplement.

## Layout
- `src/` — pure core. `fixed.ts` (bigint fixed-point), `types.ts`, `derive.ts` (dailyCost /
  salary / vitality / level / lifeStage), `settle.ts` (`settleDay` — the one transition).
- `driver/` — offline simulator: `run.ts` (policy → settle → record), `metrics.ts`
  (failure-mode + 5-hypothesis metrics), `report.ts`.
- `scenarios/` — `cohort.ts` (thriving / starving / mixed-cohort / payroll-stress),
  `alliance.ts` (alliance on/off ablation).
- `test/` — `core.test.ts` (conservation, bounded, determinism, golden vector),
  `step1.test.ts` (the 5 hypotheses).

## Run (Node ≥ 23.6 for native TS type-stripping — repo `.nvmrc` = 23.7.0)
```
node --test "test/**/*.test.ts"     # invariants + hypotheses
node driver/report.ts               # headline metrics + PASS/FAIL gate (text)
node driver/html-report.ts          # → report/index.html (charts + academic write-up)
```

## What's validated (all green)
H1 viable steady state · H2 no immortality (memory rent always wins eventually) ·
H3 generational turnover · H4 alliances are causally helpful · H5 no pathology ·
H6 owner subsidy keeps a reader-less character alive at bounded, affordable cost ·
plus per-day **conservation** of the single Endless currency.
