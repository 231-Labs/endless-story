# Endless Story · 事件生命週期（Arc → Event → Beat → POV）

> **狀態**：canonical · 2026-06-10 起 · 自治世界「事件」粒度的唯一方向文件。
> 與內容產製鏈路（合本/公報/劇照/影片）見 [`CONTENT_PIPELINE.md`](./CONTENT_PIPELINE.md)；
> 與 agent 權責見 [`NARRATIVE_AGENTS.md`](./NARRATIVE_AGENTS.md)。本檔只管「一樁事件如何
> 跨 tick 地開場、發展、收尾，並讓世界往前走」。

---

## 0. 拍板的粒度（2026-06-10）

| 層級 | 是什麼 | 壽命 | 鏈上身分 | 對應產物 |
|---|---|---|---|---|
| **弧 Arc** | 一條主線（如「首張唱片之爭」） | 多日 | 一個 DramaResource 當爭奪標的 | — |
| **事件 Event** | 一樁有始有終的衝突（開場→周旋→**結算**） | **跨數 tick** | **一個 BudgetEvent 物件**（open→resolve） | **= 一回合本** |
| **拍 Beat** | 事件裡某 tick 的一個動作（出牌/開口/移動） | 1 tick | submit_action / scene-line | POV 原料 + 劇照 |
| **視角 POV** | 角色對一拍的主觀 | 1 tick | commitment(subject=char)，provenance.eventTx=**事件**id | 合本的素材 |

**稀缺標的（資源）誰安排**：genesis 用 preset 種開場標的；之後由 **Director（LLM）** 隨弧
推進 `instantiate` 新標的 / `retire` 舊標的（皮·演化）；誰想要哪個標的可由 LLM 作
（`desiresByCharacter` 鉤子）。

---

## 1. 根因調查（為什麼現在卡住）

自治世界目前用 **Storylet（逐 tick 軟事件，只 emit、無物件、無收尾）** 當事件，而非有生命
週期的 **BudgetEvent**。後果：

1. **主題鬼打牆**：每 tick 主題 = `storyletFraming(drama.top[0])`（決定性、無 LLM）。storylet
   永不結算 → 稀缺資源永不易手 → 鏈上 allocation 靜止 → 張力靜止 → top 永遠同一個 →
   每 tick 重開同一齣（「永遠搶唱片名額」）。
2. **合本不像章回**：POV 的 `eventTx` = 逐 tick 的 openStorylet digest，每 tick 不同 → 跨 tick
   的 POV 不會歸進同一合本 → 合本 = 單一 tick 快照，事件根本還沒結果。

> 兩題同源：**缺一個跨 tick、會結算、能推進世界的事件單位。**

---

## 1.5 關鍵機制限制：合約是「單回合」的（影響「多 tick」的定義）

調查 `act.ts` 收尾條件：`resolve_event` 在 `participants.every(acted)` 當下就翻牌，而一個
參與者**出一張牌就算 acted**。所以部署中的合約機制是 **single-round**——「每 tick 各出一張、
連打數 tick」的真·多回合周旋**需要 redeploy**（多回合手牌 / 分回合收尾）。

因此「事件跨 tick」在現有合約下的**可達定義**（spine 採此模型）：

```
tick T     開回   pushEvent + 發牌；該回合的卡一次打完（單回合）
T..T+n     續回   事件維持 OPEN（autoResolve 關）；POV／反應／互動跨 tick 累積，全部鎖同一 event id
T+n        收回   resolve_event 帶 resource transfer（贏家奪下稀缺標的）→ 需求轉移 → 世界前進；
                  合本在此把整回累積的 POV 一次織成一回
```

即：一回 = **一次動作回合 + 跨 tick 的反應／POV 累積 + 帶結算的收尾**。戲劇張力在「餘波與
結算」，不在重複出牌。真·多回合出牌列為 Phase 4（需 redeploy）。

## 2. 可用的鏈上 primitive（關鍵：不需 redeploy）

全部已部署、TS 可直接編排：
- `event.pushEvent`（開 OPEN 事件，帶 card catalog + hand size）
- `event.submitAction`（角色出一張牌）
- `event.resolveEvent` + `event.emptyOutcomes` / **`event.outcomesWithResourceTransfers`**（收尾，可帶資源易手）
- `event.applyResourceTransfers`（對 DramaResource 落實易手）
- `resource.instantiate` / `resource.retire` / `reallocate` / `acquire`（Director 開/收標的）

ACT phase（`tick-phases/act.ts`）已會處理 OPEN budget event：decide→submit→（全員出完）resolve。
**機制都在，只差自治 loop 沒去用它（只開 storylet，不開 budget event）。**

---

## 3. 實作計畫（分階段；標明可否在無鏈環境驗證）

### Phase 1 — 反鬼打牆 + 純選擇腦 ✅（已做，2026-06-10）
- `lib/chain/event-planner.ts`（純）：`selectContention` 全域排序 + **anti-repeat**（跳過近 N tick
  用過的 framing template）→ 世界輪流上 spotlight / recording / partnership；`framingForStatement`。
- 6 個單元測試（`event-planner.test.ts`）；tick-loop 的 storylet 選題改用它 + process 級
  `recentTopicsBySaga` 歷史。**型別 + 測試綠。⚠️ 未在真鏈跑過一輪。**
- 這是 deterministic 緩解層，也是 Phase 2 spine 重用的選擇腦。

### Phase 2 — 事件 spine（storylet → 跨 tick BudgetEvent）🟡 已建 / flag-gate / 待鏈上驗
> **狀態**：程式碼已落、flag-gate（`eventSpine` 預設 **關**，保留 storylet 路徑當 fallback）、
> 型別 + 純邏輯單元測試綠。**⚠️ 尚未在真 tick 跑過**——本容器無鏈。開 flag 前須在有
> sui/錢包/testnet 的 session 驗一輪。

已落的檔案：
- `lib/chain/spine-core.ts`（純，13 測試）：`decideSpineStep`（開/續/收回的生命週期狀態機）、
  `chooseSettlementWinner`（誰奪標的）、`planResourceTransfer`（從現持有者→贏家的一單位轉移）、
  `resourceForContention`。
- `lib/actions/event-spine.ts`（鏈膠水，型別已驗）：process 級 registry（每 saga 一個 OPEN 事件 +
  跨 tick POV 累積）；`spinePlanAndOpen`（決策→`createBudgetEventAction`+`dealHandAction` 開回）、
  `spineAccumulatePovs`、`spineResolveAndWeave`（結算 + 織合本）。**唯一新 tx 形狀** = resolve_event
  帶 `outcomes_with_resource_transfers`（`acquire`/`reallocate` → `makeMoveVec` → outcomes）。
- `tick-loop.ts`：`eventSpine` on 時，storylet 開場改走 spine、ACT 的 autoResolve 強制關、合本
  改成**只在收回時**用累積 POV 織（不再逐 tick 快照）。off 時行為與原本逐字相同。

**安全設計**：結算每一步都包了 fallback——任何失敗（提案無效、resource.move 沒套上、RPC）都
退回 `empty_outcomes` 純收尾，**事件必定關閉**，open 事件絕不會卡住 loop。世界只是該回沒結算。

**收 flag 前必須在鏈上驗的點**：①結算提案是否被 `resolve_event` 接受（conservation 重驗）；
②`readResourceLedger` 的 `snapshot.id` 是否等於 `apply_resource_transfers` 要的 DramaResource
**物件 id**（疑點，見 drama.ts:115）；③節奏（minTicks/maxTicks）手感；④背景 after() 收回與下
一 tick 讀 registry 的競態（已 failure-isolated，但值得看一眼）。

### Phase 3 — Director（LLM）授權標的 ⏳ 需鏈上 + 接自治導演
- capability catalog 加 `instantiate_resource(label, capacity, archetype)` / `retire_resource(id)`。
- 自治 Director（NARRATIVE_AGENTS N5）隨弧判斷「這條弧該為什麼而爭」→ 開/收標的 → 貼劇本。
- genesis preset 仍種開場標的；建議重種得更貼春雪社（現 3 個泛用 slot）。

---

### Phase 4 — 真·多回合出牌 ⏳ 需 redeploy
若要「每 tick 各出一張、連打數 tick 周旋」（而非單回合 + 餘波），需改 `event.move`：多回合手牌
或分回合 resolve 條件。非當前 demo 範圍。

## 4. 現況一句話

- **Phase 1**（反鬼打牆 + 純選擇腦）✅ 已落並接上 storylet 路徑——世界該開始輪流換衝突。
- **Phase 2**（跨 tick 事件 spine：lingering + 收回結算 + 合本在收回織）🟡 **程式碼已落、flag-gate
  （預設關）、型別 + 純測試綠**，但**未在真鏈驗**。開 `eventSpine` flag 前，在能跑真 tick 的
  session 驗 §3 那四點。off 時 demo 行為完全不變。
- **Phase 3**（LLM 導演授權標的）⏳ 待接自治導演。
- **Phase 4**（真·多回合出牌）⏳ 需 redeploy。

_本檔是活文件；每推進一個 Phase，更新 §3 狀態。_
