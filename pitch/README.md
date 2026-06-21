# Pitch decks

自包含的簡報（無盡敘界 / Endless Story）。圖都在 `assets/`，不依賴 repo 其餘部分。

## Single source of truth

**`endless-story-pitch-light.html` 是唯一正本（主簡報，中文，精簡 9 頁）。** 任何內容改動以它為準，EN 版是它的忠實翻譯（共用同一套 CSS/JS framework）。

| 檔案 | 角色 | 狀態 |
|---|---|---|
| `endless-story-pitch-light.html` | **正本 · 主簡報（中文，9 頁）** | ✅ 維護這份 |
| `endless-story-pitch-light-en.html` | 英文版（正本的翻譯） | ✅ 已與正本同步（9 頁，2026-06-19）；改正本後記得回來同步 |
| `assets/` | 圖（logo） | — |

九頁結構：封面 / 這是什麼 / 從孤島到社會 / 記憶層（護城河）/ Sui 技術棧 / **合約物件架構圖** / 三層架構 / 經濟循環 / 為什麼重要。

> 2026-06-19：簡報由 18 頁長版精簡為 9 頁對外版。原長版與較技術的 `endless-story-architecture-map.html`（會暴露未完成的引擎內情）已移入 gitignored `internal/pitch-archive/`，不對外、不部署。需要時從那裡或 git 歷史取回。早期深色版 `endless-story-pitch.html` 亦早已移除。

**改簡報的規矩**：只改正本中文版；EN 一次補齊成忠實翻譯，不要讓它自己長出不同內容。

## 部署（GitHub Pages）

`pitch/**` 一推上 `main`，`.github/workflows/pages.yml` 會跑 `site/sync.sh` 把整個 `pitch/` 複製進 `site/pitch/` 並發佈：

`https://231-labs.github.io/endless-story/pitch/endless-story-pitch-light.html`

## 開啟方式

直接雙擊 `endless-story-pitch-light.html`（`file://` 即可），或 `python3 -m http.server` 後開
`…/pitch/endless-story-pitch-light.html`。

翻頁：← → 或空白鍵；網址加 `#all` 一次看全部。

## 資產來源（如需更新）

命名規則：`{用途}-{light|dark}.png`，跟 logo 一致用 kebab-case。

**README 用（深淺色切換）**

| 檔案 | 內容 |
|---|---|
| `hero-light.png` / `hero-dark.png` | 春雪社首頁 |
| `cinema-light.png` / `cinema-dark.png` | 角色頁 + 章回預告列 |
| `logo-light.png` / `logo-dark.png` | 由 `logo.png` 著色，對應網站 `--color-cinnabar`（日 `#B04A3C` / 夜 `#CCA45C`） |

**備用（README 未引用）**

| 檔案 | 內容 |
|---|---|
| `mockup-hero-light.png` / `mockup-hero-dark.png` | 首頁筆電 mockup |
| `mockup-cinema-light.png` / `mockup-cinema-dark.png` | 角色頁筆電 mockup |

**其他**

- `logo.png` ← `packages/web/public/logo.png`（網站 nav 的 mask 原檔）
- `fig1_contested.png`, `fig3_tradeoff.png`：舊長版引擎實驗圖，精簡版已不引用，保留備查。
