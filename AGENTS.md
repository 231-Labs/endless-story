# Endless Story · AGENTS.md

> 給下一個 session 的接班備忘（**唯一維護檔**）。Repo: [231-Labs/endless-story](https://github.com/231-Labs/endless-story)
> 比賽：Sui Overflow 2026 · Walrus 賽道，提交 deadline **2026-06-21**
> 舊 repo `/Users/harperdelaviga/Endless-Story`（**只讀對照，不要動**）

---

## 一句話

「住在 Walrus 上的梨園 — 角色不是 JPG、是活著的記憶資產」。
用 MemWal SDK 把角色記憶、章回、衍生作品永久上鏈 Walrus、Sui NFT 持有 IP。

---

## 開發

```bash
cd /Users/harperdelaviga/endless-story-new
nvm use                                       # .nvmrc 鎖 23.7.0 (codegen 需 ≥ 20.11)
pnpm --filter @endless-story/web dev          # http://localhost:3000
pnpm -r type-check                            # 全 repo 綠燈確認
```

**Preview tools 可用** — `.claude/launch.json` 配好 `web` server，`preview_start("web")` 即可。

---

## 敘事引擎方向（唯一真相）

> **[docs/NARRATIVE_AGENTS.md](./docs/NARRATIVE_AGENTS.md)** = 敘事層唯一設計文件。
> 兩個自治 agent（Director 導演 / Character 角色）、目標 C 級全自治、chain-first +
> MemWal-native 重建（不抄舊實作）。所有敘事開發參照它;§8 有缺口 + 建置順序(N1-N6)。
>
> **[docs/CHARACTER_ECONOMY.md](./docs/CHARACTER_ECONOMY.md)** = 角色經濟 life cycle 設計
> （NARRATIVE_AGENTS §7 經濟層的展開）。dailyCost / saga 混合發薪 / 真實持幣+角色間轉帳 /
> 雙軌死亡(經濟+隱藏年齡 hazard) / 世代交替。機制已用純模擬 `packages/economy` 學術驗證通過
> (12/12 測試、6 假說成立)；產品化 Part D 為 gate-after。分支 `feat/character-economy`。

---

## 目前進度（2026-06-02）

**一句話狀態**：合約 / runner / web 已經不是 Phase 2 placeholder；目前進入「demo 穩定化 + 部署 + 影片素材」階段。

### 已經落地

- **合約 1.6 / 1.7 已有**：`event.move`、`commitment.move` 在 repo 內，runner 章回 / 公報 / drama beat 都走 Walrus + `commitment::commit` anchor。
- **Runner 自治 tick v1 已接通**：`runTickLoopAction` 順序為 `PLAN → MOVE → DRAMA → SOCIAL → ACT → POV → SLEEP → GAZETTE`。
- **角色認知 v1 已接通**：
  - mint 後 `redeemVoucher → seedGenesisMemoryAction` 會 seed self genesis、主觀 relationship memories、最多 3 位既有角色的 reciprocal observation。
  - 每輪 tick 建 saga roster snapshot：`id/name/role/gender/age/brief/currentScene`。
  - `role` 來源：chain `role:*` tag → recruitment specialty → `—`。
  - roster 會注入 `PLAN / MOVE / SOCIAL / ACT / POV`，讓角色知道誰是花旦、小生、同場人物。
  - relationship hint 是雙源：先讀角色自己的 MemWal `relationship` memory，再合併 on-chain `RelationshipSeeded`（標明「自己的人物印象」vs「導演公開牽起」）。
- **輕量 SOCIAL phase 已接通**：
  - 只跑不在 open event 的角色。
  - 輸出 `observe | talk | idle`；`talk` 目標必須同 scene。
  - 成功互動會寫 speaker observation、target `[聽見：角色名]` observation、必要時寫 speaker relationship memory，並更新 `scene-lines` 供前端手卷顯示。
  - 已修正：MOVE 後本輪 in-memory scene snapshot 會更新，避免 SOCIAL 用移動前位置造成跨 scene 對話。
- **Drama 整合已驗證方向正確**：用孟雲屏 / 顧驚鴻 / 柳生春 dry-run 時，`與孟雲屏搭戲` 張力落在顧 / 柳身上，孟雲屏本人不會被當作搶搭檔位的人。
- **MemWal 三因子 metadata / 自架 relayer 方向已開**：
  - `packages/relayer` 已有自架 relayer skeleton。
  - MemWal remember 會把 kind / importance / day metadata 送進 relayer，支援真三因子召回。
  - 人物頁 memory count 已能走 relayer `/api/count`，不再只是 placeholder。
- **角色經濟驗證已完成**：`packages/economy` 純模擬 12/12 綠，角色頁 survival 已接 off-chain shadow；產品化 tick settle / give phase 還沒進主 loop。
- **部署文件已補**：見 `docs/DEPLOYMENT.md`，方向是 Vercel 放 web，Zeabur/Contabo 放 relayer + world-loop。

### 已驗證 / 已知限制

- `pnpm --filter @endless-story/runner type-check` 綠。
- `pnpm --filter @endless-story/web type-check` 綠。
- repo-wide `pnpm -r type-check` 可能因未安裝 `packages/economy` 的 local deps / `tsc` 而失敗；不要把它誤判成 runner/web 改動失敗。
- 連續多輪 dry-run 會打到 MemWal / SEAL `fetchKeys` 429。自架 MemWal relayer 可改善 indexing/recall 壓力，但 SEAL key server 429 是另一層；demo 前先用 `MEMWAL_RECALL_CONCURRENCY=1`、降低 recall limit、做 per-tick recall cache。

---

## 鏈上架構（2026-05-24 拍板，不可漂移）

> 合約 / SDK / runner / web 之間的**契約**。任何 session 不准踰越。

### 七條核心原則

1. **依賴單向** — `web → sdk + memwal + llm` ／ `runner → sdk + memwal + llm` ／ `cli → sdk + shared`。`sdk` 不准 import `web`；`shared` 不准 import 任何上層
2. **`sdk` 是鏈上互動唯一入口** — 不准自己 `new SuiClient()`、不准自己手寫 PTB
3. **`memwal` 是 Walrus / Seal 唯一入口** — 不准 import `@mysten/walrus` 或 `@mysten/seal`
4. **`llm` 是文字 / 圖片 AI 唯一入口** — 不准 `fetch('https://api.poe.com/...')`、import `@anthropic-ai/sdk` / `openai`、散落 prompt 模板
5. **`shared/src/contract-ids.ts` 是部署輸出單一真相** — `cli` 寫入，sdk/runner/web 只讀
6. **server actions 優先** — admin 操作走 `web/src/lib/actions/`，除非要 webhook / SSE / RSS 才開 `app/api/`
7. **`(site)` / `(admin)` route group 嚴格隔離** — admin layout + middleware 獨立

### 目錄契約

```
contracts/endless_story/sources/   Move 模組
packages/
  shared/    型別 + contract-ids；零依賴
  sdk/       鏈上唯一入口（generated/ + client.ts + tx/ + read/，node 部分在 ./node 子路徑）
  memwal/    Walrus + Seal 唯一入口（含 blob put/url helper）
  llm/       Poe + Anthropic 文字 + OpenAI 圖片 + prompt 模板 + HKDF seed roll
  cli/       deploy + bootstrap + reset + test-e2e + stories preset JSONs
  runner/    Agent / scheduler (Phase 4 stub → 賽前要遷移完整版)
  web/       UI；app/(site)/* + app/(admin)/* 隔離
```

### 內容存取模型（公開 vs 私密）

> 任何**新的內容 surface** 都要先歸到下面其一，別忘了 gate。

| 內容 | 誰可讀 | 實作 |
|---|---|---|
| **公報 gazette** | **公開**（所有人） | `/feed`，無 gate |
| **POV 章回** | owner + 訂閱者 | `ChainPovSection`（client，`useCurrentAccount` + `listSubscriptionsForAddress`），body client 端 fetch |
| **反思 reflection** | owner（+ 訂閱者 TODO） | `ReflectionsSection`（client gate） |
| **夢 / 耳語 intervention** | owner | `InterventionComposerGate` / mask |

**鐵則**：
- gate 一律 **client 端** 用 `useCurrentAccount()`，**不要**信 server 的 `?as=` viewerWallet（那是 mock-era debug，會 fallback 成假錢包）。
- 私密 body **client 端才 fetch**（`/api/blob/<id>`），非讀者的 HTML payload **不得**含內文。
- 非讀者保留 **on-chain anchor** 連結（憑證可公開驗），但**隱藏 walrus 直連**（否則繞過 gate 看明文）。
- 這層是 **UX gate 不是密碼學 gate** — blob 在 Walrus 上仍明文。真正私密 = Seal（見 seal backlog memory）。

---

## 已完成

**Phase 0–2 全部就位 + Runner v1 已可 demo**（commits `f99d28f` → 最新）：

- **合約 1.1–1.5c**：currency / faucet / world / saga / scene / character / recruit，47 unit tests 綠燈，徵召 voucher mint → redeem → character + cap 完整可用
- **SDK 2.1/2.2**：codegen + tx/read wrappers（thin、type-friendly、recruit-build acceptance 過）
- **`packages/llm/`**：Poe + Anthropic 文字 + OpenAI gpt-image-2 + prompt 模板 + HKDF seed roll（smoke test 過）
- **`memwal` blob API**：putBlob / getBlobUrl（testnet/mainnet publisher endpoint）
- **Web 4 個 server actions**：moderate-prompt / preview-character / generate-portrait / redeem-voucher
- **CLI**：bootstrap.ts（4 sequential txs，從 story preset JSON 讀），test-recruit-e2e.ts，story preset 系統 (`packages/cli/scripts/stories/{spring-snow,minimal}.json`)
- **Admin UI**：
  - `/admin/deploy`：① deploy / ② bootstrap / ③ seed 職缺（story preset dropdown）
  - `/admin/recruitments`：鏈下 JSON CRUD（新增 / 編輯 / 上下架 / 刪除）
  - Faucet 設定面板（drip 量、cooldown、供給上限、暫停 — 全 admin 可調）
- **User 端**：dapp-kit 1.x 整合 + MockWalletMenu 內整合連結錢包 + ENDLESS 餘額 + 領 ENDLESS（admin 自動走 admin_mint 繞 cooldown）
- **抽卡 wizard**：RecruitmentTicket 改造完，prompt → moderate → mint voucher (user sign) → LLM preview → accept → portrait → auto-redeem (admin server action) → 跳 `/dossier?id=<chain id>`
- **`/dossier?id=X`**：偵測 Sui object id → 走 SDK chain-read（fallback mock for demo ids）
- **Devnet object-version race**：mint PTB 加自動 retry 一次
- **Runner v1**：PLAN / MOVE / DRAMA / SOCIAL / ACT / POV / SLEEP / GAZETTE 已串成一鍵 tick；SOCIAL / roster cognition / subjective relationship memory 已接。
- **Drama engine**：`packages/drama` + scarce resource tension 已接進 tick；role tag / recruitment fallback 已能讓小生競爭搭檔位。
- **Relayer / MemWal metadata**：自架 relayer skeleton + three-factor metadata + memory count API 已有。
- **Economy shadow**：角色頁 survival 已接 off-chain shadow；純模擬驗證完成。

### 設計拍板（2026-05-25）

- **抽卡模型**：1 voucher = 1 roll = 1 candidate。失敗 voucher 過期不退費，UX 用「緣寂」收尾，**不做轉投別行當**
- **共簽機制**：server action + admin keypair 自動 redeem（策展權在發布職缺階段，不在每個 redeem）
- **預覽生成**：真實 LLM（Poe → Sonnet/GLM-4.6 + OpenAI gpt-image-2）；roll 用 voucher.attribute_seed 做 HKDF 確定性（同 seed = 同角色）
- **Portrait 儲存**：Walrus testnet publisher/aggregator
- **Story preset**：world + saga + locations + scenes + recruitments 都在 `cli/scripts/stories/<id>.json`，bootstrap 跟 seed 都從 preset 讀

---

## 下一步（6/21 deadline 前）

| # | 項目 | 範圍 | 估時 |
|---|---|---|---|
| **S** | **Runner 穩定化 / Demo acceptance** | per-tick recall cache、SEAL 429 backoff、`MEMWAL_RECALL_CONCURRENCY=1` 預設、顧/柳/孟 2 tick 驗證、SOCIAL memory 不寫未授權重設定 | 1–2d |
| **D** | **部署策略落地** | Vercel web + Zeabur/Contabo relayer + world-loop；設定 `MEMWAL_SERVER_URL`、tick secret、pause control；按 `docs/DEPLOYMENT.md` 跑 smoke | 1–2d |
| **E** | **角色經濟產品化 Part D** | web adapter / SETTLE phase / GIVE phase / 日界發薪扣 cost / vitality & death hook；若 demo 時間不夠可先保留 shadow | 2–4d |
| **I** | **Web i18n** | `next-intl` framework + 抽既有文案 + LocaleToggle + `romanize-name`（中文 → 拼音） | 2–3d |
| **V** | **Demo / Trailer 素材** | 跑 2–3 tick 產章回 + 手卷錄屏；剪 trailer；首頁 placeholder 換真內容；需要預留 LLM/影片生成時間 | 2–4d |

**順序建議**：先 S（否則 demo 不穩）→ D（部署可跑）→ V（開始攢素材）；E / I 視時間切入。不要再從舊 repo 搬大 runner，只補現在 v1 的缺口。

---

## E2E 跑通手冊（從零到 mint）

> 所有 code path 已就位。**devnet 偶爾整集群掛**（"no healthy upstream"），demo 前切 testnet 比較穩。

**0. 一次性 env 設定**（`packages/web/.env.local`）：

```bash
nvm use
sui client switch --env testnet   # 推薦；或 devnet 但要 status.sui.io 確認
sui client faucet

cat > packages/web/.env.local <<'EOF'
POE_API_KEY=...                        # https://poe.com/api_key
OPENAI_API_KEY=sk-...                  # https://platform.openai.com/api-keys
SUI_ADMIN_PRIVATE_KEY=suiprivkey1...   # 同 cli admin；export 自 sui keytool
RECRUITMENT_MOD_SECRET=<openssl rand -hex 32>

# MemWal（角色長期記憶 / recall + remember）— 缺這些時 recall→[]、remember→false，
# 敘事仍可跑，只是沒有長期記憶。需 testnet（SEAL 不在 devnet）。
MEMWAL_PRIVATE_KEY=...                  # ed25519 delegate 私鑰（dashboard 產）
MEMWAL_ACCOUNT_ID=0x...                 # MemWalAccount object id（dashboard 產）
# MEMWAL_SERVER_URL 可省 — testnet 自動用 staging relayer；自架後填 https://<relayer>
MEMWAL_RECALL_CONCURRENCY=1             # demo 建議先 1；連續 dry-run 易打到 SEAL fetchKeys 429
EOF
```

> **MemWal 取得憑證**（賽道硬需求 · 不用寫腳本）：到 **dashboard** 直接產
> delegate key + account id：
> - **testnet（我們用這個）**：https://staging.memwal.ai → relayer `https://relayer.staging.memwal.ai`
> - mainnet：https://memwal.ai → relayer `https://relayer.memwal.ai`
>
> 把產出的私鑰填 `MEMWAL_PRIVATE_KEY`、account id 填 `MEMWAL_ACCOUNT_ID`。
> relayer URL 可先不填 —`memory.ts` 依網路自動選（testnet→staging）。
> 若用自架 relayer（建議 demo 前做），填 `MEMWAL_SERVER_URL=https://<你的 relayer>`。
> 注意：自架 relayer 主要解 indexing / recall 服務壓力；SEAL key server 的 `fetchKeys`
> 429 是另一層，仍需用低 concurrency / cache / backoff 控制。
>
> **架構**：我們走 `MemWalManual`（client 端 SEAL，patch 成打我們的
> `endless_story::character::seal_approve_control/_owner`，非 upstream
> `memwal::account`）。accountId 只供 relayer 認證 + 向量索引，**不 gate SEAL**
> （SEAL 由角色的 ControlCap/OwnerCap 管）。client 端 embed 用 `OPENAI_API_KEY`。
> 程式碼：`web/lib/chain/memory.ts` → pov-core + run-reflection 已接；
> `SagaMemoryClient`（ControlCap 寫）/`OwnerAuditClient`（OwnerCap 讀）在 `packages/memwal`。

**1. 部署 + 種子化**：開 `http://localhost:3000/admin/deploy` → 上方下拉選 STORY (spring-snow / minimal) + ENV → 依序點 ① deploy → ② bootstrap → ③ seed 職缺。`contract-ids.ts` 會被覆寫。

**2. （可選）調 Faucet**：同頁底部 Faucet 設定 — 改 drip 量、cooldown 等，套用。

**3. User mint 流程**：
```
http://localhost:3000/
→ 右上 MockWalletMenu hover → 連結錢包 (dapp-kit, 同網路)
→ 「領 ENDLESS」 (admin 自動走 admin_mint; user 走 drip)
→ 第二屏徵召 carousel，點任一張票「應榜」
→ 寫描述 → 擲牌 (moderate → mint_voucher user-sign → LLM preview)
→ 揭曉 (1 候選 + rolled 屬性) → 接受 → painting (LLM curate + OpenAI + Walrus)
→ 配像 → 入班 (server action admin keypair auto-redeem)
→ 跳 /dossier?id=<0x…> 顯示鏈上 Character
```

**失敗排查**：
- `[mint] unavailable for consumption` → devnet 抖；wizard 已自動 retry 一次，再失敗就刷新瀏覽器或切 testnet
- `[mint] Failed to fetch wallet-rpc.devnet.sui.io` → Slush 自己內部 RPC 掛了，看 status.sui.io
- 「請先連結錢包」→ 右上點 ConnectModal
- 「梨園尚未種子化」→ 跑 admin /deploy ② bootstrap
- LLM 500 → 檢查 POE_API_KEY / OPENAI_API_KEY
- redeem 失敗 → 檢查 SUI_ADMIN_PRIVATE_KEY 對 + storyteller cap 在這把鑰匙

---

## 設計系統（精簡）

### Theme tokens（語意色，不是 Tailwind 預設）

`canvas`（body 底）/ `surface`（卡 nav sticky）/ `elevated`（modal popover）/ `ink`（主文字）/ `mute`（次文字）/ `hairline`（邊線）/ `cinnabar`（accent，dark=暖金）/ `jade`（次 accent）/ `seal`（cinnabar hover）

定義在 `packages/web/src/app/globals.css` `:root` + `.dark`。Tailwind 用 `bg-canvas` / `text-ink` 等（`darkMode: 'class'`）。

### Dark mode 鐵律

**canvas 不能同時當 body 跟卡片背景。** body → `bg-canvas`；卡/nav/sticky → `bg-surface`；modal/floating → `bg-elevated`；input/凹陷 → `bg-canvas dark:bg-canvas/40`。

Tailwind 預設色（`bg-stone-*` 等）一定要配 `dark:`。重複 className → 抽到 `globals.css @layer components` 的 `.es-*` utility（`.es-icon-button`、`.es-soft-panel`、`.es-field`、`.es-choice-card`、`.es-outline-button`、`.es-page-lead-eyebrow|title`）。

### 動畫

- Enter: `requestAnimationFrame` 後 toggle → `translate-y-4 opacity-0` → `translate-y-0 opacity-100`，`duration-300 ease-out`
- Exit: 反向 + `setTimeout` 280ms 才 unmount
- Stage 切換: `key={stage}` + `.animate-fade-in-up`

---

## 不要

**架構**
- ❌ 繞過 `sdk` 直接 `new SuiClient()`（原則 2）
- ❌ web/runner 直接 import `@mysten/walrus|seal`（走 memwal，原則 3）
- ❌ web/runner 直接 `fetch` Poe / OpenAI / Anthropic 或散落 prompt（走 llm，原則 4）
- ❌ 手動編輯 `shared/src/contract-ids.ts`（cli 寫入，原則 5）
- ❌ 在 `(site)` route 放 admin 操作（原則 7）
- ❌ 繞過 `web/src/lib/api/` facade

**UI**
- ❌ raw Tailwind 色不加 `dark:`
- ❌ 用 `bg-canvas` 當卡片背景
- ❌ 重複 className → 抽 `.es-*`
- ❌ 入班自動跳轉（要手動 CTA）

**Repo / 環境**
- ❌ 動老 repo `Endless-Story`
- ❌ 雙份維護 `AGENTS.md` / `CLAUDE.md`
- ❌ 用拼音 skill 名（已禁 wuxia / xianxia 等）
- ❌ devnet 掛了切 testnet 不跟使用者確認

---

## 接班啟動 prompt

```
讀 /Users/harperdelaviga/endless-story-new/AGENTS.md，照「下一步」順序開工。
先做 S：Runner 穩定化 / Demo acceptance（per-tick recall cache、SEAL 429 backoff、
顧/柳/孟 2 tick 驗證）。不要回頭從 1.6/1.7 開始；不要搬舊 repo 大 runner。
每完成一個小步驟跟我回報；commit 由我決定時機。
```
