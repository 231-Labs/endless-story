# Endless Story · AGENTS.md

> 給下一個 session 的接班備忘（**唯一維護檔**）。Repo: [231-Labs/endless-story](https://github.com/231-Labs/endless-story)
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
| `cinnabar` | `#b04a3c` | `#cca45c`（金）| 主 accent（dark = 暖金） |
| `jade` | `#6c8a6f` | `#90a47e` | 次 accent |
| `seal` | `#a3392a` | `#e0b86c` | cinnabar hover state |

定義：`packages/web/src/app/globals.css` 的 `:root` + `.dark`。Tailwind：`bg-canvas`、`text-ink` 等（`tailwind.config.ts`、`darkMode: 'class'`）。

### Dark mode 鐵律

**不要把 canvas 同時當 body 背景跟卡片背景。**

- HTML body → `bg-canvas`
- Card / nav / sticky → `bg-surface`
- Modal / floating / candidate card → `bg-elevated`
- Input / 凹陷區 → `bg-canvas dark:bg-canvas/40`
- 票根 perforation cut-out → 保留 `bg-canvas`

Tailwind 預設色（`bg-stone-*` 等）一定要配 `dark:`。重複 className → 抽到 globals.css 的 `es-*`：

| Class | 用途 |
|---|---|
| `.es-icon-button` | 圓形 icon 按鈕 |
| `.es-soft-panel` | 內凹軟面板 |
| `.es-field` | input / textarea |
| `.es-choice-card` | 可點選候選卡 |
| `.es-outline-button` | outlined secondary |
| `.es-page-lead-eyebrow` · `.es-page-lead-title` | 人物誌／梨園章回／梨園手卷覆層等**統一主標**；`:root --es-site-nav-h` 與 SiteNav 高度對齊（sticky 頂距） |

`PageLeadTitleBlock`（`components/common/PageLeadTitleBlock.tsx`）：主標 + 輔題 + 右欄 slot（例如搜尋）。

### 動畫慣例

- **Enter**：`requestAnimationFrame` 後 toggle → `translate-y-4 opacity-0` → `translate-y-0 opacity-100`，`duration-300 ease-out`
- **Exit**：反向 + `setTimeout` 280ms 才 unmount
- **Stage 切換**：`key={stage}` + `.animate-fade-in-up`
- **Scroll hint**：`.animate-scroll-down-line`（首頁 Hero 用）

### 靜態資產（近期）

| 路徑 | 用途 |
|---|---|
| `/hero/saga-day.webp` · `/hero/saga-night.webp` | `HeroTheater` 日/夜背景（已取代舊 `banner-day/night.png`） |
| `/ticket-bg/day-{1..5}.png` · `night-{1..5}.png` | 徵召票票面底圖，依 carousel `index % 5` 輪替 |
| `/walruses.png` | 首頁第三屏 manifesto 上方 Walrus 插畫 |

---

## 鏈上架構（2026-05-24 拍板，不可漂移）

> 此節是合約 / SDK / runner / web 之間的**契約**。
> **任何 session 在 runner 反覆測試時都不准踰越這六條原則。**
> 若需要修改原則，必須在此節留改動紀錄與日期。

### 六條核心原則

1. **依賴單向**
   `web → sdk → contracts` ／ `runner → sdk + memwal` ／ `cli → sdk + shared`
   **`sdk` 不准 import `web`。`shared` 不准 import 任何上層。**
2. **`sdk` 是鏈上互動唯一入口** — web/runner/cli 不准自己 `new SuiClient()`、不准自己手寫 PTB
3. **`memwal` 是 Walrus / Seal 唯一入口** — 不准在 web/runner 裡直接 import `@mysten/walrus` 或 `@mysten/seal`
4. **`shared/src/contract-ids.ts` 是部署輸出的單一真相** — `cli` 寫入，sdk/runner/web 只讀
5. **server actions 優先** — admin 操作走 `web/src/lib/actions/`，除非真正需要 HTTP（webhook / SSE / RSS）才開 `app/api/`
6. **`(site)` / `(admin)` route group 嚴格隔離** — admin layout + middleware 獨立，user 站台不被 admin 邏輯污染

### 目錄契約

```
contracts/endless_story/sources/   ← Move 模組（依 Phase 1 依序進場）
packages/
  shared/    型別 + 純函式 + contract-ids；零依賴
  sdk/       generated/ + client.ts + tx/ + read/；鏈上唯一入口
  memwal/    Walrus + Seal 唯一入口（已有，不動）
  cli/       deploy / bootstrap / reset / stories；管 publish + 種世界
  runner/    Agent / scheduler / LLM（Phase 2 才動，目前 stub）
  web/       UI；app/(site)/* + app/(admin)/* 隔離
```

### Phase 路線圖

| Phase | 內容 | 何時 |
|---|---|---|
| **0** | skill 改名、cli 骨架、sdk scaffold、contract-ids、(site)/(admin) 重構 | ✅ 2026-05-24 完成（commit `f99d28f`） |
| **1** | Move 模組依序遷移：見下方細項 | 進行中（2026-05-24 起） |
| **2** | SDK 完整（codegen + tx + read）→ admin 一鍵部署 UI | Phase 1 之後 |
| **3** | Web mock → SDK 真實串接（Subscribe → Recruitment → Memories → ...） | Phase 2 之後 |
| **4** | Runner 上線（LLM、scheduler、memwal 寫入） | 賽後 |

**Phase 1 模組進度**（依依賴順序）：

| # | 模組 | 狀態 | 備註 |
|---|---|---|---|
| 1.1 | `currency.move` | ✅ 2026-05-24 | ENDLESS coin (6 decimals)，用 `coin_registry::new_currency_with_otw` 新 API，MetadataCap **保留**（可後續更新 icon_url 等） |
| 1.1b | `faucet.move` | ✅ 2026-05-24 | Public faucet — anyone can drip；`FaucetAdminCap` 控制 drip_amount / cooldown_ms / total_supply_cap / paused；`admin_mint` 後門繞 cooldown；9 tests |
| 1.2 | `world.move` | ✅ 2026-05-24 | World/Location/WorldRules/WorldTimeConfig + AdminCap；移除 `#[allow(unused_field)]`、`vector::empty` → `vector[]`；2 個 inline tests 通過 |
| 1.3 | `saga.move` | ✅ 2026-05-24 | Saga/StorytellerCap/RevenueConfig + card weighting (R3.2) + skill table (R3.3) + Display V2；**新增 `withdraw_from_treasury`**（補老版漏寫）；8 tests |
| 1.4 | `scene.move` | ✅ 2026-05-24 | Scene/ScenePlacement/SceneAccess/SceneParams/SceneState + Display V2；**新增 3 個 inline tests**（舊版完全沒 test）；character_count / privacy_level 補 view |
| 1.5a | `character.move` 擴充 + `recruit.move` 新增 | ✅ 2026-05-24 | Character 結構全胖（profile/physical/attributes/media/tags/state/image/death）+ 三條 mint 路徑（genesis/collectible/internal）+ validation 私 fn + mark_dead + 全 view + cap accessors。新 `recruit` module 含 GenesisVoucher + mint_genesis_voucher + redeem_voucher_to_character。Move best practice 拆 module（不拆 package）：character 管 Character resource、recruit 管「外部申請加入」入口 |
| 1.5b | character 擴 + recruit 擴 | ⬜ 待做 | JoinIntent + transfer_character_control + force_release_character + walk_in_world + move_character |
| 1.5c | character 擴 | ⬜ 待做 | per-saga skills + update_character_image + Display V2 init |
| 1.6 | `event.move` | ⬜ 待做 | 事件解算、卡片、死亡標記 |
| 1.7 | `commitment.move` | ⬜ 待做 | 記憶壓縮快照 |

### Runner 開發鐵律（給未來反覆測試 runner 的 session）

- ❌ 不要為了 runner 方便，在 web 裡放 runner 邏輯
- ❌ 不要為了 runner 方便，繞過 sdk 自己呼叫鏈
- ❌ 不要為了 runner 方便，把 memwal 邏輯 inline 到 runner
- ❌ 不要為了快，在 `shared/` 塞 runner 專用型別（runner 自己有 src/types/）
- ❌ 不要為了 demo 直接改 `contract-ids.ts`，要走 cli 部署
- ✅ runner 缺什麼 API，去 `sdk/` 加；缺什麼型別，去 `shared/` 加；缺什麼 walrus 操作，去 `memwal/` 加

### 部署管線

| skill | 用途 |
|---|---|
| `/devnet-bootstrap` | 第一次部署：publish + 種 world/saga/scene/characters |
| `/devnet-reset` | 整盤重來：清舊資料 + redeploy + reseed |

兩者都呼叫 `packages/cli/scripts/{deploy,bootstrap,reset}.ts`。

---

## 已落地

### 路由

```
/                           三屏 snap：HeroTheater → 徵召 → Manifesto/Footer
/dossier                    9 人卡片網格 + filter (全部/春雪社/江湖/我的)
/dossier?id=X               個人頁 (LiveState + tabs: 履歷/設定集/連載/記憶/託夢)
/dossier?id=X&tab=memories  記憶 tab（owner-only journal）
/dossier?as=viewer          看客視角（MockWalletMenu 切換）
/dossier/recruit/[id]       徵召 intent 頁（候備；主流程走首頁 RecruitmentTicket）
/feed                       梨園章回（公開章回列表 + filter）
/feed/chapter/[id]          章回詳細 + TOC
/subscriptions              訂閱管理（追訂中可取消 / 持有不可退）
```

### 首頁（`HomeContent`）

- **第一屏**：`SiteNav` + `HeroTheater`（場景卡、日/夜 saga 背景、徵召數 badge 滾動至 `#recruitment-section`）
- **第二屏**：`RecruitmentSection` — 多則徵召 carousel、票開 wizard 時隱藏 nav
- **第三屏**：manifesto「戲子無情，記憶有痕」+ 梨園戲單 roadmap + footer 連結

### 互動

- 場景卡 → 右下角 floating card（拖拉 + resize 鎖 aspect）
- 徵召票 → 同框 wizard（描述/擲牌/選定/繪製/配像/入班）；票面 day/night 水墨底圖
- 徵召 carousel：上一則/下一則 + dot；空榜「揭榜處空無一物」+ `[測試] 恢復徵召`
- 入班 ceremony → 手動 CTA；done 跳 `/dossier?id=char_cheng_hengyu`（demo hardcode）
- Theme toggle + MockWalletMenu（我的角色 / 我的訂閱 / 切視角）
- `DossierHeader` live state（她現在/她在哪/她下一步）+ `CharacterLinkifier`
- 履歷 tab `SoulSection`（軸/腔/界 persona，`personasApi` + `mocks/personas.ts`）
- **記憶 tab** `MemoriesTab`（owner-only；`memoriesApi` gate + reflection/observation/event journal）
- 託夢 tab 召心曲：7 日 cooldown、池抽乾提示

### Mock data

`packages/web/src/mocks/`：
- `sagas.ts` · DEMO_SAGA_ID = `spring-snow`
- `characters.ts` · 9 人
- `chapters.ts` · 8 章
- `recruitments.ts` · **5 則** active：武小生、富商、青衣、小報記者、老生（原 2 則已擴充）
- `personas.ts` · 9 人本色（軸/腔/界）
- `memories.ts` · owner journal（與 `soulSongs` 心曲區隔）
- `subscriptions` · `relationships` · `interventions` · `soulSongs` · `scenes`

### API facade

`packages/web/src/lib/api/`：component **不**直接讀 mocks。

### 關鍵元件

`CharacterPortrait` · `BlobImage` · `CharacterLinkifier` · `BackButton` · `ThemeToggle` · `MockWalletMenu` · `HomeContent` / `HeroTheater` / `SceneCarousel` · `DossierHeader` · `RecruitmentTicket` / `RecruitmentSection` · `DossierTabs` · `ProfileTab` / `SoulSection` · `MemoriesTab` · `GalleryTab` · `SoulSongPanel` · `SubscribeCard` · `ChapterToc`

---

## 待辦

### P0 — 比賽提交

1. **i18n（next-intl）** — 展示語言需英文

### P2 — 賽後 / 鏈上

Move 合約 · MemWal SDK · 真實 LLM · RSS · POV engine · IP 經濟（pitch deck 可提）

---

## 遷移計劃（舊版 → 新版尚未補齊）

> 完整掃描完成於 2026-05-20；2026-05-21 對照 codebase 更新 Round 1/3 狀態。標 ✅ = 已補齊。
> 舊 repo 路徑：`/Users/harperdelaviga/Endless-Story`（**只讀對照，不要改**）

### 已自動補齊（不需再做）

- ✅ `MockWalletMenu` + 訂閱管理頁 `/subscriptions`
- ✅ `LiveStateSection`（三條 live state banner）
- ✅ `HeroTheater` / `HomeContent`（首頁重組）
- ✅ 首頁三屏 snap（Hero → 徵召 → Manifesto/Footer）+ 梨園戲單 + `walruses.png`
- ✅ Hero 背景 `saga-day/night.webp`；徵召票 `ticket-bg` day/night ×5 輪替
- ✅ `RecruitmentSection` carousel + 空榜狀態；`recruitments` mock 擴至 5 則
- ✅ `lib/character-live-state.ts`
- ✅ `ThemeToggle` + 夜間模式 palette（含暖金 cinnabar）
- ✅ `es-*` utility classes 抽象（globals.css `@layer components`）
- ✅ 召心曲深層版 → `SoulSongPanel.tsx` + `mocks/soulSongs.ts`
- ✅ Dark mode polish（DossierTabs、ProfileTab、Composer notice、ChapterToc、BackButton hover）
- ✅ 入班完成 → done CTA 跳 `?id=char_cheng_hengyu`
- ✅ **`CharacterLinkifier`** — `components/common/CharacterLinkifier.tsx`（`Linkified` / `LinkifiedProse`）
  - 已接：章回內文、`DossierHeader` 敘述、記憶/託夢介入/心曲 verse
  - 待接（有 `HistoryTabs` 後）：對話、內心獨白、公報
- ✅ **`SoulSection` + Persona** — `SoulSection.tsx` + `mocks/personas.ts` + `lib/api/personas.ts` → `ProfileTab`
- ✅ **角色 Memory 查閱** — `MemoriesTab` + `?tab=memories` + `mocks/memories.ts` + `lib/api/memories.ts`（owner gate）

### Round 1 — 仍可擴充（核心已落地）

- ⬜ `CharacterLinkifier` 覆蓋面：等 Round 3 `HistoryTabs` 接上對話/獨白/gazette
- ⬜ 更多角色 mock 記憶條目（目前非全 9 人都有；可對照 `listMemoriesByCharacter`）

### Round 2 — 國際化（比賽英文化前置）

3. **next-intl framework**（L）— `messages/{en,zh-Hant}.json` + namespace
4. **抽既有文案至 t()**（M）— 漸進，先 5 個關鍵頁面
5. **`LocaleToggle`**（S）— nav 加「中 / EN」切換
6. **`romanize-name`**（S）— 中文名 → 拼音（英文 demo 用，e.g. 葉庭芳 / Ye Tingfang）

### Round 3 — 角色頁深化

7. **`HistoryTabs`**（L）— 3 子 tab：**對話 / 內心獨白 / 公報 gazette**
   - 現在「連載」tab 只覆蓋章回，未涵蓋對話 + 獨白 + gazette
8. **`RelationshipGraph`**（L）— 視覺化 v3 關係圖
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

**UI / 樣式**
- ❌ 不要重做 `/subscribe`（已併入 `/dossier`）
- ❌ 不要 raw Tailwind 色不加 `dark:`
- ❌ 不要用 `bg-canvas` 當卡片背景
- ❌ 重複 className → 抽到 `es-*`
- ❌ 入班不要自動跳轉

**架構（見「鏈上架構」節）**
- ❌ 不要繞過 `web/src/lib/api/` facade
- ❌ 不要繞過 `sdk` 直接 `new SuiClient()`
- ❌ 不要在 web/runner 直接 import `@mysten/walrus` 或 `@mysten/seal`（走 memwal）
- ❌ 不要手動編輯 `shared/src/contract-ids.ts`（cli 寫入）
- ❌ 不要在 `(site)` route 裡放 admin 操作

**Repo / 文件**
- ❌ 不要動老 repo `Endless-Story`
- ❌ 不要雙份維護 `AGENTS.md` / `CLAUDE.md`
- ❌ 不要用拼音 skill 名（已禁 wuxia / xianxia 等）

---

## 驗證 checklist

```
http://localhost:3000/                                  三屏 snap + 徵召 carousel
http://localhost:3000/dossier
http://localhost:3000/dossier?id=char_ye_tingfang
http://localhost:3000/dossier?id=...&tab=gallery
http://localhost:3000/dossier?id=char_ye_tingfang&tab=memories  記憶 tab（需 owner 錢包）
http://localhost:3000/dossier?id=...&tab=entrusts
http://localhost:3000/feed
http://localhost:3000/feed/chapter/chapter_day3_evening_meal
http://localhost:3000/subscriptions?as=viewer
```

Light / dark · 徵召票底圖切換 · type-check 綠燈

---

## Quick win

**現在進行中（2026-05-24 起）**：Phase 0 — cli 骨架 / sdk scaffold / contract-ids / skill 改名 / (site)+(admin) 重構。詳見「鏈上架構 · Phase 路線圖」。

**已完成的 web 端**（保留供參考）：Round 1 + Round 3#7-#8 設計已落地；i18n 留到比賽前定稿時做。
