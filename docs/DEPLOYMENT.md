# Endless Story — 部署指南 (DEPLOYMENT)

> 一句話心法：**Vercel 放網站、VPS(Zeabur/Contabo) 放 relayer + world-loop、合約發一次到 Sui、其餘都是 API key。** 就這四件。
>
> 你「自架」的只有兩個常駐服務：**MemWal relayer** 與 **world-loop runner**。Walrus、SEAL、LLM、embedding 全部用外部/託管,只填 env,不部署。

---

## 0. 拓撲總覽

```
                         瀏覽器(人類使用者)
                              │
        ┌─────────────── Vercel ───────────────┐
        │  packages/web  (Next.js)             │
        │  · UI / dossier / admin 後台          │
        │  · 讀鏈                                │
        │  · POST /api/tick (maxDuration 300s)  │ ← 一個 tick 在這裡執行
        └───────────────────────────────────────┘
                              ▲ HTTP (Bearer TICK_LOOP_SECRET)
                              │
   ┌──────────── Contabo VPS (經 Zeabur) ────────────┐
   │  world-loop runner   每 N 分打一次 /api/tick      │ ← 自治世界的「心跳」
   │  relayer (MemWal)    三因子召回 + Walrus 上傳中繼  │
   │      └ sqlite-vec / pgvector  (向量 + metadata)   │
   └───────────────────────────────────────────────────┘
                              │ 三者都只是「打 API」去外部：
                              ▼
   Sui(合約) · Poe(LLM) · OpenAI(embed+image) · Walrus(publisher/aggregator) · SEAL(key servers)
```

**control plane vs data plane**：web = 控制面(UI、按鈕、讀取);VPS = 資料面/引擎(長跑、重 LLM、排程)。重而慢的東西別放 Vercel serverless。

---

## 1. 組件清單

| # | 組件 | 是什麼 | 部署到 | 你要做 |
|---|---|---|---|---|
| 1 | `packages/web` | Next.js 前端 + server actions + `/api/tick` | **Vercel** | 跟以前一樣 push（設 root = `packages/web`） |
| 2 | `packages/relayer`（新增） | MemWal 自架 relayer：召回 + Walrus 上傳中繼 | **Zeabur → VPS** | 新建一個 service |
| 3 | world-loop runner | `packages/cli/scripts/world-loop.ts`：每 N 分打 `/api/tick` | **Zeabur → VPS** | 新建一個 service（常駐 / cron） |
| 4 | `contracts/endless_story` | Sui Move 合約 | **Sui 鏈**（發一次） | `publish`，把 ids 寫進 `packages/shared/.../contract-ids.ts` |
| 5 | 向量 store | relayer 的索引 | **VPS 上 sqlite 檔** 或 pgvector | 跟 relayer 一起 |
| — | Poe / OpenAI / Walrus / SEAL / Sui RPC | 外部服務 | 別人家 | **只填 env，不部署** |

> 函式庫（`packages/sdk` `shared` `memwal` `llm` `drama` `economy`）**不單獨部署**——它們被 web / relayer / runner 引用。`economy` 只做驗證,永不上線。

---

## 2. Monorepo → 部署目標（一個公開 repo）

```
endless-story-new/                 ← 參賽公開這一個 repo
├── contracts/endless_story/       → publish 到 Sui
├── packages/
│   ├── web/        → Vercel        (root dir = packages/web)
│   ├── relayer/    → Zeabur svc A  (root dir = packages/relayer)   ← 新增
│   ├── cli/        → Zeabur svc B  (跑 scripts/world-loop.ts)
│   ├── runner/     → 共用 agent 程式（被 web 引用）
│   ├── economy/    → 只驗證,不部署
│   └── memwal/ sdk/ shared/ llm/ drama/ → 函式庫
└── docs/DEPLOYMENT.md              ← 本檔
```

Zeabur 支援 monorepo：同一 repo 建多個 service,各自指定 root 目錄。所以 **web 在 Vercel、relayer + world-loop 在 Zeabur,全來自這一個 repo。**

---

## 3. 各服務部署

### 3.1 web → Vercel
- Root directory：`packages/web`。Framework：Next.js（自動偵測）。
- `/api/tick` 已設 `runtime='nodejs'`、`maxDuration=300`（5 分鐘）→ **小型 demo 世界一個 tick 跑得完**。
- 若之後世界變大、一個 tick 超過 300s：把 tick 執行搬到 VPS（見 3.3 進階），web 只留 UI + 讀取。

### 3.2 relayer → Zeabur（Contabo VPS）
- Root：`packages/relayer`。一個 HTTP 服務,提供 `/api/remember/manual`、`/api/recall/manual`（含三因子評分 + pin + relevance floor，見 `docs/CHARACTER_ECONOMY.md` / MemWal 設計）。
- 依賴：① 向量 store（3.5）② 一個 Walrus **publisher** URL（remember 時轉上 Walrus）。
- **不持有 SEAL 金鑰**：解密留在 client（threshold SEAL），relayer 全程看不到明文。
- web/runner 端設 `MEMWAL_SERVER_URL = https://<你的 relayer 網域>`。

### 3.3 world-loop runner → Zeabur（Contabo VPS）
- 跑 `packages/cli/scripts/world-loop.ts`（`packages/cli` 也有 `pnpm start` → `world-loop`；支援 `--interval` / `--max` / `--dry-run` / `--max-characters` / `--no-pov` / `--showrunner-every` 等,序列等每 tick 完成、永不重疊）。
- **每個 flag 都有 env fallback（`flag > env > default`）**,所以 standalone service 部署可以完全只靠 env 調參,不必傳 CLI flag：`WORLD_LOOP_INTERVAL` / `WORLD_LOOP_MAX_TICKS` / `WORLD_LOOP_MAX_CHARACTERS` / `SHOWRUNNER_EVERY_TICKS`,以及實驗閘 `TICK_*`(與 web 端同名,一份 `.env` 兩個 service 通用;runner 把它們塞進 POST body,body 只會 force ON)。完整清單見 `world-loop.ts` 檔頭。
- 它**很薄**：只是定時 HTTP 打 `WORLD_LOOP_URL`(= Vercel 的 `/api/tick`),帶 `Authorization: Bearer <TICK_LOOP_SECRET>`。重活（LLM/Sui/MemWal）都在 `/api/tick` 內(Vercel)執行。
- 所以這個 service **最低只需要 `WORLD_LOOP_URL` + `TICK_LOOP_SECRET` 兩個 env**；若要遠端暫停，加 `RUNNER_CONTROL_URL=https://<relayer>/control`，或填 `MEMWAL_SERVER_URL=https://<relayer>` 讓它自動用 `/control`。
- **進階（世界變大時）**：讓 world-loop 直接 in-process 跑 tick 邏輯(不經 Vercel),此時它才需要全套 keys（LLM/Sui/MemWal）。MVP 不用。

### 3.4 合約 → Sui publish（發一次）
- `sui client publish`（或專案的 `cli bootstrap` / `/devnet-bootstrap` skill）發到 testnet→mainnet。
- 把回傳的 package id / object ids 寫進 `packages/shared/src/contract-ids.ts`（**這份 commit 進 repo,不是 secret**）。
- 換網路 = 重發 + 更新 ids。

### 3.5 向量 store（relayer 用）
| 選項 | 適合 | 註 |
|---|---|---|
| **in-memory + 落盤** | 本機/起步 | 向量小（1536×4B≈6KB/條,1 萬條才 60MB）,暴力召回 sub-ms,零 DB 依賴 |
| **sqlite-vec**（單檔） | 小 VPS | ≤ ~10 萬向量綽綽有餘,跑哪都行 |
| **pgvector**（Postgres） | 想要正規 DB | 可託管（Neon/Supabase）,日後加過濾/ANN 方便 |

> 設計提醒：把 remember 當下送來的 `vector + metadata` **持久化**,靠它重建索引,**永不靠 re-embed → relayer 不需要解密金鑰、保持 plaintext-blind**。

---

## 4. 環境變數（依 host 分,★=機密,絕不進 repo）

> 變數名以現有程式為準（grep `process.env`）。`NEXT_PUBLIC_*` 是前端可見的編譯期變數。

**Vercel（web）**
| 變數 | 用途 | ★ |
|---|---|---|
| `NEXT_PUBLIC_SUI_NETWORK` / `SUI_NETWORK` | 網路（testnet/mainnet） | |
| `NEXT_PUBLIC_DATA_SOURCE` / `NEXT_PUBLIC_API_BASE_URL` | 前端資料來源 | |
| `SUI_ADMIN_PRIVATE_KEY`（或 `SUI_PRIVATE_KEY`） | admin 上鏈（tick/mint/settle） | ★ |
| `POE_API_KEY` | LLM（GLM-4.6 / GLM-5.1） | ★ |
| `OPENAI_API_KEY` | embedding + 圖像（gpt-image-2） | ★ |
| `MEMWAL_SERVER_URL` | → 指向你 VPS 的 relayer | |
| `MEMWAL_PRIVATE_KEY` / `MEMWAL_DELEGATE_KEY` / `MEMWAL_ACCOUNT_ID` | MemWal client 憑證 | ★ |
| `MEMWAL_RECALL_CONCURRENCY` | 召回併發（SEAL 429 防護,demo 建議/程式預設 1） | |
| `TICK_LOOP_SECRET` | `/api/tick` 鑑權（與 runner 同值） | ★ |
| `RECRUITMENT_MOD_SECRET` / `MODERATION_ALLOW_UNCONFIGURED` | 招募/審核 | ★ |
| `DEMO_CLIPS_URL` / `DEMO_CLIPS_FILE` | 首頁 demo/trailer clips JSON override；沒填會讀 `public/demo-clips.json`，再 fallback mock | |
| `CHAIN_READ_CACHE_TTL_MS` | 公開 chain reads 的短 TTL cache；預設 10–15s，填 `0` 可關閉 | |

**Zeabur — world-loop runner**
| 變數 | 用途 | ★ |
|---|---|---|
| `WORLD_LOOP_URL` | = Vercel web base URL（`https://<web>`；完整 `/api/tick` URL 也可） | |
| `TICK_LOOP_SECRET` | 與 web 同值 | ★ |
| `RUNNER_CONTROL_URL` | = relayer 的 `https://<relayer>/control`；回 `{paused:true}` 時跳過 tick | |
| `MEMWAL_SERVER_URL` | 若沒填 `RUNNER_CONTROL_URL`，world-loop 會用 `<MEMWAL_SERVER_URL>/control` | |
| `RUNNER_CONTROL_SECRET` / `RELAYER_SECRET` | 若控制端 GET 也加 bearer，填同值；目前自架 relayer 的 GET `/control` 預設開放讀 | |
| `WORLD_LOOP_INTERVAL` / `WORLD_LOOP_MAX_TICKS` / `WORLD_LOOP_MAX_CHARACTERS` | standalone 調參（= `--interval` / `--max` / `--max-characters` 的 env fallback；沒傳 flag 時生效） | |
| `SHOWRUNNER_EVERY_TICKS` | 每 N tick 跑一次 Showrunner heartbeat（= `--showrunner-every`） | |
| `TICK_EVENT_SPINE` / `TICK_PARALLEL_EVENTS` / `TICK_ATTENTION_BUDGET` / `TICK_RIVAL_GRAVITY` / `TICK_LLM_FRAMING` / `TICK_DIRECTOR_RESOURCES` / `TICK_MAX_CONCURRENT_EVENTS` | 實驗閘,與 web 端同名（一份 `.env` 兩 service 共用）；`=1` 開。見 `docs/EVENT_LIFECYCLE.md` | |
| （進階 in-process 模式才要全套 LLM/Sui/MemWal keys） | | ★ |

**Zeabur — relayer**
| 變數 | 用途 | ★ |
|---|---|---|
| Walrus publisher / aggregator URL | 上傳/下載 blob（公開 testnet 免費） | |
| 向量 store 路徑 / 連線字串 | sqlite 檔或 pgvector DSN | （DSN ★） |
| `PORT` 等 | 服務埠 | |

---

## 5. Runner 開關現在怎麼接（你的問題）

**現況**：`AdminPanel.tsx` 的開關已改成呼叫 web server action → relayer `/control`。真正驅動自治的是 VPS 上的 world-loop 程式；admin 只寫入/讀取 pause flag。

**要讓它變成真遙控（建議,很輕）**：
1. 在 relayer（或一個小端點）放一個持久旗標 `runnerPaused`：`GET /control` 回狀態、`POST /control` 寫值。
2. world-loop 每圈開頭讀 `GET /control`,`paused` 就跳過這次 tick。已支援 `RUNNER_CONTROL_URL`，endpoint 暫時不可用時只 warning 並照跑，避免控制服務抖動把世界停死。
3. admin 開關已呼叫 `POST /control`，進頁時讀 `GET /control` 顯示真實狀態（running / paused）。若未設定 `RUNNER_CONTROL_URL` / `MEMWAL_SERVER_URL`，會顯示「尚未設定」。

→ 那顆按鈕從「裝飾」升級成「真正暫停/恢復 VPS 自治引擎」。在那之前,你也可以直接用 **Zeabur 後台 start/stop world-loop service** 當總開關。

---

## 6. 外部服務（只設定,不部署）
| 服務 | 給什麼 | 現階段 |
|---|---|---|
| Poe | `POE_API_KEY` | GLM-4.6 / 5.1 |
| OpenAI | `OPENAI_API_KEY` | text-embedding-3-small + gpt-image-2 |
| Walrus | publisher / aggregator URL | 公開 testnet 免費；mainnet WAL 成本 ~$0（見 CHARACTER_ECONOMY §2.3） |
| SEAL | 託管 key servers | testnet 自動；**不自架** |
| Sui RPC | fullnode RPC（公開或 provider） | 對應網路 |

---

## 7. 安全（參賽公開 repo 必讀）
- **所有 `.env` 進 `.gitignore`**；真值只填在 Vercel / Zeabur 後台。
- `SUI_ADMIN_PRIVATE_KEY`、各 API key、`MEMWAL_*_KEY`、`TICK_LOOP_SECRET` **絕不 commit**。
- `contract-ids.ts`（package/object ids）**可以 commit**——那是公開地址,不是機密。
- relayer 保持 **plaintext-blind**（不放 SEAL 解密金鑰）。
- `/api/tick` 上線務必設 `TICK_LOOP_SECRET`（不設會開放任何人觸發 tick、燒你 LLM 錢）。

---

## 8. 首次部署 checklist
1. [ ] 部署前 preflight：`pnpm --filter @endless-story/cli run deploy-preflight -- --env testnet --json-out=/private/tmp/endless-story-deploy-preflight.json`，確認 active-env、admin signer、gas、Move build。若 gas 不足，去 Sui faucet Web UI 補到至少 2.5 SUI。
2. [ ] `publish` 合約到目標網路 → 更新 `contract-ids.ts` → commit。
3. [ ] `bootstrap` 目標 story preset → 更新 world/saga/scene/faucet/dream ids → commit。
4. [ ] Vercel：部署 `packages/web`,填上表 env（含 `TICK_LOOP_SECRET`、`MEMWAL_SERVER_URL` 暫留空/本機）。
5. [ ] 把 `packages/relayer` 加進 monorepo;Zeabur 建 service A（root=`packages/relayer`）+ 向量 store + Walrus URL → 拿到 relayer 網域。
6. [ ] 回填 web 的 `MEMWAL_SERVER_URL = https://<relayer>` 重新部署。
7. [ ] 若用 drama demo cast：跑 `pnpm --filter @endless-story/cli run seed-cast -- --env testnet --tag-existing` 補舊 cast 的 `role:*` tags；若剛重新 mint，`seed-cast` 會自動寫 tag。
8. [ ] Zeabur 建 service B（root=`packages/cli`）跑 `pnpm start`,填 `WORLD_LOOP_URL=https://<web>` + `TICK_LOOP_SECRET`；若 relayer 已上線，再填 `RUNNER_CONTROL_URL=https://<relayer>/control` 或 `MEMWAL_SERVER_URL=https://<relayer>`。
9. [ ] 安全 smoke（不上鏈）：`pnpm --filter @endless-story/cli run world-loop -- --max=1 --dry-run --max-characters=1 --no-sleep --no-gazette --json-out=/private/tmp/endless-story-smoke.json`，看到 `規劃1 · 張力… · 章回1`。有限輪數 smoke 若遇到 HTTP 500 / 非 JSON / `ok:false` 會 exit 1。
10. [ ] 快速 drama/social inspection（不上鏈、不跑章回）：同上加 `--no-pov --character-ids=<孟>,<顧>,<柳> --max-characters=3`，幾十秒內檢查 `drama.top` / `social` 明細，不用等三篇 POV。也可在 `/admin/stage`（戲台；舊 `/admin/director` 已 redirect 到此）關「含 POV 章回」並按「孟/顧/柳」快捷填入後跑 dry-run。注意 dry-run 不寫 memory、scene-lines 或鏈上 anchor；第二輪 POV 召回要等真跑或測試專用記憶層驗。
11. [ ] Demo cast smoke（不上鏈）：去掉 `--no-pov`，加 `--character-ids=<孟>,<顧>,<柳> --max-characters=3 --json-out=/private/tmp/endless-story-gu-liu-meng-dryrun.json` 精準驗三人並保存完整結果，不靠角色列表排序。
12. [ ] 真 tick smoke：admin 手動「自治推進一個 tick」或 world-loop 不加 `--dry-run` 跑一次 → 看 POV/公報生成 → 確認 world-loop 自動跑起來。
13. [ ] 放首頁影片素材：把剪好的 clips 寫成 `packages/web/public/demo-clips.json`（格式見 `demo-clips.example.json`），或部署時填 `DEMO_CLIPS_URL` / `DEMO_CLIPS_FILE`。
14. [ ] 開 `/admin/deploy` 看 Runtime 連線：relayer `/health`、runner `/control`、demo clips、chain-read cache 都應該顯示 OK / fallback 原因。
15. [ ] 開 `/admin` 確認 Runner 開關能讀到 relayer `/control`，切到 paused 後 world-loop 下一輪顯示 skipped。

> 注意：2026-06-01 那版 testnet deployment 與最新 `event.move` / generated SDK 不完全一致，`--tag-existing` 會遇到 `FunctionNotFound`。重新 deploy/bootstrap 後再跑。

---

> 比你以前「只丟 Vercel」多出來的,**就只有 VPS 上那兩個常駐服務（relayer + world-loop）**。其餘要嘛還在 Vercel、要嘛發一次鏈、要嘛只是一把 key。
