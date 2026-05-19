# Endless Story · CLAUDE.md

> 給下一個 session 的接班備忘。Repo: [231-Labs/endless-story](https://github.com/231-Labs/endless-story)
> 比賽：Sui Overflow 2026 · Walrus 賽道，提交 deadline **2026-06-21**

---

## 一句話

「住在 Walrus 上的梨園 — 角色不是 JPG、是活著的記憶資產」。
用 MemWal SDK 把角色記憶、章回、衍生作品永久上鏈 Walrus、Sui NFT 持有 IP。

---

## 開發

```bash
cd /Users/harperdelaviga/endless-story-new
pnpm --filter @endless-story/web dev          # http://localhost:3000
pnpm --filter @endless-story/web type-check
```

**Preview tools 可用** — `.claude/launch.json` 已配好 `web` server。直接 `preview_start("web")`。

舊 repo（`/Users/harperdelaviga/Endless-Story`）= operator / admin 工具，**不要動**。

---

## 設計系統

### Theme tokens（semantic、非 Tailwind 預設色）

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `canvas` | `#faf8f3` | `#0f0e0c` | **body 背景**（最底層） |
| `surface` | `#faf8f3` | `#191611` | **卡片 / nav / sticky 浮層** |
| `elevated` | `#fffefa` | `#251f18` | modal / popover / floating |
| `ink` | `#18181b` | `#f2e8d2` | 主文字 |
| `mute` | `#71717a` | `#a69a80` | 次文字、icon |
| `hairline` | `#e5e5e0` | `#43382a` | 邊線 |
| `cinnabar` | `#b04a3c` | `#cca45c`（金）| 主 accent（dark = 暖金以對應夜場暖光） |
| `jade` | `#6c8a6f` | `#90a47e` | 次 accent |
| `seal` | `#a3392a` | `#e0b86c` | cinnabar hover state |

定義位置：`packages/web/src/app/globals.css` 的 `:root` + `.dark`。Tailwind 取用 `bg-canvas`、`text-ink`、`ring-hairline` 等（已寫進 `tailwind.config.ts`、`darkMode: 'class'`）。

### Dark mode 鐵律

**避免 dark mode 變醜的關鍵 — 不要把 canvas 同時當「body 背景」跟「卡片背景」。**

- HTML body → `bg-canvas`（自動）
- Card / nav / sticky panel → `bg-surface`
- Modal / floating window / candidate card → `bg-elevated`
- Input / 凹陷區 → `bg-canvas dark:bg-canvas/40`
- 票根 perforation cut-out 那種「body 穿過卡片」→ 保留 `bg-canvas`

Tailwind 預設色（`bg-stone-*`、`bg-rose-50` 等）一定要配 `dark:` 變體：
```tsx
bg-stone-100 dark:bg-stone-800
bg-rose-50 dark:bg-rose-950/40
```

### 統一 utility classes（@layer components）

避免散落的重複類組合，已抽出：

| Class | 用途 |
|---|---|
| `.es-icon-button` | 圓形 icon 按鈕（hover 淡底）— ThemeToggle / nav icon 都用這個 |
| `.es-soft-panel` | 內凹軟面板（hint box / 介紹卡）|
| `.es-field` | input / textarea（含 dark:bg-canvas/40 凹陷感）|
| `.es-choice-card` | 可點選的候選卡（candidate / portrait pick） |
| `.es-outline-button` | outlined secondary 按鈕 |

需要新增類似抽象時，**追加到 globals.css `@layer components`**、不要再寫散落字串。

### 動畫慣例

- **Enter**：`requestAnimationFrame` 後 toggle visible → `translate-y-4 opacity-0` → `translate-y-0 opacity-100`，`duration-300 ease-out`
- **Exit**：反向 + `setTimeout` 280ms 才 unmount（`shownX` cache 保留內容期間）
- **Stage 切換**：用 `key={stage}` 觸發 `.animate-fade-in-up`（globals.css 已定義）
- **Scroll hint**：`.animate-scroll-down-line` keyframe（首頁滾動指示用）

---

## 已落地

### 路由

```
/                           HeroTheater + 場景 + 徵召 (HomeContent wrapper)
/dossier                    9 人卡片網格 + filter (全部/春雪社/江湖/我的)
/dossier?id=X               個人頁 (header + LiveState sticky banner + tabs: 履歷/設定集/連載/託夢)
/dossier?as=viewer          切看客視角（mock 錢包選單下拉切）
/dossier/recruit/[id]       徵召 intent page（候備、目前 RecruitmentTicket 主流程不走這條）
/feed                       章回列表 + filter (全部/群像/視角)
/feed/chapter/[id]          章回詳細頁（3-col centered + TOC + back to /feed）
/subscriptions              我的訂閱管理頁（追訂中 / 持有兩段、可取消）
```

### 互動

- 場景卡 click → 右下角 floating card（拖拉移動 + 拐角 resize 鎖 aspect）
- 徵召票 click → **同框 wizard**（描述/擲牌/選定/繪製/配像/入班 stage morph，含 painting loading stage）
- 入班 ceremony → 大頭像 + 名字 + 「入班」tag → 用戶決定何時離開；done CTA 跳 `/dossier?id={新角色 id}`（demo hardcode `char_cheng_hengyu`）
- Theme toggle in nav（月亮/太陽、localStorage 持久化 + system pref）
- Nav 右上錢包 pill → 下拉：我的角色 / 我的訂閱（→ `/subscriptions`）/ 切視角（班主⇄看客）/ 斷開錢包
- 訂閱管理頁：追訂中（可取消，server action 走 `subscriptionsApi.unsubscribe` + revalidatePath）+ 持有（自動訂閱，不可退）
- Dossier 個人頁 header 下 sticky banner：她現在 / 她在哪 / 她下一步（三條，每分鐘可重算）
- 託夢 tab 召心曲：點「請她唱一段」→ fade-up + cinnabar glow 揭曉下一首；7 日 cooldown（localStorage `lastSummonAt`）；池抽乾後顯示「她已將心底攤完」

### Mock data

`packages/web/src/mocks/`：
- `sagas.ts` · DEMO_SAGA_ID = `saga_chunxue_demo`
- `characters.ts` · 9 個角色（沈懷音/葉庭芳/程蘅玉/梁照水/杜聽瀾/唐桂蘭/孟雲屏/蘇小宛/趙鐵面）
- `chapters.ts` · 8 章回（含 POV 葉/程/梁、saga_internal 沈班主、暮後合戲長章）
- `subscriptions.ts` · 自動 owner 訂閱 + 1 viewer 訂閱 2 角色
- `recruitments.ts` · 武小生（春雪社、外貌≥80 機敏≥70）+ 富商（江湖、外貌≥60 需男）
- `relationships.ts` · 5 條 subjective edges
- `interventions.ts` · 2 條 mock 注夢 / 耳語
- `soulSongs.ts` · 9 角色共 15 首心曲 pool（mood + setting + 多段 verses，第一首 initiallyRevealed）
- `scenes.ts` · 4 條 clip（混合 9/16, 1/1, 16/9, 3/4 aspect）

### API facade

`packages/web/src/lib/api/`：所有 component 透過 facade，**不**直接讀 mocks。Week 2 換真 backend 只改這層。

### 關鍵元件

- `common/CharacterPortrait.tsx` · 行當分色 + inner ring frame + BlobImage；export `characterPortraitTone()`
- `common/BlobImage.tsx` · onLoad fade-in、onError 自動隱藏
- `common/BackButton.tsx` · push to fallback（避免 router.back() history 問題）
- `common/ThemeToggle.tsx` · 夜間模式 toggle（用 `.es-icon-button`）
- `common/MockWalletMenu.tsx` · 錢包 pill + persona switch（query `?as=`）
- `home/HomeContent.tsx` · 首頁 wrapper（SiteNav + HeroTheater + sections）
- `home/HeroTheater.tsx` · 首頁主視覺
- `home/SceneCarousel.tsx` · 場景卡 + 拖拉懸浮窗
- `dossier/LiveStateSection.tsx` · sticky banner 三條（她現在 / 她在哪 / 她下一步）
- `dossier/RecruitmentTicket.tsx` · 票面 + 同框 wizard（最複雜元件）
- `dossier/RecruitmentSection.tsx` · ticket carousel + nav
- `dossier/DossierTabs.tsx` · sticky tab + scroll mini-avatar
- `dossier/tabs/GalleryTab.tsx` · owner 設角色封面
- `dossier/tabs/ProfileTab.tsx` · 2-col 敘描 / 外貌 + 天賦 / 開銷 / 關係 sidebar
- `dossier/tabs/SoulSongPanel.tsx` · 召心曲 client component（cooldown + reveal）
- `subscribe/SubscribeCard.tsx` · magazine-cover 角色卡
- `feed/ChapterToc.tsx` · 章回目錄

---

## 遷移計劃（舊版 → 新版尚未補齊）

> 完整掃描完成於 2026-05-20。標 ✅ = 已補齊

### 已自動補齊（不需再做）

- ✅ `MockWalletMenu` + 訂閱管理頁 `/subscriptions`
- ✅ `LiveStateSection`（三條 live state banner）
- ✅ `HeroTheater` / `HomeContent`（首頁重組）
- ✅ `lib/character-live-state.ts`
- ✅ `ThemeToggle` + 夜間模式 palette（含暖金 cinnabar）
- ✅ `es-*` utility classes 抽象（globals.css `@layer components`）
- ✅ 召心曲深層版 → `SoulSongPanel.tsx` + `mocks/soulSongs.ts`
- ✅ Dark mode polish（DossierTabs、ProfileTab、Composer notice、ChapterToc、BackButton hover）
- ✅ 入班完成 → done CTA 跳 `?id=char_cheng_hengyu`

### Round 1 — 最高 ROI（建議先做）

1. **`CharacterLinkifier`**（S）— 文中角色名變連結。**全站 reuse**。
   - 舊版位置：`packages/web/src/components/CharacterLinkifier.tsx`
   - 要用到的頁面：章回內文、live state、對話、未來 monologue

2. **`SoulSection` / Persona Card**（M）— 履歷 tab 加 Persona 子區塊
   - 半永久 traits：immutable axes / speech mannerisms / non-negotiable values
   - 資料來自 `/api/characters/[id]/persona`（mock 化即可）
   - 舊版位置：`packages/web/src/components/dossier/SoulSection.tsx`

### Round 2 — 國際化（比賽英文化前置）

3. **next-intl framework**（L）— `messages/{en,zh-Hant}.json` + namespace
4. **抽既有文案至 t()**（M）— 漸進，先 5 個關鍵頁面
5. **`LocaleToggle`**（S）— nav 加「中 / EN」切換
6. **`romanize-name`**（S）— 中文名 → 拼音（英文 demo 用，e.g. 葉庭芳 / Ye Tingfang）

### Round 3 — 角色頁深化

7. **`HistoryTabs`**（L）— 3 子 tab：**對話 / 內心獨白 / 公報 gazette**
   - 現在「連載」tab 只覆蓋章回，未涵蓋對話 + 獨白 + gazette
8. **角色 Memory 查閱**（M）— Owner-only：列出 reflection / observation / event_summary
   - 舊版 endpoint：`/api/characters/[id]/memories?wallet=` + owner gate
   - 新版位置：新 tab「記憶」或併入「託夢」tab 底部
   - 建議走 structured journal entries（事件 id + 反思語），與心曲完整獨白區隔
9. **`RelationshipGraph`**（L）— 視覺化 v3 關係圖
   - 數據 `mocks/relationships.ts` 已備
   - 需 zoom-pan hook（舊版 `useZoomPan`）
   - 可放 dossier `?tab=relations` 或整個 saga 在 `/world`

### Round 4 — 賽後 / 系統工具

10. **`atlas.ts` + `live-map-layout.ts` + `useZoomPan`** — 世界地圖 `/world` 頁
11. **`time.ts`**（utcTimeToLocal）— `lib/format.ts` 的 `formatDate` 太簡單
12. **`useWorldState` hook** — 集中 fetch world / saga / characters（接真鏈會省事）
13. **`useLocalPortraitUrl` + `character-portraits.ts`** — Portrait URL fallback layer

---

## 不遷移（明確排除）

- ❌ 舊 `CastStrip` — 已被 `SubscribeCard` 取代
- ❌ 舊 `DossierHero` — 已被 `DossierHeader` 取代
- ❌ 舊 `DrawComposer` — 已被 `RecruitmentTicket` 票面 wizard 取代（更好）
- ❌ 舊 `Navbar` / `PageHeader` — 已被 `SiteNav` 取代
- ❌ 舊 `StatusBar` — admin / runner 用
- ❌ 舊 `lib/skill/*`、`lib/dapp-kit`、`lib/moderation-rules-store`、`lib/recruitments-store` — 後端 / admin
- ❌ 舊 `clear-narrative-manifest`、`agent-config` — admin / operator

---

## Phase 2（賽後 / 鏈上）

不影響 6/21 提交，但 pitch deck 要提：

- **真實 Sui Move 合約** — recruitment voucher / character mint / Seal access policy
- **MemWal SDK 接通** — chapter / reflection / event_moment / derivative 圖 → Walrus，policy = subscriber set + owner
- **真實 LLM** — moderation + 3-candidate draft + portrait curate
- **RSS feed endpoint** — `/feed/character/[id].xml`
- **POV 轉寫 engine** — 每個被訂閱的角色每天生一份第一人稱 daily POV
- **角色 transfer / IP 經濟** — owner 收 saga 補貼 / 票房分潤

---

## 不要

- ❌ 不要重做已刪掉的 `/subscribe`（已合併進 `/dossier`，視覺用 SubscribeCard）
- ❌ 不要在 component 用 raw `bg-stone-100` 等 Tailwind 預設色而不加 `dark:` 變體
- ❌ 不要用 `bg-canvas` 當卡片背景 — 用 `bg-surface`
- ❌ 不要新建 API route 而繞過 `lib/api/` facade（會增加 Week 2 切真 backend 的成本）
- ❌ 不要動老 repo `/Users/harperdelaviga/Endless-Story`（保留為 admin / operator）
- ❌ 入班 ceremony 不要自動跳轉 — 用戶手動點 CTA
- ❌ 重複的 className 字串組合 → 抽到 `@layer components` 的 `es-*` class

---

## 驗證 checklist

開瀏覽器跑這幾條：

```
http://localhost:3000/                                  Home (HeroTheater + 場景 + 徵召)
http://localhost:3000/dossier                           人物誌 + filter
http://localhost:3000/dossier?id=char_ye_tingfang       葉庭芳個人頁 (含 LiveState)
http://localhost:3000/dossier?id=...&tab=gallery        設定集 + owner 設封面
http://localhost:3000/dossier?id=...&tab=entrusts       託夢 + 召心曲 (owner / viewer)
http://localhost:3000/feed                              連載列表
http://localhost:3000/feed/chapter/chapter_day3_evening_meal   長章 + TOC
http://localhost:3000/subscriptions?as=viewer           訂閱管理頁（可取消）
```

每條都應該：
- Light mode 看起來乾淨優雅
- 切 dark mode (nav 月亮/太陽) — 卡片浮起、無破圖、無 contrast 失敗、暖金 accent
- type-check 綠燈

---

## Quick win 順序建議

召心曲、dark mode polish、訂閱管理頁已落地。比賽前 P0 只剩 **i18n**；P1 剩 **角色記憶查閱**。

下個 session 建議：先吃 **Round 3 #8 角色記憶查閱**（mock 反思列表，與心曲區隔），再做 **Round 1 #1 CharacterLinkifier**（全站獲益）。i18n 等其他 demo 內容鎖死後最後一發。
