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

### Phase 3 — Director（LLM）授權標的 🟡 已建 / flag-gate / 待鏈上驗（2026-06-11）
> **狀態**：A（LLM 框題）+ B（LLM 立題）程式碼已落、各自 flag-gate（`llmFraming` /
> `directorResources` 預設 **關**）、純測試 + 型別綠（58 測試）、**未在真鏈驗**。

**最佳實踐原則（本階段的設計骨）**：**LLM 掌「意義」，永不掌「守恆」。** 選哪樁衝突
（`selectContention`）維持決定性、可測、不可被 LLM 操弄；LLM 只負責 (A) 框題的人話與
(B) 提議新標的——而標的一律過 bootstrap 同一套 validation，鏈上守恆說了算。三層各自的
變更速率不同：供給（慢、受管、上鏈）／選擇（決定性）／意義（快、LLM、可回退）。

**A — LLM 框題（`llmFraming`）**：把 `framingForStatement` 的 keyword if/else 後面接一層 LLM
即時命名（`actions/event-framing.ts`）。純敘事、不碰鏈；任何失敗（flag 關／LLM 未配置／回
junk）都 `sanitizeFraming` 退回決定性 label。選擇仍決定性——只有那句人話會變。

**B — LLM 立題（`directorResources`）**：導演可中途 `instantiate` 一個新爭奪標的
（`actions/propose-resources.ts`）。關鍵相容點：on-chain label = `<kind>:<display>`、
templateId = `contention:<kind>`、欲望句 = `爭得「<kind>:<display>」`——因為 spine 用
`templateId.split(':')[1]` 當 keyword 去 match label/句子，**新標的的結算路徑與內建 slot 完全
一致，不需 registry**。需求層 `defaultDesiresForCast` 讀活資源，所以新標的下一 tick 自動被
渴望、再下一 tick 被 spine 結算。`event-planner.parseDirectorContention` 從欲望句救回 `<kind>`，
是讓 templateId 保持正確、新標的真的會易手的那一個窄修補。

**安全護欄**（`chain/resource-proposal.ts`，純 + 9 測試）：kind 須 ascii slug 且不可撞內建
（spotlight/recording/partnership）、不可撞既有 kind 軸；display 非空有界；capacity 整數 ≥1 且
夾到 `castSize−1`（≥cast 就人人有份、零張力）；每 saga 每 `COOLDOWN_CALLS`=6 次才諮詢一次
LLM、上限 `MAX_DIRECTOR_RESOURCES`=3 個導演標的。全程 failure-isolated，不丟例外。

- genesis preset 仍種開場標的；建議重種得更貼春雪社（現 3 個泛用 slot）。
- `retire_resource`（收標的）尚未接——目前只增不減；標的清場列為後續。

---

### Phase 4 — 真·多回合出牌 ⏳ 需 redeploy
若要「每 tick 各出一張、連打數 tick 周旋」（而非單回合 + 餘波），需改 `event.move`：多回合手牌
或分回合 resolve 條件。非當前 demo 範圍。

## 4. 現況一句話

- **Phase 1**（反鬼打牆 + 純選擇腦）✅ 已落並接上 storylet 路徑——世界該開始輪流換衝突。
- **Phase 2**（跨 tick 事件 spine：lingering + 收回結算 + 合本在收回織）🟡 **程式碼已落、flag-gate
  （預設關）、型別 + 純測試綠**，但**未在真鏈驗**。開 `eventSpine` flag 前，在能跑真 tick 的
  session 驗 §3 那四點。off 時 demo 行為完全不變。
- **Phase 3**（LLM 導演授權標的：A 框題 + B 立題）🟡 **程式碼已落、flag-gate（預設關）、
  純測試 + 型別綠**，但**未在真鏈驗**。開 `llmFraming` / `directorResources` 前見 §6。
- **Phase 4**（真·多回合出牌）⏳ 需 redeploy。

## 5. 開 flag 驗證 runbook（在能跑真 tick 的 session 執行）

目標：在不污染 demo 的前提下，把 §3 那四個未驗點逐一確認，再決定是否預設開 `eventSpine`。

**前置**：sui/錢包/testnet 可用、saga 已種子化、有 ≥2 角色同場、drama 有張力（有 DramaResource）。

**步驟**
1. **單回 dry 觀察**：`eventSpine: true` 連跑到一回走完（開→續→收，約 maxTicks=4 tick）。看 server log：
   - 開回那 tick：`②‴ 開回…` + 之後 `[event-spine] open` 無 warn；ACT 有 submit、**無** resolve（autoResolve 已關）。
   - 續回 tick：`②‴ 續回…`；ACT 無新 submit（單回合，已 acted）。
   - 收回 tick：`②‴ 收回…` + `[tick-loop] spine resolve (...): settled=? cutPovs=N`。
2. **驗點① 結算提案被接受**：收回 log 的 `settled=true` 即代表 `resolve_event(outcomes_with_resource_transfers)`
   + `apply_resource_transfers` 都成功。若 `settled=false` 看 warn：
   - `settling resolve aborted` → 提案被 `resolve_event` 拒（conservation / 參與者檢查）。
   - `apply_resource_transfers failed` → 多半是**驗點②**。
3. **驗點② resourceId**：若 apply 一直失敗，比對 `readResourceLedger` 回的 `snapshot.id`（drama.ts:115，
   取自 `json.id`）與該 DramaResource 的**物件 id**是否一致。不一致 → 在 `readResourceLedger` 用
   `live[].resourceId`（物件 id）取代 `json.id`，或在 spine 結算用物件 id。
4. **驗點③ 節奏**：覺得太快/太慢，調 `spineResolveAndWeave` 上游的 `minTicks`/`maxTicks`（現 2/4，
   走 `SpineCtx`）。
5. **驗點④ 競態**：背景 `after()` 收回 vs 下一 tick 讀 registry。連跑數回，若 log 出現對已收回事件
   重複 resolve 的 abort（無害、failure-isolated），可把 `openBySaga.delete` 提前到 `spinePlanAndOpen`
   偵測到 resolve step 時即刪。
6. **驗世界前進**：連跑 2–3 回，確認 `selectContention` 的 top 張力**有換標的**（allocation 真的變了），
   而非靠 anti-repeat 硬輪。這是 Q1 根治的判準。
7. **回退驗證**：`eventSpine: false` 跑一輪，確認與主線行為一致（storylet 路徑無回歸）。

通過 1–7 → 才考慮把預設改開、或在 UI 露出切換。任何一步卡住且非小修 → 回報，別硬推 demo 分支。

## 6. Phase 3（A 框題 / B 立題）驗證清單

> 在能跑真 tick 的 session 執行。A 不碰鏈、可先單獨開；B 動 instantiate + 守恆，**建議
> 先過完 §5 spine 驗證再開**，因為 B 的標的要靠 spine 才會易手。兩者各自 flag-gate、預設關，
> 不開時 demo 行為與主線完全一致。

**前置**：§5 前置（sui/錢包/testnet、saga 已種子化、≥2 角色同場、LLM 已配置 `kind:'cheap'`）。

### 先驗回退（兩 flag 都關）
1. `llmFraming:false` + `directorResources:false` 跑一輪 → 確認 framing 仍是內建決定性句、
   無新標的、與現行 demo 零差異（純回歸驗證）。

### A — LLM 框題（`llmFraming:true`，B 仍關）
2. **有換人話**：開回的 `②‴`/`②²` log 裡 storylet label 應是 LLM 寫的活句，不再是那三條固定
   內建句（「今晚誰壓軸…」等）。連跑數回，句子隨場景/卡司變化。
3. **退回安全**：把 LLM 暫時改成會失敗（或斷網）→ label 應**無縫退回**內建決定性句、tick 不
   中斷、無 throw。這驗 `sanitizeFraming` + try/catch 護欄。
4. **不污染結構**：templateId 不受 A 影響（A 只改 label）——確認 anti-repeat 與 spine 結算
   行為和 flag 關時一致（A 純敘事層）。
5. **品質眼檢**：label 是單句白描、≤約20字、無引號/句末標點、無人名清單（場記風格）。
   不合則調 `event-framing.ts` 的 system prompt。

### B — LLM 立題（`directorResources:true`，建議 A 也開）
6. **諮詢節奏**：每 saga 每 6 次 tick 才諮詢一次導演（`COOLDOWN_CALLS`）。log 看 `②²`：
   多數 tick 應安靜（cooldown 不印），偶爾印「導演立題…」或「導演按下不表（…）」。
7. **立題上鏈**：當 log 出現 `②² 導演立題：新增爭奪「<kind>:<display>」（容量 N） ✓上鏈` →
   去鏈上/explorer 確認新 `DramaResource` 物件存在、label/capacity 正確。
8. **驗點① 新標的被渴望**：立題後**下一 tick** 的 `②′ 張力推導` 資源數應 +1；該 `<display>`
   應出現在 `drama.top` 的張力句（`爭得「<kind>:<display>」`）。這驗 `defaultDesiresForCast`
   自動接上新標的，不需手動派欲望。
9. **驗點② 新標的會結算（端到端核心）**：再幾 tick，當 selection 選到這個新標的、spine 收回時，
   `[tick-loop] spine resolve` 應 `settled=true`，且該 `<kind>:<display>` 的 allocation 在鏈上
   真的易手。**這是 A+B 與 spine 串成一條線的判準**——templateId `contention:<kind>` 對到 label
   前綴成功的證明。若 `settled=false` 且 warn 指向找不到資源 → 檢查 `parseDirectorContention`
   的 kind 是否被正確救回（log picked.templateId 應為 `contention:<kind>` 而非 `storylet:tension`）。
10. **驗護欄不被繞過**：
    - 餵導演一個會回 `kind:"spotlight"`（撞內建）或非 ascii kind 的情境 → 應 log
      「導演按下不表（rejected: …）」**不**上鏈。
    - 連開多輪直到 3 個導演標的 → 第 4 次應 `reason: director-resource cap reached`，不再新增。
    - capacity 給超大值 → 上鏈容量應被夾到 `castSize−1`（驗 `validateResourceProposal` 夾值）。
11. **世界真前進**：連跑 ~10 tick，確認 `selectContention` 的 top 標的會在「內建 slot」與
    「導演新標的」之間輪換、且 allocation 真的隨結算移動——不是靠 anti-repeat 硬輪。這是
    Phase 1 Q1 根治 + Phase 3 立題共同生效的最終判準。

通過 1–11 → 才考慮把任一 flag 預設開、或在 UI 露出切換。任何一步卡住且非小修 → 回報，
別硬推 demo 分支。`retire_resource`（標的清場）尚未接，目前只增不減（見 §3 Phase 3 末）。

_本檔是活文件；每推進一個 Phase，更新 §3 狀態。_
