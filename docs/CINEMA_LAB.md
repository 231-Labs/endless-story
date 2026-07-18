# 片場 · Cinema Lab — 完全鏈下的世界引擎實驗場

> **狀態**：canonical · 2026-07-18 起。`/lab` 的唯一方向文件：架構、使用、部署。
> 定位：**AI 角色觀測劇場的實驗後台** — 底層像遊戲一樣運作（engine 物理世界），
> 表面像直播一樣觀看（手卷 + 拍流），操作像排戲一樣克制（靜場才撥物界）。
> 與鏈上生產線的關係見 §1；敘事機制歸屬鐵律見 [`narrative/ENGINE_CORE.md`](./narrative/ENGINE_CORE.md)。

---

## 0. 一句話

**cinema-lab = engine CLI run 的常駐網頁化**：同一份 `packages/engine`（want、scene loop、
routing、fatigue、box-office、per-character session）、同一種 run 目錄格式，換成從 UI
點燈開拍、即時展卷觀看、分卷做版本管理 — 全程零 Sui、零 Walrus、零錢包。

## 1. 解耦邊界（第一性）

| 層 | cinema-lab 用什麼 | 絕不 import |
|---|---|---|
| 機制 | `@endless-story/engine`（core + ports + tick） | `web/lib/chain/*`、`@endless-story/sdk`、`@mysten/*` |
| LLM | `RunnerSceneAgent`（純 LLM 葉函數）或 `FakeSceneAgent`（零鑰確定性） | `saga-director.runOnce`、sign-and-anchor 等鏈面 runner 服務 |
| 存儲 | 檔案系統（`LAB_DATA_DIR`） | Walrus / SEAL / MemWal / Postgres |
| UI | 手卷元件族（`SceneFan`／`FloatingStream`／`handscrollLayout`／`terrainArt`／`EventDossier`） | `SubscribeButton` 等 dapp-kit hook 元件、`getSagaLiveSnapshot` |

引擎側唯一擴充：`TickOpts.onBeat`（觀測者，tick 不 await、失敗只記 log）——
機制零改動，lab 靠它把 scene loop 的每一拍即時推上 UI。

## 2. 目錄即版本（run = 一卷）

```
$LAB_DATA_DIR/                      # 預設 packages/web/data/cinema-lab；生產掛 volume
├── seeds/<id>.json                 # 自撰劇本（UI「劇本館」存檔；引擎 buildWorldState 驗證）
├── seasons/<id>.json               # 自撰季框
└── runs/<runId>/                   # 一卷 = 一目錄，與 engine CLI run 逐檔互通
    ├── lab-run.json                #   lab 註冊：標題/備註/config/世系（parentRunId, forkedAtTick）
    ├── status.json                 #   最新鐘面（清單頁廉價讀取）
    ├── run-manifest.json           #   引擎溯源（preset/season/provider/model —— 不合即拒開）
    ├── ticks.jsonl                 #   每拍一行：客觀事件 + 各家 POV + 帳面通告
    ├── state/world.json            #   整個世界（每拍快照；resume 之源）
    ├── memory/  sessions/          #   LocalRecall + 每角色持久 LLM session
    ├── archive/                    #   手卷/織回/日終/POV markdown
    ├── dossiers/                   #   事件卷宗（EpistemicDossierBundle 內嵌 header）
    └── editorial/                  #   季度選集（season-anthology.md + selection）
```

**版本管理三件事**：
1. **溯源**：`run-manifest.json` 逐欄核對，一卷永不悄悄換 preset／provider／模型。
2. **交易**：每拍走 `TickFilesystemTransaction`（state/memory/sessions/archive 先備份，
   崩潰即回滾），卷不會半拍撕裂。
3. **分卷（fork）**：靜場時整目錄複製成兄弟卷，記 `parentRunId` + `forkedAtTick`，
   卷架上以世系縮排呈現 — 從同一拍岔出兩種未來，直接對照。

## 3. 面板地圖

| 路由 | 是什麼 |
|---|---|
| `/lab` | 卷架：seed 卡（批量帶入人物/場景/記憶/爭奪之物）、點燈開拍、run 世系 |
| `/lab/seeds` | 劇本館：整份 seed JSON 撰改、驗而後存（引擎 loader 驗證） |
| `/lab/assets` | 圖庫：人物肖像／場景扇面／地界油畫上傳管理（見下） |
| `/lab/run/[id]` | 觀測台：手卷（人物在何處、場景圓點、題字流）＋拍流（每角此刻的話與心聲）＋名帖排＋控制（走一拍/連走/停/另開一卷）＋物界抽屜。**簷口珠簾＝當日行程**：一日幾拍幾串亮，已走的拍朱砂點亮、正走的那串呼吸 |
| `/lab/run/[id]/reading` | 讀卷處：事件卷宗（客觀/主觀選集）、章回（織回+日終+POV 原料）、拍案（逐拍客觀 × 各家所見）、選集（季度 anthology） |
| `/lab/run/[id]/dossier/[slug]` | 單卷卷宗：沿用讀者站 `EventDossier`（正史層 + 多視角 + 認識論標記） |

**圖庫（人物圖與場景資源的管理處）**：`$LAB_DATA_DIR/assets/<character|scene|location>/<名>.<png|jpg|webp>`，
**以名為鍵**——seed 以名字指涉人事地，分卷、重跑同名共用一圖，上一次圖全站生效。
解析順序：圖庫自上之圖 → 館藏按名匹配畫作（`terrainArt.ts` 正則庫，含 `public/handscroll/` 油畫）→
紙面名款／一字名印。上傳走 data-URL（≤6MB），改圖即換、焚圖即回落。UI 在 `/lab/assets`：
選劇本 → 地界／場景／人物三排格子，點格上圖、點焚除圖。

**物界抽屜（＝鏈下的「配置合約物件」）**：爭奪之物（drama stakes）、registered 物件
（放一封信進妝閣、藏一只錶進戲箱）、天時（clock-bound 世界事件）、場景物理
（privacy/capacity）。規則：**走拍中不可改；改了立刻落 world.json** —— 配置本身就是
世界事實，不是 prompt 悄悄話。

## 4. API（`/api/lab/*`，皆 server-side）

`GET/POST seeds` · `GET seeds/[source]/[id]` · `GET/POST runs` · `GET/PATCH/DELETE runs/[id]`
· `POST runs/[id]/control`（step/run/pause/fork/open）· `GET runs/[id]/live?after=<seq>`
（輪詢即時流：世界投影 + 增量拍）· `GET runs/[id]/ticks` · `GET runs/[id]/archive`
· `GET runs/[id]/dossiers` · `GET/POST runs/[id]/config`（物界操作）

即時性：走拍中 1.8s 輪詢、靜場 6s；`epoch` 換代即重置游標（run 重開不漏拍）。
LLM 兩檔：`fake`（排演——確定性假角，機制同一份、零鑰零費）、`real`（實錄——
`RunnerSceneAgent`，需一把文字模型鑰，一拍數分鐘）。

## 5. 本機使用

```bash
pnpm install
pnpm --filter @endless-story/web dev        # http://localhost:3000/lab
# 選 spring-snow → 排演 → 點燈開拍 → 走一拍
```

零憑證即可完整體驗（排演檔）。實錄檔在 `packages/web/.env.local` 備一把
`ZAI_API_KEY` / `POE_API_KEY` / `ANTHROPIC_API_KEY`（`AI_PROVIDER=auto` 自選）。
lab run 目錄與 engine CLI 完全互通：CLI 跑到一半的 `--out` 目錄放進
`$LAB_DATA_DIR/runs/` 補一份 `lab-run.json` 即可上卷架；反之亦然。

## 6. 部署（Zeabur → 自架 VPS）

cinema-lab 就在 `packages/web` 裡，隨既有 web 服務一起部署（root Dockerfile，
build context = repo 根），**不需要新服務**。要點只有三件：

### 6.1 持久 volume（沒有它，redeploy 卷全失）

Zeabur 服務掛 volume 到 `/data`，然後：

```bash
LAB_DATA_DIR=/data/cinema-lab
```

（與既有 `DEPLOYMENT_MANIFEST_PATH=/data/contract-ids.json`、
`CHARACTER_SESSION_DIR=/data/character-sessions` 同一顆 volume 即可。）

### 6.2 門禁

```bash
LAB_SECRET=$(openssl rand -hex 16)          # 未設 = 全開（僅限本機開發）
```

設了之後：瀏覽器開 `https://<host>/lab?key=<LAB_SECRET>` 一次換 cookie（30 天），
`/lab/*` 頁面與 `/api/lab/*` 全部驗同一把（API 亦可 `Authorization: Bearer`）。
生產環境務必設。

### 6.3 實錄檔的環境

| env | 用途 |
|---|---|
| `ZAI_API_KEY` 或 `POE_API_KEY` 或 `ANTHROPIC_API_KEY` | 實錄檔文字模型（排演檔不需要） |
| `AI_PROVIDER` | `auto`（預設）/ `zai` / `poe` / `anthropic` |
| `CHARACTER_SESSION_KEY` | 選配：AES-256-GCM 加密角色 session 檔 |
| `OPENAI_API_KEY` | 僅當開 `realEmbeddings`（召回用真向量）才需要 |

長 tick 無虞：自架 VPS 上 Next 常駐 process，lab 的 tick 迴圈跑在 in-process
promise chain（同 `/api/tick` 的模式），沒有 serverless 時限；容器重啟時
`TickFilesystemTransaction.recoverInterrupted` 自動回滾半拍，重開卷即續走。

**磁碟預算**：排演卷每拍 ~100KB（世界快照+markdown）；實錄卷另加 session 轉錄，
數十拍的卷約 3–10MB。1GB volume 夠放上百卷；`焚`（刪卷）即時釋放。

### 6.4 檢查單

- [ ] Zeabur web 服務（root = repo 根，既有 Dockerfile）build 綠
- [ ] volume 掛 `/data`，`LAB_DATA_DIR=/data/cinema-lab`
- [ ] `LAB_SECRET` 已設，`/lab?key=…` 可進、無 key 401
- [ ] 排演卷：點燈 → 走一拍 → 拍流有字 → 讀卷處有券宗
- [ ] （實錄）文字模型鑰已注入，`點燈開拍` 選實錄不再報「needs a configured text provider」

## 7. 已知邊界（誠實清單）

- **單機單程序**：run 狀態活在 Next process 裡（多 replica 會各自為政）。自架 VPS
  單實例即正確；要橫向擴展先把 manager 抽成獨立 worker。
- **`economy` 唯讀**：season 銀錢物理隨 world.json 落卷可看，物界抽屜暫不提供編輯
  （合約/薪餉屬季框 seed 的職權）。
- **實錄一拍數分鐘**：這是 LLM 排戲的真實成本；觀測台的拍流會逐拍浮出，不必等整拍。
- **手卷畫作按名匹配**（`terrainArt.ts` regex）：自撰劇本的地名若不在畫庫，該欄以紙色
  漸層 + 名款呈現 — 加畫作 = 往 `public/handscroll/` 添圖 + 補一條 regex。
