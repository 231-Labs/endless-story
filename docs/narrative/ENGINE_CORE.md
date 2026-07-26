# Engine Core — 單一機制核心紀律（single-home rule）

> **狀態**：canonical · 2026-07-12 起。本檔規定「敘事機制寫在哪裡」，終結研究線與生產線
> 各養一份實作的時代。與本檔衝突的舊習慣（把機制寫進 `web/lib/chain`、在實驗 harness
> 裡 fork 一份 core）一律以本檔為準。
>
> **北極星**：**第 300 回還好看。** 每一條機制工作用這個問題過濾：「這會不會讓第 300 回
> 更好看？」過不了的先不做。機制只寫一次、在一個地方演化，是這個北極星唯一撐得起的
> 工程結構——同一份程式碼，實驗跑幾百回驗質變，生產跑同一份給讀者。

## 1. 四個家，各自只放一種東西

| 家 | 放什麼 | 不放什麼 |
|---|---|---|
| **`packages/engine/src/core`** | 一切敘事機制（want、scene-loop、routing、fatigue、box-office…）。純函數/純狀態機，零 I/O、零鏈、零 LLM 呼叫 | prompt、鏈上讀寫、檔案存儲 |
| **`packages/engine`（ports/adapters/tick/session）** | `SceneAgentPort`/`RecallPort`/`ArchivePort`/`ClockPort` 介面、local adapters（fake/JSON/markdown）、`RunnerSceneAgent`（真 LLM delegate）、tick pipeline、WorldState snapshot/restore、`src/session/character-session.ts`（每角色持久 LLM session，key = (sagaId, characterId)，匯出 `@endless-story/engine/session`） | 機制本體（進 core）、web 專屬 wiring |
| **`packages/runner`** | LLM authorship services：prompt 建構與驗證（beat、weave、review、POV、判官）。純 prompt 部分抽 node-clean leaf（如 `beat-prompt.ts`） | 機制數學（進 engine core）、tick 編排 |
| **`packages/web`** | 鏈上 I/O、durable stores（file-store）、server actions、UI。機制一律 `import '@endless-story/engine/core/*'` | 機制實作。`web/lib/chain` 不再新增機制模組 |

實驗 harness（`packages/engine/experiments/*`）驅動**同一個** engine core，經 local
adapters 換掉 LLM/記憶/時鐘。實驗驗過的機制改動 = 生產已經拿到的機制改動，不存在
「沙盒已驗、待對齊真實代碼」的搬運債。

## 2. 判斷歸屬的試金石

- 「這段邏輯換一個題材的 saga 也成立嗎？」成立 → engine core。
- 「這段話是說給 LLM 聽的嗎？」是 → runner（prompt service）。
- 「這段碼碰 fs / chain / env 嗎？」是 → adapter 或 web store，機制部分抽純函數進 core。
- 測試想在 `node --test` 零依賴跑 → 它測的東西必須是 core 或 node-clean leaf。

前例：`spatial-routing` 的拆法（純置放數學在 engine，file-store 皮留在 web）、
`beat-prompt.ts`（純 prompt builder 抽 leaf，runner barrel 維持 tsx-only）。

## 3. 已完成的搬遷（2026-07-16 現況）

`want-core` · `want-rewrite` · `scene-loop` · `scene-routing` · `spatial-routing`（數學）·
`actor-fatigue` · `box-office` 已住進 `engine/src/core`；web 的 `tick-loop` 與 harness
直接 import engine；H3d（bond yearn）已直接落在 engine 單一實作（`core/bond-graph.ts`）。

`core/scene-perception.ts`（beat 層感知邊界：誰聽得到這一句）也是 engine 單一實作，
從結構欄位（`audience` / `addressed`）判定，不從生成的散文反推隱私；`addressed` 指不到人
時 fail closed 退回只有說話者聽見，不廣播。

`strictStructured`（CLI `--strict-structured`）是同一份 core 的研究 profile：
授權、物件 mutation、want subject／lifecycle 與場景 capability 只讀結構化欄位；
舊 prose／preset detector 仍可執行，但只能寫入 `structuredMonitor`，不得改狀態、
拒絕 proposal 或觸發 replan。`objectEffects` 缺席代表沒有物理變動；提供了無效 effect
仍由 core validator fail closed。flag 關閉時保留 legacy 路徑，讓對照臂不 fork core。

## 4. 待搬遷清單（`web/lib/chain` 剩餘機制模組）

搬遷模式一律照 §2：純機制進 core、store/鏈讀寫留 web、測試跟著機制走。

| 模組 | 備註 |
|---|---|
| `contest.ts` | 意圖×能力結算（§8c），純模型，搬遷成本低 |
| `drama-core.ts` / `drama.ts` | 張力引擎核心 vs 鏈上 wiring，先拆再搬。注夢攪動（`applyDreamStirs`，§2.51 劑量語義）住在 `drama-core.ts` 裡，沒有獨立的 `dream-stir.ts`；測試在 `dream-stir.test.ts`，搬遷時跟著 `drama-core` 走 |
| `event-planner.ts` | 導演出牌規劃 |
| `attention-core.ts` | spotlight/注意力 |
| `arc-pressure.ts` / `arc-lifecycle.ts` / `arc-convergence.ts` | 弧線壓力/生命週期 |
| `character-secrets.ts` | 秘密機制（store 部分留 web） |
| `centrality-select.ts` | 選角中心度 |

原則：**不做大爆炸搬遷**。每個模組在下次被實驗或功能碰到時順手搬（碰到 = 搬），
搬完 web 端留 re-export shim 或直接改 import，全 repo type-check + 該包測試綠才算完。

## 5. 鐵律

1. **機制改兩份 = bug。** 若發現 web 和 engine 有同名機制分歧，engine 為準，web 收斂。
2. **engine core 永遠 node-clean**：`node --test` 零 creds 可跑全部機制測試。
3. **實驗不 fork core**：harness 只能經 ports 注入差異（fake agent、本地 recall、參數）。
   對照組用同一份 core + 不同 flag/參數，不用複製檔案。
4. 生產接線改動照 research-line 規則：**feat/* → dev PR**，research 分支只改實驗/harness。
   （完整版 `RULES.md` 目前只在 `research` 分支上，本分支沒有這個檔，故不放連結。）
5. **散文不是狀態入口**：research profile 的客觀世界只接受結構化 proposal；prose
   divergence 是 telemetry，不是 authority。不要在 adapter、runner 或 web 另造反向 parser。
