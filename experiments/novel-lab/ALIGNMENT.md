# 對齊帳本（模擬器 → 真實代碼）

> 策略：**全部先在 `sim/` 驗證，最後一次性對齊真實代碼。** 本檔是那次對齊的施工圖——
> 每個沙盒已驗證的機制，記下它對應真實代碼的落點 + 驗證狀態，對齊時照表逐條搬，不重新摸索。
>
> 驗證狀態：✅ 沙盒已驗（真模型跑過、讀起來對）｜🟡 沙盒已做待你拍板｜⬜ 還沒做

---

## A. 文字產製層（章回怎麼寫）

| # | 沙盒機制 | 真實代碼落點 | 狀態 |
|---|---|---|---|
| A1 | **prompt-B 取向**：承上/推進/啟下 + 揭一角私帳 + 全程第一人稱 | `runner/services/character-worker/prompt.ts`（system 改寫）；`event-chapter-compiler/prompt.ts`（合本，3rd） | ✅ |
| A2 | **行當本色卡**（坤生/乾生/花旦…的性別代詞+道具+戲碼硬規矩）注入 prompt | 同 A1，依角色 role 注入 | ✅ |
| A3 | **翻譯層**：機制 token（卡名〔斬〕、資源原始 label）→ 敘事動作/人話，才進寫作 prompt | `web/lib/actions/tick-loop.ts` 組 triggerNarrative 處 + 新 `cardGesture`/`resourceDisplay` map（放 shared 或 runner） | ✅ |
| A4 | **結構化代價**：輸家失去的標的 ↔ 他 plan 所求，注入材料 | `tick-loop.ts` verdict trigger（現只問「失了什麼」未結構化）＋ event-spine outcome | ✅ |
| A5 | **定向私帳召回**：戲劇高點多撈一條該角 secret/genesis 記憶 | `tick-loop.ts` POV phase 的 `memoryContext.recent`（加一條定向 query）；secret 已由 `genesis-memory` 種成私密記憶 | ✅ |
| A6 | **arcContext 接到筆上 + 回數 N**：showrunner 弧線座標（主問/上回結在哪/本回推進）+ 章回號餵進 POV/合本 prompt | `character-worker/prompt.ts` 加 `arcContext` 欄；`tick-loop.ts` 從 `director/memory-store` 讀 arcPlan 傳入；回數＝per-saga/per-char 計數（先 process-local，後 relayer KV） | ✅ |

## B. 自檢（品質守門）

| # | 沙盒機制 | 真實代碼落點 | 狀態 |
|---|---|---|---|
| B1 | **一致性 lint**：行當↔性別↔道具↔戲碼↔代詞↔機制token；只查明確女性代詞，坤生「他」放行 | 新 `runner/services/narrative-audit.ts`（純函式，可單測） | ✅ |
| B2 | **生成→自檢→改寫一次**：抓到硬傷把違反項回灌、重生一次 | 包在 POV/合本/餘波生成處（`character-worker` / `event-chapter-compiler` 呼叫端） | ✅ |

## C. 非競爭章回（日常/溫情/餘波）

| # | 沙盒機制 | 真實代碼落點 | 狀態 |
|---|---|---|---|
| C1 | **餘波回**（事件後輸家消化→私下決定） | 新 chapter kind；觸發＝事件結算後 next tick；接 PLAN 輸出 | ✅ |
| C2 | **溫情/感情戲**（兩人瑣事+潛台詞，愛而不得，gated 雙 POV，不進公報、非 BudgetEvent） | 接 SOCIAL phase 的 relationship delta 觸發；存取＝per-char gated POV（CONTENT_PIPELINE §1） | ✅ |
| C3 | **存取模型**：私密戲只給訂閱者、雙訂閱才拼出全貌 | `DAILY_LIFE.md §6.5` 已記；落 `web` gate（既有 client 端 gate 教條） | ✅（設計） |

## D. 事件 / 世界推進機制

| # | 沙盒機制 | 真實代碼落點 | 狀態 |
|---|---|---|---|
| D1 | **出牌＝發 N 張選 1＋屬性加權計分**（非克制） | **已對齊**：真實 `event.move` deck + `act.ts deriveVerdict` + `card_weight_rules` 就是這個。沙盒只是復刻確認 | ✅（已一致） |
| D2 | **anti-repeat 冷卻 + 最久沒結算優先**（破鬼打牆） | **真實 `lib/chain/event-planner.ts` 已有 anti-repeat（Phase 1）** ✅；冷卻/LRU 可併入 | ✅（真實已部分有） |
| D3 | **持有者黏性**（capacity-1 標的不每 tick 翻盤） | `event-spine` resolve 計分加 holder bonus（待加） | 🟡 |
| D4 | **班主介入**：偵測一人壟斷 → 護搭檔 + 令其輪空 | 真實＝Showrunner 用 `run_world_audit` 偵測失衡 + `direct_capabilities`；或新增一條 audit rule + capability | 🟡（沙盒已驗概念） |
| **D5** | **Showrunner 看世界 → 開新標的/退場舊標的**（讓世界長出新衝突軸）。沙盒已做：showrunner 心跳吃現場資源+卡司，輸出 `resourceOps`（instantiate/retire），過守恆護欄（kind slug/不撞內建/seekers≥2/上限3/冷卻3tick），新標的下一 tick 自動被渴望、被 spine 結算 | 真實＝把 `propose-resources.ts`(instantiate) ＋新增 `retire_resource` 包成 `director/tools.ts` 的 narrative 工具，讓 Showrunner 心跳能呼叫；照 EVENT_LIFECYCLE §6 開 `directorResources` flag 驗鏈 | 🟡 沙盒已做·待真模型跑驗 |

## E. 卡司 / 資源 / 數據

| # | 沙盒決策 | 真實代碼落點 | 狀態 |
|---|---|---|---|
| E1 | 柳蘇改「相親相愛＋愛而不得」（去嫉妒） | preset `cli/scripts/stories/spring-snow.json` 的 `founding_cast[].secret` | 🟡（待拍板要不要改 preset） |
| E2 | `partnership:柳生春` → `partnership:蘇映雪`（爭的是蘇的小生搭檔位，柳在位、江來搶） | preset `drama_resources` + 相關 framing | 🟡（待拍板） |
| E3 | 加 唐桂蘭/連翹 進主要互動圈 | 已在 preset；只是 demo 是否納入主線 | 🟡 |

---

## 對齊時的施工順序（最後一次性做）

1. **純函式先搬**（零鏈、可單測）：A1/A2/A3/B1 → 直接成 `narrative-audit.ts` + prompt 改寫 + gesture/display map。
2. **tick-loop 接線**：A4/A5/A6/B2/C1 → 在 POV/合本生成處接上材料 + 自檢。
3. **flag-gated 機制**：D3/D4/D5 → 照 EVENT_LIFECYCLE §5/§6 runbook 在有鏈環境驗 flag，再預設開。
4. **數據拍板**：E1/E2/E3 → 改 preset，redeploy/bootstrap。

> 每搬完一條，把狀態改成「已對齊」並註明 commit。
