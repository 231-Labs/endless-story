# 片場 · Cinema Lab — 完全鏈下的世界引擎實驗場

> **狀態**：canonical · 2026-07-18 起；**2026-07-27 起**產品收斂：對外殼＝**春雪社**，對內導演層＝**片場**（本文件所稱 Cinema Lab）。
> 定位：**同一座戲園** — 看客走正門（`/` 看戲／看世界／讀章回），導演走後台（`/lab` 控拍、物界、訪談）。
> 底層像遊戲一樣運作（engine 物理世界），表面像直播一樣觀看（手卷 + 拍流），操作像排戲一樣克制（靜場才撥物界）。
> 與鏈上生產線的關係見 §1；敘事機制歸屬鐵律見 [`narrative/ENGINE_CORE.md`](./narrative/ENGINE_CORE.md)。

---

## 0. 一句話

**cinema-lab = engine CLI run 的常駐網頁化**：同一份 `packages/engine`（want、scene loop、
routing、fatigue、box-office、per-character session）、同一種 run 目錄格式，換成從 UI
點燈開拍、即時展卷觀看、分卷做版本管理 — 全程零 Sui、零 Walrus、零錢包。

**對外產品殼**：`/` 讀策展公開卷（`LAB_PUBLIC_RUN_ID` 或 `$LAB_DATA_DIR/public.json`），
看客 chrome 無控拍；今日主鏡見 `runs/<id>/editorial/daily-shot.json`（人工策展，**不**由 tick 產片）。

### 0.5 看客 vs 片場

| | 看客（春雪社） | 片場（導演） |
|---|---|---|
| 進入 | `/` 或公開卷 `/lab/run/<featured>` | `/lab` + `LAB_SECRET` |
| 觀看 | 看戲 · 看世界 · 讀章回 | 手卷 + 拍流 + 名帖／願榜／願牆 |
| 控制 | 無（世界自轉） | step / run / pause / fork / 物界 / 匯出 / 訪談 |
| API | `/api/lab/public/*` 與公開卷唯讀 | 全 `/api/lab/*` |

產品埠（`packages/web/src/lib/ports`）：`PRODUCT_BACKEND=local|sui`。
公開讀 API（`/api/lab/public/live|daily-shot|reading|cast`）與次要入口
（`entitlements|recruitment|vault`）皆走 `getProductPorts()`。看客 UI 經
`product-client`／public 路徑；導演控制仍用 `labApi`。Sui／Walrus 是可插拔
adapter，不是第二套首頁。`HeroTheater` 保留作為影片／直播劇院播放器，之後接回今日主鏡。

---

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
    ├── state/checkpoints/t<拍>/    #   時光快照：每拍走完凍存一份 world.json（訪談室之源）
    ├── memory/  sessions/          #   LocalRecall + 每角色持久 LLM session
    ├── interviews/<id>/            #   演員訪談室：interview.json + 影子 session + marks.json
    ├── archive/                    #   手卷/織回/日終/POV markdown
    ├── dossiers/                   #   事件卷宗（EpistemicDossierBundle 內嵌 header）
    └── editorial/                  #   季度選集 + 今日主鏡（daily-shot.json）
$LAB_DATA_DIR/public.json           # 春雪社策展：{ runId, brand?, featuredCastNames? }
                                    # 範例見 packages/web/examples/public.json.example
                                    # 今日主鏡範例 packages/web/examples/daily-shot.json.example
```

**版本管理三件事**：
1. **溯源**：`run-manifest.json` 逐欄核對，一卷永不悄悄換 preset／provider／模型。
2. **交易**：每拍走 `TickFilesystemTransaction`（state/memory/sessions/archive 先備份，
   崩潰即回滾），卷不會半拍撕裂。
3. **分卷（fork）**：靜場時整目錄複製成兄弟卷，記 `parentRunId` + `forkedAtTick`，
   卷架上以世系縮排呈現 — 從同一拍岔出兩種未來，直接對照。

### 2.1 內建劇本與季框（映像自帶，卷架直接可選）

劇本在 `packages/cli/scripts/stories/`、季框在 `packages/cli/scripts/seasons/`；
自撰的走 `$LAB_DATA_DIR/seeds/`、`$LAB_DATA_DIR/seasons/`（劇本館存檔）。

| 劇本 id | 是什麼 | 班底 |
|---|---|---|
| `spring-snow` | 春雪社 · 民國上海越劇混合班 —— 正典世界，長跑與大部分實驗的底本（設定見 [`narrative/SPRING_SNOW_BIBLE.md`](./narrative/SPRING_SNOW_BIBLE.md)） | 12 |
| `spring-snow-emergent-liu` | 柳安春 · 記事不記論：只把她一人的種子從「判決」改寫成「事件」，讓她自己認（#188/#189/#191） | 12 |
| `spring-snow-chamber-jin` / `-su` | 室內劇對照卷：同一角色（柳安春）與**不同**對手同處一室的一夜（#185） | 2 |
| `spring-snow-chamber-trio` | 室內劇三人卷：同一角色與**兩位**對手同處一室的抉擇對照（#187） | 3 |
| `rehearsal-hall-trio` | 三不識排練廳：生旦淨三人互不相識、無共同過去的湧現實驗（#195） | 3 |
| `rehearsal-hall-exchange` | 排練廳搭班：三不識＋春雪師姐妹 —— **白紙 × 滿載過去**的對照實驗（#197） | 5 |
| `minimal` | 單 location 單 scene 的最小測試卷 | 0 |

季框（`seasons/`）：`spring-snow-market`（命題＝生計，三臂實驗的 Arm A 控制組）、
`spring-snow-open`（命題中性化的開放對照，Arm B/C）、以及三支 `spring-snow-chamber-*`
配對室內劇。三臂協議見 [`narrative/EXPERIMENT_ARMS.md`](./narrative/EXPERIMENT_ARMS.md)。

## 3. 面板地圖

| 路由 | 是什麼 |
|---|---|
| `/lab` | 卷架：seed 卡（批量帶入人物/場景/記憶/爭奪之物）、點燈開拍、run 世系 |
| `/lab/seeds` | 劇本館：整份 seed JSON 撰改、驗而後存（引擎 loader 驗證） |
| `/lab/assets` | 圖庫：人物肖像／場景扇面／地界油畫上傳管理（見下） |
| `/lab/run/[id]` | 觀測台，**四屏直捲**：①手卷滿幅（篩選簾：地界籤跳欄＋有人/上演/幽）＋**拍流懸浮匣**（可折，折起只剩豎籤＋活點）＋**製作中玻璃卡**（`emergentProduction` 有戲開排才現身，唯讀排練進度，#124）②名帖排（點開**人物內頁**：身心向量/心事全帳/恆常自我/心底事/關係視角/記憶帳/多媒體影像/**自述視角頁**（角色第一人稱看自己）/**身家頁**（錢＋物品欄）/**上香・注夢**入口——擁有者影響通道：一炷香微推既存心事（每日一炷，角色不知情）、一幅意象入深宵之夢（每三日一夢，意象非指令；#175–#178，spec 見 [`RECRUIT_INCENSE_SPEC.md`](./RECRUIT_INCENSE_SPEC.md)））③**願榜**（全戲班活著的心事收攏一處：依人/種類篩、依濃度排，#133/#159）④**願牆**（眾生在廟裡對神明**說出口**的祈願＋香火標記，與願榜「心裡的」相對，#141/#172）。另有控制＋物界抽屜；header 另備**診斷導出**（一鍵下載整卷 AI 好讀的單檔 markdown 除錯全紀，#150；#201 起逐拍另列
第一人稱「視角」與「惰息·反思」，看得見文筆與深度而不只客觀拍）與訪談入口。**簷口珠簾＝當日行程**：已走的拍朱砂點亮、正走的那串呼吸 |
| `/lab/run/[id]/reading` | 讀卷處：事件卷宗（客觀/主觀選集）、章回（織回+日終+POV 原料）、拍案（逐拍客觀 × 各家所見）、選集（季度 anthology） |
| `/lab/run/[id]/dossier/[slug]` | 單卷卷宗：沿用讀者站 `EventDossier`（正史層 + 多視角 + 認識論標記） |
| `/lab/exhibits` | 展覽室：認領外來卷、館藏實驗報告、自上之展品（見 §3.5） |
| `/lab/run/[id]/interview` | **演員訪談室**：演員名錄（報館名錄口徑）→ 選時刻（時光快照／事件錨）× 四模式（自由/公開/私下/日記）開訪；訪談間左對話右三籤（所知＝角色可知、內裡＝僅導演、查驗＝預檢+評審+內容候選標記）；`/compare` 同題並問兩個時間點。詳見 [`ACTOR_INTERVIEW.md`](./ACTOR_INTERVIEW.md) |

**圖庫（人物圖與場景資源的管理處）**：`$LAB_DATA_DIR/assets/<character|scene|location>/<名>.<png|jpg|webp>`，
**以名為鍵**——seed 以名字指涉人事地，分卷、重跑同名共用一圖，上一次圖全站生效。
解析順序：圖庫自上之圖 → 館藏按名匹配畫作（`terrainArt.ts` 正則庫，含 `public/handscroll/` 油畫）→
紙面名款／一字名印。上傳走 data-URL（圖 ≤6MB），改圖即換、焚圖即回落。UI 在 `/lab/assets`：
選劇本 → 地界／場景／人物三排格子，點格上圖、點焚除圖。每格另有：
- **述**：描述 override（`<名>.txt` sidecar，蓋過劇本原文，顯示於場景頁與人物內頁；清空回落）
- **影**（人物）：多媒體 gallery（`<名>-gallery/`，多張圖 ≤6MB＋影片 mp4/webm ≤48MB），
  人物內頁「影像」區展示，可逐件焚。

**物界抽屜（＝鏈下的「配置合約物件」）**：爭奪之物（drama stakes）、registered 物件
（放一封信進妝閣、藏一只錶進戲箱）、天時（clock-bound 世界事件）、場景物理
（privacy/capacity）。規則：**走拍中不可改；改了立刻落 world.json** —— 配置本身就是
世界事實，不是 prompt 悄悄話。

### 3.5 把實驗產出搬進片場（展覽室）

實驗產出分兩類，各有一扇門：

**A. engine 格式的 run 目錄**（`state/` + `archive/` + `dossiers/`，即 CLI `--out`
或 `$ES_LAB_ROOT/runs/<日期>/engine-run`）→ **認領上卷架**，成為完整的一卷
（手卷冷觀、章回、卷宗、選集全數可讀）：

```bash
# 本機 dev：拷進 lab 資料根
cp -r ~/endless-story-lab/runs/2026-07-16/engine-run \
      packages/web/data/cinema-lab/runs/anchun-0716
# VPS：rsync 上 volume
rsync -av ~/endless-story-lab/runs/2026-07-16/engine-run/ \
      <vps>:/data/cinema-lab/runs/anchun-0716/
```

然後開 `/lab/exhibits` →「認領外來卷」點一下即可。config 從 run 自己的
`run-manifest.json` + `world.json` 推斷；沒有 `ticks.jsonl` 的外來卷，手卷的
題字流會自動從最近幾份〔手卷〕markdown 回填（拍案 tab 則自認領後才開始累積）。
**誠實限界**：他鑰錄的卷（如 poe 錄的）在本機任何時候都可讀可展；要「續走」
則須本機 provider 與原卷一致（引擎溯源檢查，防偷換敘事者）。

**B. 報告型產出**（`report.md`／`report.html`、研究筆記、A/B 數據）→ **展覽室展讀**：
- 館藏：`packages/engine/experiments/**` 的 `report.md`／`*-report.md` 隨 image
  自動列出（agent-season 各窗口、play-emergence、rewrite-ab…），有 `report.html`
  的旁邊一鍵開原版。掃描根可用 `LAB_REPORTS_DIR` 覆蓋。
- 自上：任何 markdown 貼進「自上之展品」，存 `$LAB_DATA_DIR/exhibits/`（隨 volume
  持久），可焚。私庫（lab repo）的 season 報告、consolidated 筆記走這條。

**C. cast-state 窗口 → 復活成可續走之卷**（`revive.ts`）：agent-season 存的
`cast-state.json`（演化後 secret、relationshipViews、coreIdentity、全量 want 帳、
establishedPairs）可一鍵「復活」：以 preset 建底世界（場景/崗位/創世記憶），按名
覆疊存檔狀態，成為卷架上普通的一卷，走拍即續命。館藏報告旁有「復活」鈕；私庫
窗口貼 JSON 走「貼 cast-state 復活」。誠實對映：
- want 帳原樣承接（名→id 重映；負 bornTick＝「季前所生」，衰減數學是相對的，成立）
- secret／relationshipViews／coreIdentity 原樣；establishedPairs → 雙向戀慕邊
- 名稱漂移容忍：恰差一字且唯一候選才配（柳生春→柳安春），記入卷注
- harness 專有欄（health/money/seasonsLived）WorldState 無屋，記卷注不硬塞
- 原窗口 tick 不承接——復活卷自第 1 日重新起拍（時間是這卷自己的）

### 3.6 靜場可撥的五樣東西（物界抽屜，五頁歸位）

觀測台「物界」抽屜分**物／景／時／憶／人**五頁，靜場（非走拍中）可改，改即落卷：
- **物**：**爭奪之物**（drama stakes，換一批爭搶物、下一拍慾望即重新對位）
  ＋ **registered 物件**（置一封信於妝閣、藏一只錶進戲箱：容器/隱顯/狀態）。每物件持
  **穩定唯一 id（`lab-obj-<uuid>`）＋出身戳**（季/手·生於 dN·tN，PR #115），fork 後子卷共享
  同一真身分；operator 靜場可**手動轉手贈物**（PR #120）把物件從一角交予另一角。
- **景**：**場景物理** — 私（privacy 0–5）與容（capacity）逐場可調。場景內頁另有
  **三切面**呈現（#168）：物在此處（擱在該景的物，幽物標「幽」不隱去——操作者全知）／
  隨身在場（在場人身上帶著的物）／願籤（在此處對神明說出口的話，廟宇自然有、別處自然無）
- **時**：**天時** — 排定 clock-bound 世界事件（幾拍後、何處、誰見）
- **憶**：每角的 **LocalRecall 帳**：檢視全部、**植入**新憶（kind＋重要度 1–10）、
  **焚去**舊憶。活卷經同一 recall 實例操作、冷卷直開檔案，永不撕裂。
  （production MemWal 維持 append-only；這是 lab 自己的排練簿。）
- **人**：**中途入場**（#198）— 靜場把一個新角色加進活卷（名/行當/身分描述/心底事/
  落腳/日常/現身處＋初始記憶）。引擎側 `joinCastMember` 與開卷建角同構、**先驗證後變異**
  （任一欄不合即整卷 byte-identical 不動）：到場作一條天時事件入正典（眾人結構性「聞其到」，
  非操作者私語）、心事下一個白日拍由 genesis 自長、情分與相識分寸自零起（面生）。
  新人一入即落 `world.json`，與 fork/checkpoint 天然相容。
  **帶舊誼入卷**（`ties`，#200）：新人可對**已在卷中**者宣告既有關係——關係語入 edge
  （`tone`／`toneBack` 各自可給）、「我看TA／TA看我」入 `relationshipView`、`warmth` 0–1
  雙向種 bond、開 `subjectiveNaming` 時兩造互設 `named`（帶著過去的人不會面生）。
  兩半都是**作者所寫的主觀**（與開卷 `relationship_views` 同一紀律，不從別處推導）；
  溫度雙向同值起手，不對稱由戲裡長出來。

> **為何物件不在圖庫**：這幾樣都是**一卷之內的活世界狀態** —— object 有位置、
> 隨身、隱顯，只存於某卷某拍。圖庫（`/lab/assets`）反之是**跨卷、以名為鍵的靜態
> 美術**。故世界物件落於觀測台之側的物界抽屜，圖庫只管「臉」（人物/場景/地界之圖）。

## 4. API（`/api/lab/*`，皆 server-side）

`GET/POST seeds` · `GET seeds/[source]/[id]` · `GET/POST runs` · `GET/PATCH/DELETE runs/[id]`
· `POST runs/[id]/control`（step/run/pause/fork/open）· `GET runs/[id]/live?after=<seq>`
（輪詢即時流：世界投影 + 增量拍）· `GET runs/[id]/ticks` · `GET runs/[id]/archive`
· `GET runs/[id]/dossiers` · `GET/POST runs/[id]/config`（物界操作，含 `offer-incense`／`inject-dream`）
· `GET runs/[id]/export`（診斷導出：單檔 markdown，錯誤最先列＋逐拍機制紀錄＋**逐拍第一人稱
「視角」與「惰息·反思」**（#201，空行收攏＋軟上限，長篇不撐爆檔）＋engine log 尾段；
CJK 卷名走 RFC 5987 `filename*`）
· `GET/POST runs/[id]/memories`（憶頁：檢視／植入／焚去 LocalRecall 帳）
· `POST runs/[id]/cast`（人頁：中途入場 —— 建角＋種初始記憶＋到場天時，靜場限定）
· 訪談室：`GET runs/[id]/interview/{actors,checkpoints,snapshot}` ·
`GET/POST runs/[id]/interviews` · `GET/DELETE runs/[id]/interviews/[sid]`
· `POST runs/[id]/interviews/[sid]/{messages,marks}`（角色上下文全在 server 組裝）
· 圖庫：`GET/POST assets` · `GET/POST assets/gallery` · `GET assets/file/[kind]/[file]`
· 展覽室：`GET/POST exhibits` · `GET exhibits/html`

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

cinema-lab 就在 `packages/web` 裡（build context = repo 根）。
**推薦拓撲：同一份程式碼部署兩個 Zeabur service** — 美術永遠同步，
但 process／資源／域名／生命週期完全隔離，**映像各取所需**：

| service | Dockerfile | env | 用途 |
|---|---|---|---|
| `web`（生產站） | root `Dockerfile`（完整版，~1GB） | `LAB_DISABLED=1` + `LAB_PUBLIC_RUN_ID`／`LAB_DATA_DIR` | 春雪社看客殼（`/`）＋管理台。`/lab` 導演頁 404；`/api/lab/public/*` 仍讀公開卷 |
| `cinema-lab`（片場） | `Dockerfile.cinema-lab`（standalone 瘦身版，~200MB） | `LAB_SECRET=…`、`LAB_DATA_DIR=/data/cinema-lab`（掛自己的 volume） | 導演專屬實驗場。完全鏈下、不用合約 CLI —— 瘦映像拉取秒級，redeploy 不再等 |

瘦身版的掛法：Zeabur 以 **`Dockerfile.[服務名]`** 慣例選檔（同
`Dockerfile.event-poller`）——lab 服務現名 `cinema-lab`，故檔名為
`Dockerfile.cinema-lab`；日後改服務名，檔名跟著改。瘦身版靠 Next `output: 'standalone'`
（build 時 `NEXT_STANDALONE=1`，見 `next.config.ts`），內建劇本 JSON 已補進
映像同路徑；自撰劇本／季框／美術全在 volume 上，與映像無關。

單服務起步也完全可以（省一台）：不設 `LAB_DISABLED`、設 `LAB_SECRET`，
lab 與讀者站同 process；流量起來或實驗變重時再分。lab 的 run 狀態是單程序
in-process — 分兩台後 `web` 可自由多 replica，`lab` 維持單實例即可。

### 6.1 持久 volume（沒有它，redeploy 卷全失）

lab 服務掛 volume 到 `/data`，然後：

```bash
LAB_DATA_DIR=/data/cinema-lab
```

（單服務部署時與既有 `DEPLOYMENT_MANIFEST_PATH=/data/contract-ids.json`、
`CHARACTER_SESSION_DIR=/data/character-sessions` 同一顆 volume 即可。）

### 6.2 門禁三檔

```bash
LAB_DISABLED=1                              # 這台沒有片場導演 UI（生產 web 服務用）；/api/lab/public/* 仍開
LAB_SECRET=$(openssl rand -hex 16)          # 鎖門（片場機用）
LAB_PUBLIC_RUN_ID=<featured-run-id>         # 春雪社首頁讀哪一卷
# 兩者皆不設 = 全開（僅限本機開發）
```

`LAB_SECRET` 設了之後：瀏覽器開 `https://<host>/lab?key=<LAB_SECRET>` 一次換
cookie（30 天），導演 `/lab/*` 與寫入 API 驗同一把（API 亦可
`Authorization: Bearer`）。公開卷的 `/lab/run/<featured>` 與唯讀 API 看客可進。
`LAB_DISABLED=1` 在 middleware 層對導演頁與非 public API 回 404；
`/api/lab/public/*` 與 `/api/lab/role` 仍可服務春雪社殼。

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

- [ ] 生產 `web` 用 root Dockerfile、實驗機用 `Dockerfile.cinema-lab`（檔名尾巴＝Zeabur 服務名），build 綠
- [ ] 生產 `web`：`LAB_DISABLED=1`，開 `/lab` 得 404
- [ ] 實驗 `lab`：volume 掛 `/data`、`LAB_DATA_DIR=/data/cinema-lab`
- [ ] 實驗 `lab`：`LAB_SECRET` 已設，`/lab?key=…` 可進、無 key 401
- [ ] 排演卷：點燈 → 走一拍 → 拍流有字 → 讀卷處有卷宗
- [ ] （實錄）文字模型鑰已注入，`點燈開拍` 選實錄不再報「needs a configured text provider」

## 7. 已知邊界（誠實清單）

- **單機單程序**：run 狀態活在 Next process 裡（多 replica 會各自為政）。自架 VPS
  單實例即正確；要橫向擴展先把 manager 抽成獨立 worker。
- **`economy` 唯讀**：season 銀錢物理隨 world.json 落卷可看，物界抽屜暫不提供編輯
  （合約/薪餉屬季框 seed 的職權）。
- **實錄一拍數分鐘**：這是 LLM 排戲的真實成本；觀測台的拍流會逐拍浮出，不必等整拍。
- **手卷畫作按名匹配**（`terrainArt.ts` regex）：自撰劇本的地名若不在畫庫，該欄以紙色
  漸層 + 名款呈現 — 加畫作 = 往 `public/handscroll/` 添圖 + 補一條 regex。
