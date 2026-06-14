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
| A7 | **創世記憶四類配方**（wound／relationship／world-stakes／texture 各至少一條）+「只輸出最終一版正文」守門。實驗2：厚度躍升在 N≈3（傷口/情）、複雜度躍升在 N≈10（外部利害），N≈15 飽和；配方齊全的 6–8 條勝過同質 15 條 | `runner/services/genesis-memory/prompt.ts`（種記憶時依四類產製、可單測缺類）；守門併入 A1/B1 的 POV/合本 system | 🟡 沙盒已驗（FINDINGS §實驗2） |

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
| **D6** | **混合制：判決定走向，自由文字定戲味**。實驗1：純自由行動能推（4/4 advanced）且更有戲味，但丟掉收束/守恆/上鏈。結論＝**保留發牌＋決定性判決當骨架**（收束在既定標的、capacity 守恆、持有權可上鏈），在 verdict 之後加一層**自由行動文字**（一句人設化的演繹）餵給 POV 當血肉 | `act.ts` verdict 之後不變；新增可選的 free-text action 欄——由 character-agent 在已知判決結果下產一句行動文字，經翻譯層(A3)後注入 `tick-loop.ts` 的 POV 材料。**純文字、不改判決、不上鏈** | 🟡 沙盒已驗概念（FINDINGS §實驗1） |

## E. 卡司 / 資源 / 數據

| # | 沙盒決策 | 真實代碼落點 | 狀態 |
|---|---|---|---|
| E1 | 柳蘇改「相親相愛＋愛而不得」（去嫉妒） | preset `cli/scripts/stories/spring-snow.json` 的 `founding_cast[].secret` | 🟡（待拍板要不要改 preset） |
| E2 | `partnership:柳生春` → `partnership:蘇映雪`（爭的是蘇的小生搭檔位，柳在位、江來搶） | preset `drama_resources` + 相關 framing | 🟡（待拍板） |
| E3 | 加 唐桂蘭/連翹 進主要互動圈 | 已在 preset；只是 demo 是否納入主線 | 🟡 |

---

## F. 第二輪 6-tick log 後的修正（sim 已驗，待對齊）

> 第二份 full log 暴露的問題＋已在 sim 修好的解。對齊時併入對應的真實落點。

| # | 問題（log 實證） | sim 的修法 | 真實代碼落點 | 狀態 |
|---|---|---|---|---|
| F1 | **唱片跑步機**：碟已灌定，灌錄權卻被反覆重爭，第3回≈第6回重寫同一場錄音 | **行使即退場＋長出後繼標的**：`exercisable`資源結算達`retireAfterResolves`次→retire＋依`successor`規格自動生下游標的（唱片→銷路風評），動態 seekers＝記者＋腔在碟上的贏家 | `event-spine`/資源生命週期（EVENT_LIFECYCLE §6）：scarce resource 加 `exercisable`+`successor`，結算 hook 觸發 retire＋instantiate（走 propose-resources 既有路徑） | ✅ 沙盒已驗 |
| F2 | **簡繁混用**：第3回整段吐成簡體，auditProse 抓不到 | **確定性簡→繁轉換層**（`toTraditional`，無 LLM，~600 字表），生成後出庫前正規化 | `runner/services/narrative-audit.ts` 加一個純函式 normalize（或共用 opencc-data 子集）；在 POV/合本/餘波出庫前跑 | ✅ 沙盒已驗 |
| F3 | **自檢髯口誤殺**：「不掛髯口」被判行當錯誤，regenerate 改不動、壞稿出庫 | beard 檢查改為**只抓非否定的提及**（前 4 字含 不/沒/未/無/莫/勿/別 即放行） | 併入 B1 `narrative-audit.ts` 的 beard rule | ✅ 沙盒已驗 |
| F4 | **token 漏進正文**：餘波/合本餵 debug `verdict`（帶〔斬/攻〕）；且 `verdict` 進 history→PLAN→`c.plan`→POV，江的打算漏了〔守〕 | 餘波/合本改餵 `verdictNarrative`；history 改存 `verdictNarrative`（乾淨敘事餵 PLAN/showrunner） | `tick-loop.ts`：所有餵給寫作/plan/showrunner 的結算字串走翻譯層(A3)，debug token 串只留機制 log | ✅ 沙盒已驗 |
| F5 | **弧線座標餵錯線**：T4 scandal 事件被餵唱片線座標（配不到就退回 lines[0]） | arcContext 改：內建 kind 關鍵字→標的 display 與各線 2-gram 重疊度→都配不到就用事件本身合成中性座標，**絕不借用無關的線** | 併入 A6：`tick-loop.ts` 取 arcPlan line 時用此匹配 | ✅ 沙盒已驗 |
| F6 | **死線續命**：partnership 已被班主鎖定，showrunner 仍一路問「會不會排擠誰爭搭檔」 | showrunner prompt：現有標的標「已鎖定/已退場」者，對應線 state 收成「已定，不再爭」、nextPush 留空 | A6 的 showrunner（`director/tools.ts`）prompt + 餵入 locked/retired 狀態 | ✅ 沙盒已驗 |
| F7 | **跨章複讀**：「連本帶利」「掌心冷了一層」「刻進黑膠」反覆；私帳「等得起」原句覆述 3 次 | ① 整本共用 anti-repeat **banlist** 餵各 system；② 私帳 **reveal-once 跨章**：`targetedRecall` 記已揭 index，全揭過則回響＋prompt 禁復述原句 | A7 延伸：banlist 進 prompt；reveal 狀態 per-char 存（先 process-local，後 relayer KV，同 A6 回數計數） | ✅ 沙盒已驗 |

## G. 產品化對齊：真實檔案落點（掃描已定位 2026-06-14）

> 真實 pipeline＝`web/src/lib/actions/tick-loop.ts` 的九階段（ADVANCE→PLAN→MOVE→DRAMA→SOCIAL→ASK→GIVE→ACT→PRODUCE(POV)→REFLECT→NARRATE）。
> 沙盒驗過的東西，照下表搬到對應服務。

| 沙盒產物 | 真實服務／檔案 | subject · kind | 對齊動作 |
|---|---|---|---|
| **角色回 POV** | `runner/services/character-worker/{index,prompt}.ts`；anchor＝`web/lib/chain/pov-core.ts` | characterId · `pov` | B-prompt 取向(承上/推進/啟下·第一人稱·私帳揭一角) + banlist + reveal-once + craftSheet 併入 `prompt.ts`；自檢(`narrative-audit.ts`)+簡→繁 包在 `index.ts` 出庫前 |
| **梨園回 event_cut** | `runner/services/event-chapter-compiler/{index,prompt,weave}.ts`；`web/lib/actions/compile-event-chapter.ts` | sceneId · `event_cut` | cutSystem 取向(不揭私帳·結尾 CTA·回目) + 簡繁/banlist/性別代詞 audit；`MIN_POVS_FOR_CUT=2` 已＝沙盒 |
| **公報 gazette** | `runner/services/gazette-compiler/{index,prompt}.ts` | sagaId | 維持客觀日報；連結已改寫 `/feed/chapter/{commitmentId}`。沙盒沒做公報，這層照舊 |
| **餘波回（新）** | 尚無——`character-worker` 加 `mode:'sequel'` 或新 `services/sequel-*` | characterId · `pov`(或新 `sequel`) | 觸發＝事件結算後的 loser、next tick；用沙盒 `sequelSystem` 模板（四選一 delta） |
| **判決** | `web/lib/actions/tick-phases/act.ts` `deriveVerdict`（已核實：純 intent 升序＋最早提交，**無**屬性加權/持有者黏性/冷卻） | — | **已拍板：移植持有者黏性＋冷卻上鏈**。沙盒已驗：持有者+18 + 冷卻2tick 是破跑步機/鬼打牆的關鍵；對齊時在 resolve 計分加 holder bonus、在 spine/event-planner 加冷卻。屬性加權＝次要，可後議 |
| **行使即退場＋後繼標的** | `propose-resources.ts`＋新增 `retire`；event-spine resolve hook | — | recording 類資源加 `exercisable/successor`；結算 hook 觸發 retire＋instantiate（走既有 propose 路徑、過守恆護欄） |
| **私帳/反思** | `genesis-memory`(selfMemories)＋`reflection-trigger` | MemWal `reflection`/`memory` | 見下「反思編織」 |

### 反思編織（回答「reflection 怎麼織進角色章回」）

- **現況**：`reflection-trigger` 產的自述已寫回 MemWal（`kind='reflection'`，subject=characterId）；而 `character-worker` 本來就吃 `recentMemorySnippets`（MemWal recall）。兩端其實已經接得上。
- **收斂洞見**：沙盒的 `privateLedger` + reveal-once **就是** prod reflection 的靜態版；reflection 是它的**動態升級**（會隨劇情長新內心、owner 還能注入問題）。
- **方案 A（最小改動·推薦）**：寫某角 POV 前，`character-worker` 召回時**定向多撈該角最新 reflection**，當 `reflectionContext` 餵進 prompt 的「私帳/why」槽；沿用 reveal-once（已揭過只回響不複述）。→ 深度直接進正文、不改章回結構。owner 用 `ask_reflection` 主動問 → 下一回 POV 就帶著那層新內心。
- **方案 B（加分）**：把 passive reflection 本身當一種「**自述回**」章回型別，與餘波回並列，gated 訂閱者讀。
- **守私帳**：reflection 是 gated 內容，**只進角色版/自述回，絕不進梨園回/公報**（公開漏斗不揭 why）。

## 對齊時的施工順序（最後一次性做）

1. **純函式先搬**（零鏈、可單測）：A1/A2/A3/B1 → 直接成 `narrative-audit.ts` + prompt 改寫 + gesture/display map。
2. **tick-loop 接線**：A4/A5/A6/B2/C1 → 在 POV/合本生成處接上材料 + 自檢。
3. **flag-gated 機制**：D3/D4/D5 → 照 EVENT_LIFECYCLE §5/§6 runbook 在有鏈環境驗 flag，再預設開。
4. **數據拍板**：E1/E2/E3 → 改 preset，redeploy/bootstrap。

> 每搬完一條，把狀態改成「已對齊」並註明 commit。
