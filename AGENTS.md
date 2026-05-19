# Endless Story · AGENTS.md

> 給下一個 session 的接班備忘。Repo: [231-Labs/endless-story](https://github.com/231-Labs/endless-story)
> 比賽：Sui Overflow 2026 · Walrus 賽道，提交 deadline **2026-06-21**

---

## 一句話

「住在 Walrus 上的梨園 — 角色不是 JPG、是活著的記憶資產」。
用 MemWal SDK 把角色記憶、章回、衍生作品永久上鏈 Walrus、Sui NFT 持有 IP。

---

## 開發

```bash
# Repo root
cd /Users/harperdelaviga/endless-story-new

# Run dev
pnpm --filter @endless-story/web dev    # http://localhost:3000

# Type-check
pnpm --filter @endless-story/web type-check
```

**Preview tools 可用** — `.Codex/launch.json` 已配好 `web` server。直接 `preview_start("web")`。

舊 repo（`/Users/harperdelaviga/Endless-Story`）= operator / admin 工具，不要動。

---

## 設計系統

### Theme tokens（semantic、非 Tailwind 預設色）

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `canvas` | `#faf8f3` | `#0f0e0c` | **body 背景**（最底層） |
| `surface` | `#faf8f3` | `#191611` | **卡片 / nav / sticky 浮層** |
| `elevated` | `#fffefa` | `#251f18` | modal / popover |
| `ink` | `#18181b` | `#f2e8d2` | 主文字 |
| `mute` | `#71717a` | `#a69a80` | 次文字、icon |
| `hairline` | `#e5e5e0` | `#43382a` | 邊線 |
| `cinnabar` | `#b04a3c` | `#cca45c`（金）| 主 accent（dark = 暖金） |
| `jade` | `#6c8a6f` | `#90a47e` | 次 accent |
| `seal` | `#a3392a` | `#e0b86c` | cinnabar hover state |

定義位置：`packages/web/src/app/globals.css` 的 `:root` + `.dark`。Tailwind 取用：`bg-canvas`、`text-ink`、`ring-hairline` 等（`tailwind.config.ts`、`darkMode: 'class'`）。

### Dark mode 鐵律

**不要把 canvas 同時當 body 背景跟卡片背景。**

- HTML body → `bg-canvas`
- Card / nav / sticky panel → `bg-surface`
- Modal / floating window → `bg-elevated`
- Input / 凹陷區 → `bg-canvas dark:bg-canvas/40`
- 票根 perforation cut-out → 保留 `bg-canvas`

Tailwind 預設色一定要配 `dark:` 變體。重複 className 組合 → 抽到 globals.css 的 `es-*` class（`.es-icon-button`、`.es-field` 等）。

### 動畫慣例

- **Enter**：`requestAnimationFrame` 後 toggle → `translate-y-4 opacity-0` → `translate-y-0 opacity-100`，`duration-300 ease-out`
- **Exit**：反向 + `setTimeout` 280ms 才 unmount
- **Stage 切換**：`key={stage}` + `animate-fade-in-up`

---

## 已落地

### 路由

```
/                           HeroTheater + 場景 + 徵召
/dossier                    9 人卡片網格 + filter
/dossier?id=X               個人頁 (LiveState banner + tabs: 履歷/設定集/連載/託夢)
/dossier?as=viewer          切看客視角
/feed                       章回列表 + filter
/feed/chapter/[id]          章回詳細頁 + TOC
/subscriptions              訂閱管理（追訂中可取消 / 持有不可退）
```

### 互動

- 場景卡 → 右下角 floating card（拖拉 + resize）
- 徵召票 → 同框 wizard（描述/擲牌/選定/繪製/配像/入班）
- 入班 ceremony → 手動 CTA；done 跳 `/dossier?id=char_cheng_hengyu`
- Theme toggle + MockWalletMenu（我的角色 / 我的訂閱 → `/subscriptions` / 切視角）
- 訂閱管理頁：追訂中可取消（`subscriptionsApi.unsubscribe` + revalidatePath）；持有不可退
- LiveState sticky banner：她現在 / 她在哪 / 她下一步
- 託夢 tab 召心曲：7 日 cooldown、池抽乾提示

### Mock data

`packages/web/src/mocks/`：`sagas` · `characters`（9 人）· `chapters`（8 章）· `subscriptions` · `recruitments` · `relationships` · `interventions` · `soulSongs` · `scenes`

### API facade

`packages/web/src/lib/api/`：component **不**直接讀 mocks。

### 關鍵元件

`CharacterPortrait` · `BlobImage` · `BackButton` · `ThemeToggle` · `MockWalletMenu` · `HomeContent` / `HeroTheater` · `SceneCarousel` · `LiveStateSection` · `RecruitmentTicket` / `RecruitmentSection` · `DossierTabs` · `ProfileTab` · `GalleryTab` · `SoulSongPanel` · `SubscribeCard` · `ChapterToc`

---

## 待辦 — 比賽前必做

### P0 — 阻擋比賽提交

1. **i18n（next-intl）** — 比賽展示語言是英文

### P1 — Demo 增色

2. **角色記憶查閱** — owner 看 mock Walrus 反思（structured journal，與心曲區隔）

### ✅ 已完成

- mock 錢包 + 用戶選單 · LiveState · 入班 → 人物卡 · 召心曲 · dark mode polish · `/subscriptions` 訂閱管理

### P2 — 賽後

Move 合約 · MemWal SDK · 真實 LLM · RSS · POV engine · IP 經濟

---

## 不要

- ❌ 不要重做 `/subscribe`（已併入 `/dossier`）
- ❌ 不要 raw Tailwind 色不加 `dark:`
- ❌ 不要用 `bg-canvas` 當卡片背景
- ❌ 不要繞過 `lib/api/` facade
- ❌ 不要動老 repo `Endless-Story`
- ❌ 入班不要自動跳轉

---

## 驗證 checklist

```
http://localhost:3000/
http://localhost:3000/dossier
http://localhost:3000/dossier?id=char_ye_tingfang
http://localhost:3000/dossier?id=...&tab=gallery
http://localhost:3000/dossier?id=...&tab=entrusts
http://localhost:3000/feed
http://localhost:3000/feed/chapter/chapter_day3_evening_meal
http://localhost:3000/subscriptions?as=viewer
```

Light / dark mode 正常 · type-check 綠燈

---

## Quick win

下個 session：**角色記憶查閱** → **CharacterLinkifier** → 最後 **i18n**。詳見 `CLAUDE.md` 遷移計劃 Round 1–3。
