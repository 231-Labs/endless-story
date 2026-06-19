# Endless Story · 說書人 Agent 化章回（Storyteller-Gated Chapter Compiler）

> **狀態**：Phase A 引擎已實裝 + 解耦 harness 驗過、**尚未接線進 production**（2026-06-18）·
> 章回（event_cut）產製的下一代設計。設計（§1–§6）仍為提案形態，落地進度見 §7。
> 屬 [`CONTENT_PIPELINE.md`](./CONTENT_PIPELINE.md) §2「回」這一層的重寫提案；
> 與內容鏈路其餘層（POV/公報/劇照）的形態約定仍以 CONTENT_PIPELINE 為準。
> agent 權責邊界以 [`NARRATIVE_AGENTS.md`](./NARRATIVE_AGENTS.md) 為準。

---

## 0. 一句話

把章回從「**每次事件 resolve 就一次性重織那一 tick 的 POV**」改成
「**說書人 agent 累積一條故事線的素材，自己判斷夠不夠、有沒有進展才動筆；
動筆時多輪推理 + 調人物記憶 + 問人物動機，自評到散文／劇本級才上鏈**」。

---

## 1. 問題（為什麼要改）

2026-06-18 對 testnet 春雪社（saga `0x29f6…`，第 30 日）的鏈上實證：

- **章回文筆其實已達散文水準**（聲口胎記、燈下 coda 等 ①②已落地），但
  **事件不前進**——抽第 15／16／17 回正文，全是同場景（後台妝閣／書寓）、
  同卡司、同微動作（勻粉、沈班主走過樓梯、水袖、誰壓軸），反覆重述同一樁張力。
- 第 11–27 日的事件標題全是 hardcoded 的「今晚誰壓軸、誰站台心的暗潮浮上了檯面」
  （`event-planner.ts:63`，非 LLM 改寫）。

**三層根源**：

1. **上游事件重複** — 同一條 `contention:spotlight` 幾乎天天觸發（drama 趨同）。
   → 屬 `防趨同`（[`PERCEPTION_PLAN.md`](./PERCEPTION_PLAN.md)）的範疇，與本檔**分開但互補**。
2. **每 resolve 就織一次** — cut prompt（`event-chapter-compiler/weave.ts buildUserPrompt`）
   只餵「那一 tick 的 POV」，**沒有「已經講過什麼」的記憶、沒有進展判斷、沒有品質多輪**。
   ← **本檔主要修這一層。**
3. **POV 原料本身重複** — 角色每 tick 重新描述同一個對峙。

> 對照已修的 ⑨（章回顯示窗 + spine 記憶體 POV 鏈上回補，commit `9e88be3`）：那是讓
> **既有**章回看得到、讓新章回**能被織出來**；本檔是讓織出來的章回**不重複、夠好看**。

---

## 2. 設計：四個元件

```
            ┌─────────────────────────────────────────────────────┐
  事件/POV  │  ① 素材累積帳本 (Accumulation Ledger)               │
  ───────▶ │     跨多 tick/多事件，按「故事線」累積 + watermark   │
            └───────────────┬─────────────────────────────────────┘
                            │
            ┌───────────────▼─────────────────────────────────────┐
            │  ② 進展閘 (Storyteller Readiness Gate)              │
            │     「相對上一回，有新進展值得寫嗎？」沒有 → 不出   │
            └───────────────┬─────────────────────────────────────┘
                            │ 夠了
            ┌───────────────▼─────────────────────────────────────┐
            │  ③ Agentic 多輪寫作 (tool-using compose)            │
            │     recall 記憶 / 問人物動機 / 出牌內心話            │
            │     draft → 自評(rubric+audit) → 修 → loop          │
            └───────────────┬─────────────────────────────────────┘
                            │ 過關
                            ▼   上鏈 (commitment subject=sceneId, es:cut)
            ┌─────────────────────────────────────────────────────┐
            │  ④ 節奏 (Cadence)：說書人心跳驅動，與 tick resolve 解耦 │
            └─────────────────────────────────────────────────────┘
```

### ① 素材累積帳本

不再每 resolve 就織。按**故事線**（非單一事件）累積跨多 tick/多事件的素材：
POV、出牌（含內心話）、結算、資源易手。

- **持久化**，不靠記憶體：接 ⑨ 的鏈上 POV 回補（`fetchEventPovs` 按 `es:prov.eventTx`），
  serverless tick 間不遺失。
- **watermark**：每條故事線記「已說到哪」（last-told event/day），去重，避免重複消費。

### ② 進展閘（防重複的關鍵）

說書人 agent 判斷：相對上一回，有沒有**新的、非重複的進展/轉折**值得寫？

- 輸入：累積 beats + **上一回摘要** + drama 張力 delta。
- 沒進展 → **這輪不出**（使用者要的「不用每 tick 出」）。
- 「還是同一個對峙」→ 等更多素材，而不是再寫一篇換皮的。

### ③ Agentic 多輪寫作（帶工具）

說書人不是一次 prompt，而是 tool-using compose：

| 工具 | 接既有 | 用途 |
|---|---|---|
| `recallCharacterMemory(角色, 主題)` | MemWal recall（`packages/memwal`） | 調人物過去記憶，深化動機/連貫 |
| `askCharacter(角色, 問題)` | `character-agent`（`packages/runner/.../character-agent`） | 「你為何做 X／怎麼看 Y」→ 戲裡口吻內心理由 |
| 出牌內心話 | act phase（`tick-phases/act.ts`）emit + 上鏈 | 出牌時「戲中所想/所講的一句」織入 |
| 自評 | `narrative-audit` + 新 rubric | 散文/劇本/小說 bar |

流程：**draft → 自評 → 修，loop 到過關或預算上限**。

### ④ 節奏

由說書人心跳（每 K tick，或進展閘觸發）驅動，與 tick-loop 的 resolve 解耦。
接 showrunner / saga-director 既有心跳。

---

## 3. 品質 rubric（③ 自評用，草案）

達標才上鏈，否則修或退回累積：

1. **有進展**：這回相對上一回，世界/關係有可指認的變化（非換皮重述）。
2. **有來龍去脈**：起因 → 轉折 → 落定，讀者跟得上。
3. **有血肉**：至少一處人物動機/內心被點出（recall 或 askCharacter 的產物）。
4. **聲口分明**：多視角時各角色口吻可辨（接已落地的聲口胎記）。
5. **文體**：至少散文，理想劇本/小說；無後台黑話（機械問題/0x/結算/巡檢）。

---

## 4. 分期

| Phase | 範圍 | 產出 |
|---|---|---|
| **A · 防重複** | 進展閘 + 「已說過 watermark」+ 前一回摘要餵 prompt 當「勿重述」 | 最小、最能馬上減重複；不需新 agent |
| **B · 深度工具** | `recallCharacterMemory` + `askCharacter` 接進 compose | 章回有動機/記憶層 |
| **C · 品質迴圈** | rubric judge + revise loop；出牌內心話 emit+上鏈+織入 | 達劇本/小說 bar |
| **D · 節奏** | 說書人心跳決定累積窗、與 resolve 解耦 | 「agent 決定何時出」 |

> Phase A 單獨就能砍掉大部分重複，建議先做、reseed 觀察，再決定 B–D。

---

## 5. 可複用既有積木

- **MemWal recall** — `packages/memwal`（recall/remember scaffolding，env-gated）。
- **`character-agent`** — 可「問人物」的 agent 化角色。
- **`narrative-audit`** — 既有確定性自檢（token-leak / female-他），rubric 在此擴。
- **`event-chapter-compiler`** — compose core，從一次性改多輪 agentic。
- **⑨ 鏈上 POV 回補** — `spineResolveAndWeave` / `fetchEventPovs`，累積層持久化的基礎。
- **showrunner / saga-director 心跳** — ④ 節奏的觸發點。

---

## 6. Open questions

1. **「故事線」的單位**？按 contention resource？按場景？按參與者集合？watermark 掛在哪。
2. 進展閘用 cheap 還 primary model？誤判「沒進展」會讓章回變稀疏 → 要可觀測。
3. 出牌內心話上鏈：新 commitment kind 還是塞進現有 POV/event blob？牽動 `cut-read` 的 subject 過濾（⑨ 假設 cut subject=scene、POV subject=character）。
4. 與上游 `防趨同`（PERCEPTION_PLAN）如何分工：本檔不製造新事件，只決定「同一樁事該不該再寫」；事件多樣性仍靠 drama/director 層。

---

## 7. 進度

**Phase A 引擎 + 解耦驗證 — DONE（2026-06-18，未接線進 tick-loop）**
程式碼在 `packages/runner/src/services/storyteller-chapter/`：
- `material.ts` — 統一 `StoryMaterial` 模型（pov/observation/card_intent/event_open/event_resolve/memory）+ `arcKeyOf`（按 contention 軸聚合，scene 為 fallback）+ `groupIntoArcs` + watermark（`ArcWatermark`/`advanceWatermark`）。純、自包含。
- `gate.ts` — `decideChapterReadiness`：**resolve-independent**（resolve 只是正向觸發、缺席不阻擋）+ **反飢餓**（沉默 ≥ `maxSilentDays` 或素材 ≥ `overviewMaterialCount` 就出綜觀版）+ **anti-repeat**（只算 NEW 素材、要新聲口/進展拍，純重述→wait）。閾值全可調（`ReadinessThresholds`）。
- `compose.ts` — `toChapterCompilerPayload`（slice→compiler 增益欄位，挑最新 scene 當 anchor、mode→minVoices）+ `briefSummary`（下一回的「勿重述」guard）。
- 複用 `event-chapter-compiler`：擴 `EventCutContext`/`runOnce` 接 `observations/intents/recalled/prevSummary/mode/minVoices`，**append-only 向後相容**（既有單事件 weave 不變），單一 anchor 路徑。
- 測試 `packages/runner/test/storyteller-chapter.test.ts`（13 例，node --test 23.7）：anti-stuck/anti-repeat/反飢餓/watermark 去重/payload 映射全綠；runner 全套 89 綠、web typecheck 乾淨。

**解耦 harness 驗證（真鏈資料，`pnpm --filter @endless-story/runner harness:chapter`，需 node ≥ 23）**
讀春雪社 91 則真 POV、跑**生產同一份 gate**：
- 第 1–27 日共產出 **25 回**（對照產線 cut 停在第 17 日）；**全程不餵任何 resolve 素材仍續產**＝解耦證實。
- 素材連續的 arc 內最大章回間隔受 floor 約束；稀疏 arc 的大間隔＝那幾日真的沒素材（正確等待）。
- Phase 2 用**真 compiler**（dryRun + 真 LLM）為「產線從沒寫過的第 18–27 日」織出 682 字 2 視角綜觀章——有來龍去脈、有內心戲、prevSummary guard 生效、briefSummary 產出。

**尚未做（staged）**
- **接線進 tick-loop / event-spine**：production 目前仍走舊的 resolve-only 路徑。引擎做成「生產會呼叫的同一份模組」且已用真 compiler 驗過，但**最後的 cutover 沒做**——它動到脆弱的 live tick 路徑、且本機無法跑 live tick 驗證。建議**加 flag（預設 OFF）做成 resolve-independent 的次要觸發**、在 VPS world-loop 開 flag 驗證後再設預設（同 eventSpine 的 flag-gated 移植法）。
- **Phase B**：compose 時用工具**生成** recall/askCharacter 素材（目前 compose 只是「接收」這些欄位）。
- **Phase C**：rubric judge + revise 多輪迴圈；出牌內心話 emit+上鏈。
- **Phase D**：說書人心跳決定累積窗。
- **觀察素材持久化**：日常觀察（Situation）目前只在記憶體、不上鏈 → harness 無法回補；要當持久素材需上鏈或在 tick 內傳入。

**調參筆記**：`DEFAULT_THRESHOLDS` = `{minNewVoices:2, minProgressBeats:2, maxSilentDays:3, overviewMaterialCount:6, minOverviewVoices:1}`。想要「久一點才出、更高品質」就調大 `maxSilentDays`/`overviewMaterialCount`。

**前置**：⑨（章回顯示窗 + spine 鏈上 POV 回補）已 commit `9e88be3`（待部署 + VPS 驗收）。

**診斷標籤（commit `be57e46`）**：在 production 的 cut 產製路徑（`packages/web`）植入 `[ch-diag]` 四組標籤，方便 VPS 上對照「為何沒出章」：
- `[ch-diag] tick`（`tick-loop.ts`）— spine 每 tick census（open/continue/resolve/idle count）。
- `[ch-diag] accumulate`（`tick-loop.ts`）— 各 event 每 tick 累積的 POV／voices 數。
- `[ch-diag] resolve`（`event-spine.ts`）— resolved event 的成敗細節（memVoices/path/wove/povCount/skip/err）。
- `[ch-diag] cut-read`（`cut-read.ts`）— read-side 掃描（scanned commitments/candidates/final cuts）。
- `[ch-diag] spine-plan`（`tick-loop.ts`，commit `7d3a851`）— 為何開/不開事件：occupancy / candidates / 各軸 quorum。

---

## 8. 方向定案（2026-06-18）：三聲部 + 故事總綱

VPS 實跑後使用者的兩個更深的判斷，重設了方向：

1. **「敘事完全沒了日常，整個圍繞在事件上——搶歸搶難道沒有人性？」** 公開敘事面 100% 是
   contention event_cut；日常觀察 / 輕量互動 / 關係記憶**每 tick 都在產，卻死在記憶體**，
   或被降級到訂閱限定的「角色回」。engine 把「故事」等同於「資源爭奪」。
2. **「最希望透過 AI 讓章回讀起來像小說一樣承先啟後、彼此關聯。」**

### 8.1 三個聲部、三種門檻

| 面 | 是什麼 | 門檻 | 餵什麼 |
|---|---|---|---|
| **手卷**（`/saga` handscroll） | 世界的**活脈搏**／現況（即時感） | 低、即時、可消逝 | 出牌台詞、溫情片刻、日常觀察、輕量互動、誰在哪 |
| **章回** | **小說**（承先啟後、彼此關聯） | 高、精選、永久 | AI 織成連續敘事 |
| （日常回） | 中間態 | 中 | 可選；多數日常放手卷即可，不必硬成回 |

三者互相成全：手卷吸收即時性 → 不再空屏、真的「活著」；章回得以守高門檻、專心做文學性。
**手卷現況空的根因**：`getSagaLiveSnapshot` 只吃**開著的事件**（`OpenEventStatus` + 每場景最新
出牌 ghost quote）→ 0 事件就整片空。重生 = 改吃**所有 live tick 素材**（出牌 intent 已上鏈；
觀察/互動在記憶體，需開 live 端點）。

### 8.2 故事總綱（Story Bible）——AI 讓章回承先啟後的關鍵

給說書人一份**持久的敘事狀態**，每寫一回前讀它、寫完更新它：

- **總綱內容**：running synopsis（故事到目前為止）、未了的 threads（主/支線＋現況＋status）、
  各角色此刻的弧線（state）、上一回的摘要、留給下一回的 hooks（鉤子）。
- **寫一回 = 承先啟後**：讀總綱 →（承先）接上一回的尾、callback 前文細節 → 推進 ≥1 條 thread →
  （啟後）結尾留一個 hook → 寫完**更新總綱**（thread 進展/收束、synopsis 追加、刷新 hooks）。
- 這就是「每回獨立 recap 一個事件」（舊）↔「一部連續的小說」（目標）的差別。
  已建的 `prevSummary`「勿重述」guard 是種子（只回看 1 回、防守型）；總綱把它升級成
  **累積、thread-aware、主動連貫**。

**落地**（純核心可解耦測試，與 material/gate 同模式）：
- `story-bible.ts`（純）：`StoryBible` 型別 + `emptyBible` + `selectContinuityContext(bible, castIds)`
  （挑與在場卡司相關的 threads/arcs/hooks → 餵 compiler 的「承先」context）+
  `applyChapter(bible, update)`（寫完把 thread 進展/新 hook/synopsis 折回 → 新總綱）。storage-agnostic。
- `event-chapter-compiler` 擴 `EventCutContext.continuity`（synopsis/openThreads/hooks/castArcs）+
  buildUserPrompt 渲染「# 故事總綱（承先）」段 + 結尾「（啟後）推進一條線、留一個鉤子」指示。
- 持久化（I/O，staged）：總綱存哪（director memory / 專屬 commitment subject=saga）+ 寫完更新的
  LLM「折回」步驟。純核心先行、可測；persistence + live 折回在 VPS 驗。

### 8.3 順序（依使用者優先級）

1. **章回小說化**（本次動工）：`story-bible.ts` 純核心 + compiler `continuity` + 承先啟後 prompt + 測試。
2. **手卷重生**：`getSagaLiveSnapshot` 從「只吃事件」→「吃 live 脈搏」（出牌+溫情+日常+互動），修空屏。
3. 日常回：可選，多併進手卷。

> 並行前提：事件要能開（spine 保底 floor + 資源重新點火），否則脊椎本身沒戲。那是「有沒有戲」，
> 本節三聲部是「戲怎麼被讀到」，兩條獨立。
