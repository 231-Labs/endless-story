# Endless Story · 說書人 Agent 化章回（Storyteller-Gated Chapter Compiler）

> **狀態**：design draft · 2026-06-18 起 · 章回（event_cut）產製的下一代設計。
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

- 設計稿建立 2026-06-18。**尚未動工**，等 scope/分期定案。
- 前置 ⑨ 已 commit `9e88be3`（待部署 + VPS world-loop 跑新碼驗收）。
