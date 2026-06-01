# Figures

Academic-style figures of the engine's behaviour, plotted from **real engine traces**
(not illustrative sketches). They back the Results section of [`../WRITEUP.md`](../WRITEUP.md).

| File | What it shows |
|---|---|
| `fig1_contested.png` | Step 1 — legible ~7-beat rivalry over the 孟雲屏 slot; loser's tension spikes (▼) drive each re-seize. |
| `fig2_regimes.png` | Step 1 — three regimes from the SAME engine: (a) symmetric trading, (b) unrequited longing, (c) ablation → oscillation reappears. |
| `fig3_tradeoff.png` | Step 2 — the 柳生春 moment: two desires, one finite budget; neither ever reaches "well satisfied" (forced neglect). Lower panel: wanting=2 but funded≤1 every beat. |
| `fig4_ablation.png` | Step 2 — single-variable ablation: relax ONLY 柳生春's budget ⇒ forced-choice 120→2, both-satisfied 0→66. The budget is the cause. |

## Reproduce

From `packages/drama/`:

```bash
node driver/export-traces.ts > figures/traces.json   # dump real traces (deterministic)
python3 figures/plot.py                              # writes figures/fig{1..4}_*.png
```

`plot.py` needs `matplotlib` + `numpy` and a CJK-capable font (defaults to macOS
"Arial Unicode"; override with `DRAMA_CJK_FONT=/path/to/font.ttf`). It contains **no engine
logic** — all numbers come from `traces.json`, which `export-traces.ts` produces by running
the same scenarios the tests use.

`traces.json` is regenerable and git-ignored; the PNGs are committed so the writeup renders
without a Python toolchain.
