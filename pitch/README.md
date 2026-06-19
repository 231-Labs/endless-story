# Pitch decks

自包含的簡報（無盡敘界 / Endless Story）。圖都在 `assets/`，不依賴 repo 其餘部分。

## Single source of truth

**`endless-story-pitch-light.html` 是唯一正本（主簡報，中文，18 頁）。** 任何內容改動以它為準，其餘檔案都是它的衍生，不獨立演化。

| 檔案 | 角色 | 狀態 |
|---|---|---|
| `endless-story-pitch-light.html` | **正本 · 主簡報（中文，18 頁）** | ✅ 維護這份 |
| `endless-story-pitch-light-en.html` | 英文版（正本的翻譯） | ⚠️ 目前 12 頁、落後正本（缺戲劇引擎護城河 4 頁＋生命週期）——待同步 |
| `endless-story-architecture-map.html` | 架構圖（補充） | 獨立小圖，非簡報 |
| `assets/` | 圖（logo + 兩張引擎實驗圖） | — |

> 早期深色版 `endless-story-pitch.html` 已於 2026-06-19 移除（被 light 版取代，避免「開錯檔看到舊內容」）。需要時從 git 歷史取回。

**改簡報的規矩**：只改正本；EN 要嘛當正本的忠實翻譯一次補齊、要嘛明確標成「精簡英文版」，不要讓它自己長出不同內容。

## 開啟方式

直接雙擊 `endless-story-pitch-light.html`（`file://` 即可），或 `python3 -m http.server` 後開
`…/pitch/endless-story-pitch-light.html`。

翻頁：← → 或空白鍵；網址加 `#all` 一次看全部。

## 資產來源（如需更新）

`assets/` 的圖是從產品 repo 複製來的快照：
- `assets/logo.png` ← `packages/web/public/logo.png`
- `assets/fig1_contested.png`, `assets/fig3_tradeoff.png` ← `packages/drama/figures/`
  （由 `node driver/export-traces.ts` + `python3 figures/plot.py` 重生）
