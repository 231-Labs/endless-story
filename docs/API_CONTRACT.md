# Endless Story — Frontend ↔ Backend API Contract

前端 facade（`packages/web/src/lib/api/`）的 dual-source 開關完成後，所有 method 內部都能用同樣的 signature 拉 mock 或真實後端。本文件是後端 endpoint 的契約對照表。

## 環境開關

```env
NEXT_PUBLIC_DATA_SOURCE=mock|api    # default: mock
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787   # 當 source=api 時
```

## 共通約定

- 所有回應 JSON
- 4xx / 5xx 後端要回 `{ error: string }` body — `http.ts` 會 throw `ApiError`
- 不存在資源回 404（facade 內部 catch → return null）
- 時間用 ISO 8601 字串
- ID 是 string（demo 是 mock id；生產是 Sui object id `0x...`）

---

## Endpoints

### Sagas

| Method | Endpoint | Response | 說明 |
|---|---|---|---|
| GET | `/sagas` | `Saga[]` | 列出所有 saga |
| GET | `/sagas/{id}` | `Saga \| 404` | 單一 saga |
| GET | `/sagas/current` | `Saga` | 預設 demo saga（短期） |
| GET | `/locations` | `SagaLocation[]` | 世界級地理 |
| GET | `/locations/{id}` | `SagaLocation \| 404` | 單一 location |

### Characters

| Method | Endpoint | Response | 說明 |
|---|---|---|---|
| GET | `/characters` | `Character[]` | 列出所有 character |
| GET | `/characters/{id}` | `Character \| 404` | 單一 character |
| GET | `/characters?sagaId={id}` | `Character[]` | 屬於該 saga 的成員（不含 wild） |
| GET | `/characters?ownedBy={wallet}` | `Character[]` | 某錢包持有的角色 |
| GET | `/characters/{id}/magnetism` | `CharacterMagnetism` | UI 派生屬性（訂閱數 / 招牌引文 / 下次 POV） |
| GET | `/characters/{id}/persona` | `CharacterPersona \| 404` | 本色卡（半永久人格藍圖） |
| GET | `/characters/{id}/live-state` | `CharacterLiveState` | 當下狀態（intent / location / nextPlan） |

### Chapters

| Method | Endpoint | Response | 說明 |
|---|---|---|---|
| GET | `/chapters?sagaId={id}` | `Chapter[]` | saga 全部章回 |
| GET | `/chapters?sagaId={id}&visibility=public` | `Chapter[]` | 僅公開 |
| GET | `/chapters?sagaId={id}&latest={n}&visibility=public` | `Chapter[]` | 最近 N 章 |
| GET | `/chapters?characterId={id}` | `Chapter[]` | 該角色出場的公開章回 |
| GET | `/chapters/{id}` | `Chapter \| 404` | 單章 |

Note: chapter.body 從 Walrus blob 拉取後快取在回應裡（或回傳 walrusBlobId 讓前端自己取）。

### Scenes

| Method | Endpoint | Response | 說明 |
|---|---|---|---|
| GET | `/scenes?sagaId={id}` | `Scene[]` | saga 內所有場所 |
| GET | `/scenes/{id}` | `Scene \| 404` | 單一場所 |
| GET | `/scene-clips?sagaId={id}` | `SceneClip[]` | 全部派生視頻 clip |
| GET | `/scene-clips?day={d}&latest={n}` | `SceneClip[]` | 今日相關 clip |

Scene 物件回傳含 `gallery.anchor`（Walrus blob ref）/ `performance`（戲台正在演）/ `pastEvents` / `heatProfile` / `ghostQuotes` / `derivativeCounts`。

### Subscriptions

| Method | Endpoint | Request | Response | 說明 |
|---|---|---|---|---|
| GET | `/subscriptions?wallet={addr}` | — | `Subscription[]` | 該錢包訂閱列表 |
| GET | `/subscriptions?characterId={id}` | — | `Subscription[]` | 該角色訂閱者列表 |
| POST | `/subscriptions` | `{ wallet, characterId, channel }` | `Subscription` | 訂閱（idempotent） |
| DELETE | `/subscriptions?wallet={a}&characterId={c}` | — | `204` | 取消訂閱（只刪 `isOwner=false`） |

POST 後端應對應到鏈上 `subscribe_pay` 交易、監聽事件後寫 DB。

### Relationships

| Method | Endpoint | Response | 說明 |
|---|---|---|---|
| GET | `/relationships?fromId={id}` | `RelationshipEdge[]` | 某角色的 outgoing edges |
| GET | `/relationships` | `RelationshipEdge[]` | 全部 edges |

由 sleep cycle `subjective-llm` 每日蒸出 / accumulate。

### Interventions（owner 寄夢 / 耳語）

| Method | Endpoint | Request | Response | 說明 |
|---|---|---|---|---|
| GET | `/interventions?characterId={id}` | — | `OwnerIntervention[]` | 列出過往寄託 |
| POST | `/interventions` | `{ characterId, ownerWallet, kind, text }` | `OwnerIntervention` | 寄入新一條 |

後端要驗 `ownerWallet === character.nftOwner`。內容 Seal 加密、看客視角只見「夢/語 · 已感應」、看不到 body。

### Soul Songs

| Method | Endpoint | Response | 說明 |
|---|---|---|---|
| GET | `/soul-songs?characterId={id}` | `SoulSong[]` | 角色心曲池 |

由 LLM 在 saga arc / 情緒事件後生成。7 日 cooldown 是 client-side 限制（localStorage）。

### Memories（owner-only）

| Method | Endpoint | Response | 說明 |
|---|---|---|---|
| GET | `/memories?characterId={id}&viewer={wallet}` | `CharacterMemory[]` | 角色記憶日誌 |

後端內部 verify `viewer === character.nftOwner`，非 owner 直接回空陣列。8 種 kind / importance / provenance 結構對齊舊版 `runner/src/memory/`。

### Recruitments

| Method | Endpoint | Response | 說明 |
|---|---|---|---|
| GET | `/recruitments?status=open` | `Recruitment[]` | open 徵召 |
| GET | `/recruitments/{id}` | `Recruitment \| 404` | 單一徵召 |

Mint voucher 流程前端走 dapp-kit，後端只提供 metadata。

---

## Type 對照

所有 Response 型別都在 `packages/shared/src/types/`：

| Endpoint group | Types |
|---|---|
| Saga | `Saga` / `SagaLocation` / `SagaPersistentPrompts` / `RevenueConfig` / `SagaMetrics` / `SagaWorldTime` |
| Character | `Character` / `CharacterMagnetism` / `CharacterPersona` / `CharacterLiveState` |
| Chapter | `Chapter` / `ChapterPOV` |
| Scene | `Scene` / `SceneClip` / `SceneGallery` / `ScenePastEvent` / `SceneHeatProfile` / `SceneGhostQuote` / `ScenePerformanceState` |
| Subscription | `Subscription` / `SubscriptionChannel` |
| Relationship | `RelationshipEdge` / `RelationshipTone` |
| Intervention | `OwnerIntervention` / `InterventionKind` |
| Soul Song | `SoulSong` / `SoulSongMood` |
| Memory | `CharacterMemory` / `CharacterMemoryKind` / `MemoryProvenance` / `MemoryProvenanceSource` / `MemoryClaimStatus` |
| Recruitment | `Recruitment` / `RecruitmentMembership` |

---

## 後端實作建議

1. **儲存層**：短期沿用舊版 `~/.endless-wuxia/` fs JSONL（runner 已能寫）；中期上 SQLite / Postgres；長期 MemWal + Walrus。
2. **同 process 還是獨立 service**：建議獨立 service，前端只透過 HTTP 對話。前端 next dev 可走 mock；service 起來後切 `NEXT_PUBLIC_DATA_SOURCE=api`。
3. **驗證層**：owner gate / Seal decryption 都在 service 端；前端只是 transport。
4. **Walrus blob 取**：service 內部從 Walrus 拉再回給前端 — 前端不直接訪 Walrus aggregator（CORS / 一致性）。
5. **Cache 策略**：facade 預設 `cache: 'no-store'`。靜態資源（character 本體、saga 基本資料）可用 `revalidate: 60`。

---

## 切換流程

當後端 service 開好對應 endpoints：

```bash
# .env.local
NEXT_PUBLIC_DATA_SOURCE=api
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787

pnpm --filter @endless-story/web dev
```

UI 一行不動，所有資料源走後端。
