# Pitch decks

Self-contained slide decks for 無盡敘界 / Endless Story.

- `endless-story-pitch-light.html` — 主簡報（含 4 張「幕後研究 / Drama Engine」投影片，第 7–10 頁）
- `endless-story-pitch-light-en.html` — 英文版
- `endless-story-pitch.html` — 早期深色版
- `assets/` — 投影片用到的圖（logo + 兩張引擎實驗圖）

## 開啟方式

整個 `pitch/` 資料夾是自包含的（圖都在 `assets/`，不依賴 repo 其餘部分）。

- 直接雙擊 `endless-story-pitch-light.html`（file:// 即可），或
- `python3 -m http.server` 後瀏覽器開 `…/pitch/endless-story-pitch-light.html`

翻頁：← → 或空白鍵；網址加 `#all` 一次看全部。

## 資產來源（如需更新）

`assets/` 的圖是從產品 repo 複製來的快照：
- `assets/logo.png` ← `packages/web/public/logo.png`
- `assets/fig1_contested.png`, `assets/fig3_tradeoff.png` ← `packages/drama/figures/`
  （由 `node driver/export-traces.ts` + `python3 figures/plot.py` 重生）
