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

### Phase 2 — 事件 spine（storylet → 跨 tick BudgetEvent）⏳ 需鏈上驗證
> ⚠️ 改的是 tick-loop 最核心段，**無鏈環境無法驗**；建議在有 sui/錢包/testnet 的 session 做，
> 或先 flag-gate（`eventSpine` 預設關，保留現行 storylet 路徑當 fallback）再逐步切換。

1. **開場**：當 `selectContention` 選出一樁「目前沒有對應 OPEN 事件」的 contention，且某 scene
   有 ≥2 在場者 → `pushEvent`（用該 contention 的 card catalog + 參與者）開一個 BudgetEvent。
   記錄 `eventId`（= 跨 tick 穩定身分）。
2. **發展（多拍）**：之後每 tick ACT phase 讓 OPEN 事件的參與者各出一張牌（已有）。事件**跨
   數 tick** 才走到全員出完（靠 hand size / 分批出牌控制節奏）。每拍的 POV `provenance.eventTx =
   eventId`（穩定），不再用逐 tick storylet digest。
3. **收尾 + 結算**：全員出完 → `resolveEvent`，且用 **`outcomesWithResourceTransfers`** 把稀缺
   標的轉給贏家（贏家判定 = drama/Director 規則）→ `applyResourceTransfers` 落鏈 → allocation 變
   → 下輪 `selectContention` 的張力自然移到別的標的 → **世界前進**。
4. **合本在收尾織**：把這個 `eventId` 跨拍累積的所有 POV 一次織成一回（`event-chapter-compiler`
   已能吃多 POV；改成在 resolve 時、用 eventId 聚合的 POV 觸發，subject 改 eventId 或維持 scene）。
   → Q2 解決：合本 = 一整樁事件的多視角章回。

### Phase 3 — Director（LLM）授權標的 ⏳ 需鏈上 + 接自治導演
- capability catalog 加 `instantiate_resource(label, capacity, archetype)` / `retire_resource(id)`。
- 自治 Director（NARRATIVE_AGENTS N5）隨弧判斷「這條弧該為什麼而爭」→ 開/收標的 → 貼劇本。
- genesis preset 仍種開場標的；建議重種得更貼春雪社（現 3 個泛用 slot）。

---

## 4. 現況一句話

Phase 1 已落（反鬼打牆 + 純選擇腦 + 測試），**世界該開始輪流換衝突**——但這只是緩解；
事件仍是逐 tick 軟 storylet，合本仍是單 tick 快照。**Q2（合本=整樁事件）+ Q1 的根治（資源易手
推進世界）要等 Phase 2 的跨 tick 事件 spine**，那段必須在能跑真 tick 的環境建/驗。

_本檔是活文件；每推進一個 Phase，更新 §3 狀態。_
