# Endless Story · Production 上線規劃

> 從「testnet demo（web 直連鏈、每次 request 即時掃 event）」走到「mainnet production
> （indexer + 自有 DB，web 不碰 RPC）」的遷移計劃。
> **觸發背景（2026-06-19）**：testnet RPC 的兩個結構性失敗模式 —— 公共節點 `fullnode.testnet.sui.io`
> 在 fan-out 下 **429**；免費節點 `publicnode.com` **prune 掉歷史 event** → `suix_queryEvents` 回
> `-32603` → `fetchOnChainCharacters` throw → facade 靜默退 **mock**（假班底＋假圖）。兩者都是
> 「web ↔ 公共 RPC 直連 + 即時 event scan」的結構性後果。詳見 memory `rpc-archival-events-gotcha`。
>
> 本檔只管「production 化」這一條線。

---

## 0. 為什麼現況不能直接上 production

整個 app 的鏈上讀取是**事件日誌掃描**：`read.character.listMintedCharacters` 掃 `CharacterMinted`，
POV 章回 / reflection / dream / resource 全走 `suix_queryEvents`。把這個放在**面向使用者的 web、每次 request 即時跑**，有三個結構性問題：

1. **429**：web 每頁 fan-out 幾十個 RPC，雲端 egress IP 在共享節點上很快被限流。
2. **依賴 RPC 永久保留全歷史**：非 archival 節點 prune 掉舊交易 → event 查不到 → 整頁退 mock。
3. **越來越慢**：`queryEvents` 掃全歷史，資料越多越慢，就算用完美 archival 節點也一樣。

換更貴的節點只是墊高天花板，沒拆掉「web 直連鏈 + 即時 scan」這個耦合。

---

## 1. 目標架構：indexer 解耦

```
鏈 ──(events)──> indexer ─────> Postgres ─────> web 讀 DB
                 (唯一 RPC 消費者,             (自有 archive、
                  cursor 增量、可重試)          快、不 429、不怕 prune)
```

**原則**
- indexer 是**唯一**打 RPC 的東西；單一消費者 + 從上次 cursor 重試 → 對 429／prune／抖動天然免疫。
- web 改讀**自有 DB**（＝你自己的 event archive）→ 429 與 prune 兩個問題一起消失，讀取恆定快。
- 寫路徑（mint / tick / tx 提交）仍直連鏈，但那是低頻、單點，好控。

**這個縫早就留好了**：facade 的 `DATA_SOURCE='api'` → `httpGet('/characters')`（[`http.ts:117` notImplemented](../../packages/web/src/lib/api/http.ts) 現為 stub），`runner` / `relayer` 兩個 package 本就是這條 backend 路。production ＝把它接上 indexer，而不是繼續走 `mock` / 直連鏈的 facade。

---

## 2. 分期

### Phase P0 — 止血（今天，留在 testnet，不動架構）
- `SUI_RPC_URL` → **專屬 archival 節點**（見 §3），先讓 testnet 穩。**不可再用會 prune event 的免費節點。**
- 開大 server-side 快取：[`read-cache.ts`](../../packages/web/src/lib/chain/read-cache.ts) 已有 TTL（`CHAIN_READ_CACHE_TTL_MS`）+ stale-while-revalidate；list 組裝（roster / feed 掃描）套 SWR，砍掉九成重複 RPC → 429 直接緩解。
- ⚠️ 此 cache 是 **process-local**（serverless 多實例不共享）；跨實例要等 P1 的 DB 或 relayer KV。

### Phase P1 — indexer 解耦（web 不再直連鏈）
- 在 `runner` 新增 indexer service（建在既有 [`infra/event-bus.ts`](../../packages/runner/src/infra/event-bus.ts) / [`infra/network.ts`](../../packages/runner/src/infra/network.ts) 的 cursor-read 之上）：訂閱 `CharacterMinted` / POV / reflection / resource 等事件，cursor 持久化，落 Postgres。
- 實作 web 的 `api` 端點，取代 [`notImplemented()`](../../packages/web/src/lib/api/http.ts)：`GET /characters[?sagaId=|ownedBy=]`、`/characters/{id}`、`/chapters`、`/scenes`… 由 DB 服務。
- web 切 `NEXT_PUBLIC_DATA_SOURCE=api`；此後 web 不碰 RPC。

> **進度（2026-06-23，PR [#64](https://github.com/231-Labs/endless-story/pull/64) 已併）**：P1 的讀取層已落地，但形狀與原規劃不同。
> 結果是**獨立的 [`packages/indexer`](../../packages/indexer/)（不是 `runner` 內的 service）**，採**透明 sdk 縫**而非 `DATA_SOURCE=api` HTTP 端點重寫：
> - 縫在 [`sdk/src/read/query-retry.ts`](../../packages/sdk/src/read/query-retry.ts)：有註冊 store 時 `queryEventsWithRetry` 改讀 store，回傳同一個 `{ data, hasNextPage, nextCursor }` 信封，**所有 caller 不改一行**；無 store 時退回原本的 live-RPC 重試路。
> - web 在 `runTickLoopAction` 經 [`lib/server/event-store.ts`](../../packages/web/src/lib/server/event-store.ts) 註冊 `PgEventStore`，**gate 在 `DATABASE_URL`**：沒設＝no-op、讀續走 RPC；註冊失敗（DB 連不上）吞掉、下個 tick 重試，永不弄壞 tick。
> - capture ＝**自架 poller**（[`poll.ts`](../../packages/indexer/src/poll.ts) 的 `FetchPage`），落 Postgres；事件身分＝鏈上 `(txDigest, eventSeq)`，故換 source 不變身分。早期的 Surflux Flux 推流 capture（`capture.ts`/`flux.ts`）已被自架輪詢取代（dashboard 不穩），檔案暫留樹中。
> - 仍待：web 的 `api` HTTP 端點（characters/chapters/scenes…）＋ `NEXT_PUBLIC_DATA_SOURCE=api` 全切（上面兩個 bullet），讓 web runtime **完全零直連鏈**；目前縫只把**事件讀**導向 store，非事件讀（object/tx）仍直連 gRPC。
>
> **進度（2026-07-07，PR [#78](https://github.com/231-Labs/endless-story/pull/78) 已併）**：整個 repo 已從棄用的 JSON-RPC 遷到 **gRPC Core API**（object/tx/coin/balance 讀取 + 上鏈）＋ **GraphQL**（事件查詢，gRPC 無 `queryEvents` 對應）。poller 的 `FetchPage` 現在**預設 `graphqlFetchPage`**（`SUI_GRAPHQL_URL`，預設官方 testnet GraphQL），`jsonRpcFetchPage` 留作退路;無 store 時 `queryEventsWithRetry` 也 fallback GraphQL。本檔上文的 `SUI_RPC_URL` / `suix_queryEvents` / 「web 不碰 RPC」措辭是遷移前的規劃語境，現況讀取層＝gRPC + GraphQL，寫路徑走 sdk 的 `execute` seam（`signAndExecute` / `normalizeTxResult` / `findCreatedObjectId`）。

### Phase P2 — mainnet 換軌
| 項目 | testnet 現況 | production |
|---|---|---|
| **鏈** | 會 reset；package id 每次 reseed 都變 | **mainnet**：穩定 package、停止 churn（[`contract-ids.ts`](../../packages/shared/src/contract-ids.ts) 寫 mainnet 快照）|
| **Walrus** | **blob 會過期**（真角色圖總有天蒸發）| mainnet Walrus + **付費續租**（relayer 的 [`asset-walrus.ts`](../../packages/relayer/src/asset-walrus.ts) 已有 own-Blob 寫入，補續租 cron；見 memory `walrus-assets-backlog`）|
| **SEAL/MemWal** | testnet | mainnet 金鑰 / relayer |

### Phase P3 — fail-loud + 韌性
- facade 目前「鏈一抖就**靜默退 mock 假資料**」散在多處（[`characters.ts:50`](../../packages/web/src/lib/api/characters.ts)、`chapters.ts`、`scenes.ts`、`locations.ts`、`relationships.ts`…）。
- production 把 **demo fallback 與 `USE_MOCK` 拆開**：新增 `ALLOW_DEMO_FALLBACK`（預設 false on prod）。`isDeployed()` 後鏈讀失敗 → **error boundary + retry**，而不是餵假班底。production 餵假資料比報錯更危險。

---

## 3. RPC 廠商建議

需求：**支援 `queryEvents` 全歷史（archival）+ 夠高的 rate limit + testnet/mainnet 都有**。
注意：P1 之後 indexer 是單一消費者，rate limit 重要性大降，**archival（event 不被 prune）才是硬指標**。

**先把兩個不同的需求分開**（一家不必全包；分開挑反而乾淨）：

| 需求 | 用誰 | 說明 |
|---|---|---|
| **Gas Station（代付 gas）** | **Shinami** | Sui 原生、這是它現在的招牌（讓使用者零 SUI 玩）。⚠️ 它的 **Node Service（RPC）已從主選單降級**——RPC 不再是它招牌，**別把讀取層押在它上面**；拿它做 gas station 就好 |
| **Archival RPC（讀取層）** | **Chainstack / OnFinality / BlockVision / QuickNode** | 以 RPC 為本業、挑明確支援 Sui archival 的 |
| **Indexing（P1 可借）** | **BlockVision** | 現成 Sui indexing API（account/NFT/coin/activity），可縮短 P1 自建 indexer 的工 |

**鐵律：別信行銷，直接測。** 「archival」廠商常講得含糊，唯一可靠判準＝拿到 endpoint 後，對你的真實歷史事件跑：

```
suix_queryEvents { MoveEventType: "<packageId>::character::CharacterMinted" }
```

回得出全部角色＝archival 合格；回 `-32603 Could not find the referenced transaction events`＝被 prune、淘汰（`publicnode.com` 就是這樣被抓出來的）。

**簽約前確認三件**：① `queryEvents` 全歷史（archival，非 prune）；② rate limit 夠 P0 的 web-direct fan-out（P1 indexer 上線後就不重要）；③ mainnet + testnet 都有。
**自架 fullnode**：完全掌控但 ops 重（數百 GB、要追網路、且仍要自建 indexer 才有 event 歷史）——你目前 Zeabur+Contabo 規模，用 managed 廠商更划算。

---

## 4. 驗收 checklist

- [ ] P0：`SUI_RPC_URL` = archival 廠商；`queryEvents(CharacterMinted)` 實測回 6 角色；roster 不再 mock。
- [ ] P0：roster/feed 套 read-cache SWR；觀測 RPC 呼叫數 / 429 率下降。
- [x] P1a：`packages/indexer` 落地（PgEventStore + 自架 poller + 透明 sdk 縫）；設 `DATABASE_URL` 後**事件讀**改走 Postgres。
- [ ] P1b：web `api` HTTP 端點 + `DATA_SOURCE=api` 全切，web runtime **零 RPC**（grep 確認不再 `makeSuiClient`，含非事件 object/tx 讀）。
- [ ] P2：mainnet contract-ids 快照；Walrus mainnet + 續租 cron 跑通；真圖 mainnet 200。
- [ ] P3：`ALLOW_DEMO_FALLBACK=false`，鏈讀失敗 → error boundary（**不** 顯示假班底）。
