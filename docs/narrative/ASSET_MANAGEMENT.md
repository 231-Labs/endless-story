# Asset management · Walrus 資產管理 + 續費

> 後台統一管理「住在 Walrus 上、要長存」的資產(hero 影片、角色圖、場景錨點、章回文字)的
> **上傳 / 上下架 / 到期追蹤 / 續租**。
> **鎖定決策**:① 一次到位的**通用面板**(不只影片);② **Hybrid 續費**(儀表板警示＋手動按鈕＋可選 per-category 自動續租)。
> 狀態:**Phase 1–5 已實作**(資產服務 / 後台 / 首頁閉環 / 自動續租掃描＋端點＋定時 sweeper＋單元測試);待實機對 funded 錢包驗證。Walrus 賽道,deadline 2026-06-21。
> 這份是**資產營運**面（上傳 / 續租 / 上下架）。儲存模型本身見 [Walrus 儲存模型](../protocol/WALRUS_STORAGE.md)。
> 相關:[DEPLOYMENT.md](./DEPLOYMENT.md) · [NARRATIVE_AGENTS.md](./NARRATIVE_AGENTS.md)

---

## 0. 為什麼 + 決策彙總

**問題**:角色圖、章回、首頁影片都上 Walrus,但 Walrus 儲存是 **epoch 租期制、會過期**。現在沒有任何地方
存 `suiObjectId` / `endEpoch` ⇒ **所有資產都在無人續租、會默默消失**。而且首頁影片要能**手動上下架**(自動化出圖接好前)。

**核心洞察**:續租 = 對鏈上 `Blob` object 呼叫 extend,**只有 owner 能做**。誰上傳、publisher 錢包就是 owner。
⇒ 自架 publisher 不只是效能/上限考量,而是**「能不能續租」的前提**。

| # | 決策 | 結論 | 理由 |
|---|---|---|---|
| ① | 範圍 | 通用面板(影片＋角色圖＋場景＋章回) | 既然要做追蹤工具,所有長存資產一起管 |
| ② | 續費模式 | **Hybrid** | 警示＋手動為主,per-category 可開自動續租 cron;最安全又不失控 |
| ③ | Registry 放哪 | relayer off-chain JSON 索引 | `endEpoch` 真實來源本來就在鏈上;只存最小映射,到期日即時讀鏈不 stale |
| ④ | Walrus 寫入怎麼做 | **asset 服務容器內自帶 `walrus` CLI + 錢包**,store/extend/delete 全走 CLI | 零 npm 依賴;同一顆錢包既上傳又續租 ⇒ ownership 永遠一致;不依賴「同機」 |
| ⑦ | asset 服務放哪 | **獨立 Zeabur service,不塞進 MemWAL relayer** | ① image 需求不同(asset 需 walrus CLI,MemWAL 不需);② 失敗域隔離;③ MemWAL relayer 完全不改不重啟;④ 錢包隔離 |
| ⑧ | 部署平台 / 網路 | **Zeabur Dedicated Server**;先 **testnet**,正式切 mainnet | 容器 PaaS:service＋Volume＋綁網域＋自動 TLS;testnet 先跑通,切 mainnet 只差 `NETWORK` env＋錢包充值 |
| ⑤ | 媒體讀取路徑 | `<video>`/`<img>` 直打 VPS aggregator(可 Cloudflare 前置),**不經 Vercel** | 影片 bytes 不該灌過 Vercel serverless |
| ⑥ | 記憶 blob | **不納管** | MemWal 記憶量大、churn,由 runner/MemWal 生命週期自管,手動工具去碰會打架 |

---

## 1. 部署分層（回答「現在能不能先上 VPS」）

按「改動率 × 跟前端耦合度」分三層。**Tier A/B 現在就能上 VPS;之後前端定案只動「一個 env ＋ 一行 CORS」。**

| 層 | 內容(= Zeabur service) | 現在上? | 跟前端的唯一耦合 | 改動率 |
|---|---|---|---|---|
| **A** | **walrus-aggregator** service(`cmdoss/walrus` MODE=aggregator,公開讀、無錢包) | ✅ 現在 | 無(純讀端點,前端只是引用 URL) | 幾乎永不動 |
| **B** | **relayer** service(現有 MemWal ＋ 新 asset service ＋ 容器內 walrus CLI＋錢包) | ✅ 現在 | 前端 `MEMWAL_SERVER_URL`／`DEMO_CLIPS_URL` 指向 relayer 網域；relayer `RELAYER_CORS_ORIGIN` 一格 | 介面穩定;會滾動 redeploy 加功能 |
| **C** | 前端(Vercel)＋ 仍在大改的 app 後端 | ❌ 暫不 | — | 高 |

**做法**:Zeabur 一鍵綁固定網域 — `relayer.<domain>` + `walrus.<domain>`(aggregator)。
前端搬家 ⇒ 只改前端 `MEMWAL_SERVER_URL` / `DEMO_CLIPS_URL` ＋ relayer 的 `RELAYER_CORS_ORIGIN` env,**Zeabur 那兩個 service 不動**。

**唯一「之後改很貴」的決定:testnet vs mainnet。** 要長存的正式首頁內容 ⇒ publisher 對 **mainnet**(錢包備真 WAL)。
testnet 會週期 reset、清掉 blob;只適合試跑。**「開始用」之前先定這個。**

---

## 2. 目標架構

Zeabur(Contabo Dedicated Server)托管 **3 個 service**;Zeabur 負責 TLS／綁網域／防火牆:

```
Zeabur Dedicated Server (Contabo)                        Vercel (前端，Tier C)
┌──────────────────────────────────────────────┐
│ ① walrus-aggregator  (cmdoss/walrus, MODE=aggregator)  │   首頁 <video src> / <img>
│      公開讀,無錢包,port 31415 → walrus.<domain>        │ ◀── walrus.<domain>/v1/blobs/:id ──
│                                                │
│ ② MemWAL relayer  (現有,plain node,**本案不動**)       │   (記憶 recall/remember,原樣)
│      port 8787,/health /control /api/remember /api/recall /api/count │
│                                                │
│ ③ asset 服務  (新增;image: node + walrus CLI + 錢包)    │   Admin 後台「資產」tab
│      port 8788,Bearer,綁 assets.<domain>               │ ──Bearer──▶ asset API
│      Volume: /data(registry)+ 錢包 keystore              │
│      錢包 = 所有 Blob object 的 owner(store 即 extend)   │
│        POST /api/assets        walrus store→寫 registry  │   首頁換片
│        GET  /api/assets        列表(endEpoch+remaining)  │ ◀── DEMO_CLIPS_URL ──
│        POST /api/assets/:id/extend  walrus extend        │   = assets.<domain>/api/manifest/hero-clips
│        PATCH/DELETE /api/assets/:id  上下架/改設定/回收   │
│        GET  /api/manifest/hero-clips  生 demo-clips.json  │
│      registry: /data/walrus-assets.json                  │
└──────────────────────────────────────────────┘
（無對外 publisher;上傳由 asset 服務容器內 CLI 直接 store。② MemWAL relayer 與 ③ 完全獨立、不互相影響）
```

---

## 3. Registry 資料模型

存 `DATA_DIR/walrus-assets.json`(沿用 relayer 現有 JSON 持久化風格,參考 `store.ts` 的 `InMemoryStore`)。
**只存最小映射;`endEpoch`/到期日不存,查詢時即時取(見 §4)。**

```ts
type AssetCategory = 'hero-clip' | 'character-image' | 'scene-anchor' | 'chapter-text';

interface WalrusAsset {
  id: string;                 // 我們的穩定 id（manifest / 前端引用用，不等於 blobId）
  category: AssetCategory;
  label: string;              // 後台顯示名（"顧柳爭位 trailer"）
  blobId: string;             // content hash（讀取：aggregator/v1/blobs/:blobId）
  suiObjectId: string;        // ★ 鏈上 Blob object — extend / delete 的把手
  contentType: string;        // video/mp4 | image/png | text/markdown …
  sizeBytes: number;
  deletable: boolean;         // 上傳時帶的 flag；true 才能主動刪 blob 回收儲存
  status: 'live' | 'unpublished';   // 上/下架：是否出現在對外 manifest（blob 可留可刪）
  autoRenew: boolean;         // Hybrid：per-asset 覆寫；預設跟 category 預設值走
  meta?: Record<string, unknown>;   // 見下
  uploadedAt: string;         // ISO
  endEpochAtUpload: number;   // 上傳當下的租到 epoch（顯示用初值；真值即時查）
}
```

**`meta` 各 category 的形狀**(`hero-clip` 剛好 = `demo-clips.json` 一筆 clip 的全部欄位 ⇒ 直接生 manifest):

```ts
// hero-clip
{ sagaId, day, title, caption?, chapterId?, aspect: '16/9', durationSeconds, thumbnailBlobId? }
// character-image
{ characterId, slot: 'anchor'|'costume'|'makeup'|'moment' }
// scene-anchor / chapter-text
{ sceneId? | chapterId? }
```

**Category 預設**(可在後台調):

| category | 預設 epochs | 預設 autoRenew | deletable |
|---|---|---|---|
| hero-clip | 中(可換片) | off | true |
| character-image | 長 | **on** | false（長存 IP，不輕易刪） |
| scene-anchor | 長 | on | false |
| chapter-text | 最長 | on | false（章回是正史） |

---

## 4. relayer 資產服務 — HTTP 規格

掛在現有 relayer(`packages/relayer/src/server.ts`)。沿用既有 `authed()`(Bearer `RELAYER_SECRET`)、`cors()`、`send()`。
**所有 `/api/assets*` 寫入端點都要 `authed`。** `GET` 列表也建議 authed(後台才看)。

### 4.1 端點

| Method | Path | 作用 | 備註 |
|---|---|---|---|
| `POST` | `/api/assets` | 上傳 bytes → publisher PUT → 解析 `{blobId, suiObjectId, endEpoch}` → 寫 registry | body = multipart 或 raw bytes ＋ `?category=&label=&deletable=&meta=`（JSON）|
| `GET` | `/api/assets` | 列表，含**即時** `endEpoch`/`epochsRemaining`/`expiresAt`/`expiringSoon` | `?category=` 可篩；錢包餘額另見 `/api/assets/wallet` |
| `POST` | `/api/assets/:id/extend` | 續租 N epochs（`walrus extend`） | body `{ epochs }` |
| `PATCH` | `/api/assets/:id` | 改 `status`(上/下架) / `autoRenew` / `label` | 下架只移出 manifest，blob 不動 |
| `DELETE` | `/api/assets/:id` | 移出 registry；`deletable` 則 `walrus delete` 回收儲存 | 不可刪 `deletable:false` 的 blob |
| `GET` | `/api/assets/wallet` | publisher 錢包 SUI/WAL 餘額 ＋ 低水位旗標 | 給後台餘額條 |
| `GET` | `/api/manifest/hero-clips` | 由 registry `status:'live'` 的 hero-clip 生 `{clips:[...]}` | **公開**(前端 `DEMO_CLIPS_URL` 打這支)；`videoUrl = walrus.<domain>/v1/blobs/:blobId` |

### 4.2 Walrus 寫入策略（決策 ④）

relayer 容器內自帶 `walrus` CLI + 錢包(同一顆),所有寫入用 `child_process` 呼叫 CLI,**不引入 Sui SDK**。
**同一顆錢包既 store 又 extend ⇒ ownership 永遠一致**(避開 publisher 子錢包 ownership 的模糊):

| 動作 | 怎麼做 |
|---|---|
| 上傳 | `walrus store <file> --epochs N [--deletable] --json` → 解析 `blobId / blobObjectId(=suiObjectId) / endEpoch` 寫 registry（新 asset 路徑;不走對外 publisher） |
| 查到期 | `walrus blob-status --blob-id <blobId> --json`(或 Sui JSON-RPC `sui_getObject(suiObjectId)` 讀 `storage.end_epoch`,純 fetch 也零依賴)→ 換算 `expiresAt`、`epochsRemaining` |
| 續租 | `walrus extend --blob-obj-id <suiObjectId> --epochs <N>` |
| 回收 | `walrus delete --blob-obj-id <suiObjectId>`(僅 `deletable`) |
| 錢包 | `walrus info` / `sui client balance`(或 JSON-RPC)讀 SUI＋WAL |

> 既有**記憶 blob** 的 remember 路徑(`Walrus.upload()` 走 `WALRUS_PUBLISHER_URL` HTTP PUT)**維持原樣不動**,
> 記憶 blob 不納管(決策 ⑥)。asset service 是獨立新增,不碰它。

> epoch→日期換算:讀目前 epoch ＋ epoch 時長(testnet ≈ 1 天 / mainnet ≈ 14 天,**以鏈上實際為準**),
> `expiresAt = now + (endEpoch − currentEpoch) × epochDuration`。

---

## 5. Admin「資產」分頁 — UI 規格

- `AdminTabs.tsx` 的 `TABS` 加一行 `{ key: '/admin/assets', label: '資產' }`;新 route `(admin)/admin/assets/`。沿用 `useSagaAdmin()` gating。
- 上傳走 **server route 代傳**(瀏覽器 → Next.js API route → relayer `/api/assets`,帶 `RELAYER_SECRET`),publisher 私鑰/secret 不進前端。

**版面**:
1. **錢包餘額條**(頂):SUI / WAL 餘額 ＋ 低於門檻紅字(自動續租最怕錢包空)。
2. **依 category 分組表格**,每列:縮圖/icon · `label` · 大小 · **到期日(epoch→日期)** · `epochsRemaining` · 狀態徽章 · `autoRenew` toggle · 操作。
   - **即將到期**(`expiringSoon`)整列高亮 + 警示 icon。
3. **操作**:`上傳`(dropzone,選 category＋label＋meta) · `續租`(輸 N epochs) · `上/下架` toggle(改 `status`) · `刪除回收`(僅 deletable,二次確認)。
4. hero-clip 上傳後 → 自動進 `/api/manifest/hero-clips` → 首頁即時換片(§6)。

---

## 6. 首頁 hero-clip 閉環

前端**零改動**:現有 `loadDemoClipOverride()`([packages/web/src/lib/api/scenes.ts](../packages/web/src/lib/api/scenes.ts))已支援
`DEMO_CLIPS_URL`(`cache:'no-store'`)。設 `DEMO_CLIPS_URL = https://relayer.<domain>/api/manifest/hero-clips`。
`HeroTheater` 直接 render `clip.videoUrl` 字串 ⇒ 上傳一支 hero-clip → registry → manifest → 首頁換片,不碰 repo、不 redeploy。

> manifest 的 `videoUrl` 用 `https://walrus.<domain>/v1/blobs/:blobId`(直打 VPS aggregator,**不經** [api/blob proxy](../packages/web/src/app/api/blob/[blobId]/route.ts);那支留給文字 blob 修 Content-Type)。

---

## 7. backfill 既有資產（ownership 坑）

⚠️ 既有角色圖([packages/web/src/mocks/characters.ts](../packages/web/src/mocks/characters.ts) 的 `BLOB.*` 常數)多半是
**公共 publisher 種的 ⇒ 你不擁有那些 Blob object ⇒ 續不了租**。納管要：

1. 從 aggregator 抓 bytes(`walrus.<domain>/v1/blobs/:blobId`)。
2. 用**你的 publisher** 重新 register(同 bytes → 同 `blobId`,但產生你 own 的新 Blob object)。
3. 寫進 registry(category=`character-image`,填 `characterId`/`slot`)。

→ 寫一支 `packages/cli` 的 `backfill-walrus-assets` 腳本跑一次。**新資產(從 VPS publisher 上傳)沒這問題。**

---

## 8. Hybrid 自動續租（決策 ②）— 已實作

掃描核心在 [`packages/relayer/src/asset-renew.ts`](../../packages/relayer/src/asset-renew.ts)
(`renewDue()`,純函式、注入 store + walrus + config,單元測試
[`test/asset-renew.test.ts`](../../packages/relayer/test/asset-renew.test.ts) 11 案綠)。兩種觸發共用同一核心:

- **in-process 定時 sweeper**(`assets-server.ts`):`RENEW_SWEEP_INTERVAL_MS > 0`(預設 6h)就開,
  開機後約 15s 先掃一次,之後按間隔重複。設 `RENEW_SWEEP_INTERVAL_MS=0` 關掉,改用外部 cron。
- **`POST /api/assets/renew-due`**(authed):給外部 systemd timer / cron 打,或後台「立即檢查續租」
  按鈕觸發。兩者共用一個 in-flight 鎖避免重入重複 extend(重入時回 `409`)。

掃描規則:`autoRenew === true` 且 `0 < endEpoch − currentEpoch ≤ RENEW_THRESHOLD_EPOCHS` →
`walrus extend +RENEW_EXTEND_EPOCHS`(與 UI「即將到期」高亮同一門檻,故紅列＝會被續的列)。**已過期(remaining ≤ 0)
的 blob 不 extend**:合約會在 `walrus::blob::assert_certified_not_expired` abort(`EResourceBounds`),過期 blob 救不回,
直接 skip 回報、不再每輪硬打(否則就是無限失敗洗版)。`status` 不影響(下架但 autoRenew 仍續,見模組註解)。
`currentEpoch` 讀不到 → 整輪放棄(無法判到期)。

- **per-category 預設 ＋ per-asset 覆寫**(schema 的 `autoRenew`)。
- 續租前查錢包餘額:`WALLET_MIN_WAL` / `WALLET_MIN_SUI`(預設 0 ＝不設地板;>0 時餘額低於地板 → 整輪跳過 + log
  警示、**不續**,避免以為自動就高枕無憂)。餘額讀不到(null)＝不擋,照續但記警示。單筆 `extend` 失敗被隔離
  (catch + 計入 `failed`),不影響其他筆;失敗訊息含 `EResourceBounds`/`expired`(掃描後才過期)歸入 skipped 而非 failed;
  連續 5 筆非過期失敗則中止本輪(別空轟錢包)。錯誤訊息含 stdout(walrus 把交易執行錯誤印在 stdout 不是 stderr)。
- 門檻 env:`RENEW_THRESHOLD_EPOCHS`(預設 5)、`RENEW_EXTEND_EPOCHS`(預設 30)、`WALLET_MIN_WAL`(預設 0)、
  `WALLET_MIN_SUI`(預設 0)、`RENEW_SWEEP_INTERVAL_MS`(預設 6h)。
- **實機驗證(2026-06-25)**:funded 錢包對「活著的」blob extend 成功;早期用 5 epochs 種、sweeper 上線前就過期的 blob
  無法續(`EResourceBounds`,預期),已改為 skip,不再洗版。過期死列可在後台批量刪除清掉(DELETE 容許 `walrus delete`
  失敗仍移除 registry 列)。
- **待辦**:餘額不足/續租失敗目前只 log + 後台顯示,主動通知(webhook/email)未接。

---

## 9. 安全邊界 + 錢包

- **無對外 publisher**:Zeabur 只綁 aggregator(公開讀、無錢包)＋ relayer(Bearer)兩個網域。上傳由 relayer 容器內 CLI 直接 `walrus store`,**沒有任何公開寫入端點**。
- **錢包 = 熱錢包**:私鑰(`SUI_KEYSTORE`)放 Zeabur Variables/Secret + Volume,只放工作量級 SUI/WAL,**不是金庫**。它 own 所有 Blob object,**洩漏=資產可被刪/移;Volume/錢包遺失=所有 blob 再也續不了租 ⇒ 私鑰務必另外備份**。
- relayer `RELAYER_SECRET` 必設(目前 server.ts 為可選);`/api/assets*` 全程 Bearer。
- aggregator 快取:`cmdoss/walrus` aggregator 自帶讀取;要 `Cache-Control: immutable` + 邊緣快取(影片 seek/降延遲)可在 `walrus.<domain>` 前面掛 **Cloudflare**(blob content-addressed 不變,可永久快取;見 §11 參考)。Zeabur 自動 TLS。
- **CORS(唯一前端耦合)**:不需反代——由 relayer app 自己的 `RELAYER_CORS_ORIGIN` env 控制(server.ts 已實作)。前端定案後填正式 Vercel 網域即可。

---

## 10. 建置順序（誰做 · 是否阻塞 VPS）

| Phase | 內容 | 誰做 | 阻塞? |
|---|---|---|---|
| **0** | Zeabur:① walrus-aggregator service(`cmdoss/walrus` MODE=aggregator)綁 `walrus.<domain>`;② relayer service(自訂 Dockerfile = node+walrus CLI+錢包)+ Volume + 綁 `relayer.<domain>`;funded 錢包 | **你**(我給 `packages/relayer/Dockerfile` ＋ Zeabur env/Volume 清單,見 §A) | Tier A,可獨立先上 |
| **1** | relayer asset service:registry persistence ＋ §4 端點;**新增** asset CLI wrapper(store/extend/delete/status/wallet);**不動** `Walrus.upload()`(零影響既有記憶路徑) | 我 | 可先 dev-local mock 開發,**不等 Zeabur** |
| **2** | Admin「資產」tab:表格/上傳/上下架/續租/錢包條 ＋ Next.js server 代傳 route | 我 | 不阻塞 |
| **3** | 首頁閉環:`GET /api/manifest/hero-clips` ＋ 設 `DEMO_CLIPS_URL` | 我 | 收尾 |
| **4** | backfill 既有角色圖(重 register pass) | 我寫腳本 + 你跑一次 | 需 VPS publisher 就緒 |
| **5** | Hybrid 自動續租:`renewDue()` 核心 ＋ `POST /api/assets/renew-due` ＋ in-process sweeper ＋ 錢包地板 ＋ 單元測試(§8)。**DONE,待實機驗證** | 我 | 需 VPS |

開發/驗證指令:
```bash
nvm use
node packages/relayer/src/server.ts          # relayer 本機起(dev-local Walrus)
pnpm -r type-check                            # 全 repo 綠燈
```

---

## 11. 風險 / 非目標

- **testnet reset**:testnet 上 blob 不保證長存,續租在 testnet 意義有限;正式資產上 mainnet(§1)。
- **公共 publisher ownership**:既有 blob 要重 register 才管得到(§7);新資產無此問題。
- **錢包看顧**:自動續租仰賴 publisher 錢包餘額,餘額監控本身要進儀表板(§8/§9)。
- **非目標**:不納管 MemWal 記憶 blob(決策 ⑥);不做鏈上 registry(決策 ③);不接自動化出圖(那是另案,本工具只負責「人工上傳的資產」生命週期)。

---

## 12. 檔案地圖（實作落點）

| 路徑 | 動作 |
|---|---|
| `packages/relayer/src/assets.ts` | 新增:registry persistence ＋ `walrus` CLI wrapper(store/extend/delete/status/wallet)＋ dev-local mock（實作時拆成 `asset-store.ts` / `asset-walrus.ts` / `asset-types.ts` / `assets-server.ts`） |
| `packages/relayer/src/asset-renew.ts` | 新增:`renewDue()` 自動續租掃描核心(§8);單元測試 `test/asset-renew.test.ts` |
| `packages/relayer/Dockerfile` | 新增:base `cmdoss/walrus`(含 walrus+sui binaries)＋ 裝 Node ＋ relayer 原始碼;Zeabur Service ② 用 |
| `packages/relayer/src/walrus.ts` | **不動**(`upload()` 保持原簽章;asset 路徑用 assets.ts 的 CLI) |
| `packages/relayer/src/server.ts` | 加:§4 路由(既有路由不動) |
| `packages/relayer/src/types.ts` | 加:`WalrusAsset`、`AssetCategory` |
| `packages/web/src/app/(admin)/admin/AdminTabs.tsx` | 加:`{ key:'/admin/assets', label:'資產' }` |
| `packages/web/src/app/(admin)/admin/assets/` | 新 route ＋ 面板元件 |
| `packages/web/src/app/api/admin/assets/` | 新:server 代傳 route(帶 `RELAYER_SECRET` 打 relayer) |
| `packages/cli/.../backfill-walrus-assets.ts` | 新:既有角色圖 backfill 腳本 |
| `packages/web/src/lib/api/scenes.ts` | 不改(已支援 `DEMO_CLIPS_URL`) |

**env 清單**:
- relayer service:`SUI_KEYSTORE`(錢包私鑰)、`WALRUS_NETWORK`(testnet/mainnet)、`RELAYER_SECRET`、`RELAYER_CORS_ORIGIN`、`DATA_DIR=/data`、`RENEW_THRESHOLD_EPOCHS`、`RENEW_EXTEND_EPOCHS`、`WALLET_MIN_WAL`、`WALLET_MIN_SUI`、`RENEW_SWEEP_INTERVAL_MS`(自動續租 sweeper 間隔,0＝關;見 §8);(記憶 blob 路徑仍用 `WALRUS_PUBLISHER_URL`、`WALRUS_EPOCHS`,維持原樣)
- aggregator service:`MODE=aggregator`、`NETWORK`
- 前端(Vercel,Tier C 定案後設):`MEMWAL_SERVER_URL`(=`relayer.<domain>`)、`DEMO_CLIPS_URL`(=`relayer.<domain>/api/manifest/hero-clips`)、`RELAYER_SECRET`

---

## A. Zeabur 部署指引（Phase 0）

前提:Contabo 已註冊為 Zeabur Dedicated Server(≥1 CPU/2GB、開 22/80/443/4222/6443/30000-32767、root SSH)。先定 **`NETWORK = testnet | mainnet`**。

### A.1 Service ① walrus-aggregator（公開讀、無錢包）
1. Zeabur project → **Add Service → Docker image** → `cmdoss/walrus:latest`。
2. **Variables**:`MODE=aggregator`、`NETWORK=<testnet|mainnet>`。
3. **Networking/Domains**:expose port `31415` → 綁 `walrus.<domain>`(或先用 `*.zeabur.app` 子網域)。Zeabur 自動 TLS。
4. 無需 Volume。這就是 `<video>`／`<img>` 直接打的公開端點(`https://walrus.<domain>/v1/blobs/:blobId`)。
5. (可選)`walrus.<domain>` 前面掛 Cloudflare → `Cache-Control: immutable` 邊緣快取、降延遲、支援 Range。

> **Service ② MemWAL relayer**:現有服務,**本案完全不動**(不改 code、不換 image、不重啟)。沿用既有部署。

### A.2 錢包(Service ③ 的前置)
- 準備一顆 Sui 錢包私鑰(`suiprivkey1…`)= **所有 Blob object 的 owner**。**另存備份**(遺失=所有 blob 續不了租)。
- 充值:testnet 用 faucet 領 SUI + WAL;mainnet 充真幣。只放工作量級,當熱錢包。

### A.3 Service ③ asset 服務（自訂 image:node + walrus CLI + 錢包）
Phase 1 一併產 `packages/relayer/Dockerfile`(entrypoint = `assets-server.ts`,與 MemWAL relayer 的 `server.ts` 分開),形狀:
```dockerfile
# base 已含 walrus + sui binaries + 依 NETWORK 的 client config
FROM cmdoss/walrus:latest
# 裝 Node（asset 服務零 npm dep，node:http 原生 TS，Node ≥ 23.6）
RUN install node …
WORKDIR /app
COPY src ./src           # Root Directory = packages/relayer ⇒ context 即此資料夾
ENV DATA_DIR=/data PORT=8788 WALRUS_CLI=walrus
EXPOSE 8788
CMD ["node", "src/assets-server.ts"]
```
1. Zeabur → **Add Service → Git**;**Root Directory = `packages/relayer`**、build 用 Dockerfile。
2. **Variables**:`SUI_KEYSTORE=<私鑰>`、`WALRUS_NETWORK=testnet`、`WALRUS_CLI=walrus`、`RELAYER_SECRET=<隨機長字串>`、`RELAYER_CORS_ORIGIN=*`(前端定案後改正式網域)、`DATA_DIR=/data`、`PUBLIC_AGGREGATOR_BASE=https://walrus.<domain>`、續租門檻那組。
3. **Volume**:掛 `/data`(registry)＋ 錢包 keystore/config(`/config`、`/wallets`,或統一放 `/data` 下)。**沒掛 Volume = 重啟掉 registry、掉錢包。**
4. **Domains**:expose `8788` → 綁 `assets.<domain>`。
5. 驗證:`GET https://assets.<domain>/health` 回 `{ ok:true, walrus:"cli" }`。

### A.4 前端接線（Tier C 定案後）
- Vercel env:`DEMO_CLIPS_URL=https://assets.<domain>/api/manifest/hero-clips`(首頁換片,打 asset 服務);`MEMWAL_SERVER_URL=https://relayer.<domain>`(記憶,維持原樣);asset 後台代傳用的 `RELAYER_SECRET=<asset 服務的 secret>`。
- 回 Service ③ 把 `RELAYER_CORS_ORIGIN` 改成正式 Vercel 網域。**這就是「之後只動一個 env + 一行 CORS」的全部。**

> Zeabur 參考:[Docker image 部署](https://zeabur.com/docs/en-US/deploy/customize-prebuilt) · [Dockerfile](https://zeabur.com/docs/en-US/deploy/dockerfile) · [Volumes](https://zeabur.com/docs/en-US/data-management/volumes) · [Dedicated Server](https://zeabur.com/docs/en-US/dedicated-server) · Walrus image [`cmdoss/walrus`](https://hub.docker.com/r/cmdoss/walrus)
