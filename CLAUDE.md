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
# Repo root
cd /Users/harperdelaviga/endless-story-new

# Run dev
pnpm --filter @endless-story/web dev    # http://localhost:3000

# Type-check
pnpm --filter @endless-story/web type-check
```

**Preview tools 可用** — `.claude/launch.json` 已配好 `web` server。直接 `preview_start("web")`。

舊 repo（`/Users/harperdelaviga/Endless-Story`）= operator / admin 工具，不要動。

---

## 設計系統

### Theme tokens（semantic、非 Tailwind 預設色）

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `canvas` | `#faf8f3` | `#16110b` | **body 背景**（最底層） |
| `surface` | `#faf8f3` | `#221d1b` | **卡片 / nav / sticky 浮層**（浮起一層） |
| `elevated` | `#fffefa` | `#2e2925` | modal / popover（浮起兩層）|
| `ink` | `#18181b` | `#f0eade` | 主文字（swap 隨 mode） |
| `mute` | `#71717a` | `#98928a` | 次文字、icon |
| `hairline` | `#e5e5e0` | `#463e37` | 邊線（dark 已加亮） |
| `cinnabar` | `#b04a3c` | `#dc7660` | 主 accent |
| `jade` | `#6c8a6f` | `#8eac8a` | 次 accent |
| `seal` | `#a3392a` | `#c8644e` | cinnabar hover state |

定義位置：`packages/web/src/app/globals.css` 的 `:root` + `.dark`。Tailwind 取用：`bg-canvas`、`text-ink`、`ring-hairline` 等（已寫進 `tailwind.config.ts`、`darkMode: 'class'`）。

### Dark mode 鐵律

**避免 dark mode 變醜的關鍵 — 不要把 canvas 同時當「body 背景」跟「卡片背景」。**

- HTML body → `bg-canvas`（自動，從 globals.css）
- Card / nav / sticky panel → `bg-surface`
- Modal / floating window → `bg-elevated`
- Input / 凹陷區（form field）→ `bg-canvas dark:bg-canvas/40`（反向凹下）
- 票根 perforation cut-out 那種「body 穿過卡片」→ 保留 `bg-canvas`

Tailwind 預設色（`bg-stone-*`、`bg-rose-50` 等）一定要配 `dark:` 變體，否則 dark mode 會破：
```tsx
bg-stone-100 dark:bg-stone-800
bg-rose-50 dark:bg-rose-950/40
```

### 動畫慣例

- **Enter**：`requestAnimationFrame` 後 toggle visible → `translate-y-4 opacity-0` → `translate-y-0 opacity-100`，`duration-300 ease-out`
- **Exit**：反向 + `setTimeout` 280ms 才 unmount（在 state 加一個 `shownX` cache 保留內容期間）
- **Stage 切換**：用 `key={stage}` 觸發 `animate-fade-in-up`（globals.css 已定義 keyframe）

---

## 已落地（5f08103 + dark mode redesign）

### 路由

```
/                    Hero + 今日場景 + 徵召公告
/dossier             9 人卡片網格 + filter (全部/春雪社/江湖/我的)
/dossier?id=X        個人頁 (header + sticky tabs: 履歷/設定集/連載/託夢)
/feed                章回列表 + filter (全部/群像/視角)
/feed/chapter/[id]   章回詳細頁（3-col centered + TOC + 章回 back to /feed）
```

### 互動

- 場景卡 click → 右下角 floating card（拖拉移動 + 拐角 resize 鎖 aspect）
- 徵召票 click → 同框 wizard（描述/擲牌/選定/配像/入班 5 stage morph）
- 入班 ceremony → 大頭像 + 名字 + 「入班」tag → 用戶決定何時離開
- Theme toggle in nav（月亮/太陽 icon、localStorage 持久化 + system pref）

### Mock data

`packages/web/src/mocks/`：
- `sagas.ts` · DEMO_SAGA_ID = `saga_chunxue_demo`
- `characters.ts` · 9 個角色（沈懷音/葉庭芳/程蘅玉/梁照水/杜聽瀾/唐桂蘭/孟雲屏/蘇小宛/趙鐵面）
- `chapters.ts` · 8 章回（含 POV 葉/程/梁、saga_internal 沈班主、暮後合戲長章）
- `subscriptions.ts` · 自動 owner 訂閱 + 1 viewer 訂閱 2 角色
- `recruitments.ts` · 武小生（春雪社、外貌≥80 機敏≥70）+ 富商（江湖、外貌≥60 需男）
- `relationships.ts` · 5 條 subjective edges
- `interventions.ts` · 2 條 mock 注夢 / 耳語
- `scenes.ts` · 4 條 clip（混合 9/16, 1/1, 16/9, 3/4 aspect）

### API facade

`packages/web/src/lib/api/`：所有 component 透過 facade，**不**直接讀 mocks。Week 2 換真 backend 只改這層。

### 關鍵元件

- `components/common/CharacterPortrait.tsx` · 行當分色 fallback tile
- `components/common/BlobImage.tsx` · img onError 自動隱藏（Walrus 圖未上時不破圖）
- `components/common/BackButton.tsx` · router.back() with fallback
- `components/common/ThemeToggle.tsx` · 夜間模式 toggle
- `components/home/SceneCarousel.tsx` · 場景卡 + 拖拉懸浮窗
- `components/dossier/RecruitmentTicket.tsx` · 票面 + 同框 wizard（最複雜元件）
- `components/dossier/RecruitmentSection.tsx` · carousel + nav
- `components/subscribe/SubscribeCard.tsx` · magazine-cover 角色卡
- `components/dossier/DossierTabs.tsx` · sticky tab + scroll mini-avatar
- `components/dossier/tabs/GalleryTab.tsx` · owner 設角色封面
- `components/feed/ChapterToc.tsx` · 章回目錄

---

## 待辦 — 比賽前必做

### P0 — 阻擋比賽提交

1. **i18n（next-intl）** — 比賽展示語言是英文。每個元件文案要走 `t()` + messages/zh-Hant.json、en.json
2. **mock 錢包 + 用戶選單** — Nav 右側錢包 pill（顯示截短地址 + 小頭像 dot），下拉選單：
   - 我的角色 · 3（連 /dossier?filter=mine）
   - 我的訂閱 · N
   - 切換視角（demo 用 owner_a / viewer）
   - 斷開錢包
3. **LiveStateSection「她現在」** — dossier 個人頁 header 下方 sticky banner，3 條：
   - 她現在 · {intent 一行}
   - 她在哪 · {scene name · time}
   - 她下一步 · {next plan}
4. **入班完成 → 真實人物卡** — 目前 done stage 後 CTA 跳 /dossier。應該跳 /dossier?id={new_char_id}（demo 可 hardcode 一個現有角色 id）

### P1 — Demo 增色

5. **召心曲深層版** — dossier 託夢 tab 加「請她唱一段」按鈕，比 daily POV 深兩倍的內心獨白；7 天 cooldown
6. **訂閱管理頁** — 進 nav 用戶選單後可以看 / 取消訂閱
7. **角色記憶查閱** — owner 看自己角色的 Walrus 反思（mock 列表，無 Seal）
8. **Dark mode polish 剩餘元件** — DossierTabs mini avatar、ProfileTab 屬性 bar、InterventionTab / Composer info card、ChapterToc bg、BackButton hover state

### P2 — 賽後（不影響 6/21）

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

---

## 驗證 checklist

開瀏覽器跑這幾條：

```
http://localhost:3000/                                  Home + 場景 + 徵召
http://localhost:3000/dossier                           人物誌 + filter
http://localhost:3000/dossier?id=char_ye_tingfang       葉庭芳個人頁
http://localhost:3000/dossier?id=...&tab=gallery        設定集 + owner 設封面
http://localhost:3000/dossier?id=...&tab=entrusts       託夢 (owner / viewer)
http://localhost:3000/feed                              連載列表
http://localhost:3000/feed/chapter/chapter_day3_evening_meal   長章 + TOC
```

每條都應該：
- Light mode 看起來乾淨優雅
- 切 dark mode (nav 右上 icon) — 卡片 / nav 浮起、無破圖、無 contrast 失敗
- type-check 綠燈

---

## Quick win 順序建議

下個 session 建議先吃 P0 的 2（mock 錢包）+ 3（LiveStateSection），這兩個一起做能讓 demo 立刻多兩塊「活著」的證據。然後再上 i18n。
