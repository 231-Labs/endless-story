# 機制審計 — engine/src/core 全模組三分類

> 目的：為「通用多 agent 安全 testbed」釐清現有引擎中，哪些是**儀器**（A）、
> **社會物理假設**（B）、**戲劇啟發式**（C）、**春雪社特規**（D）。
> 本文件同時是新 repo 的遷移依據、proposal WP1 的附件、未來論文 ablation 章節的雛形。
>
> 初次逐檔掃描：2026-07-24。散文正則退役複核：2026-07-26；完整站點見
> [`PROSE_REGEX_INVENTORY.md`](./PROSE_REGEX_INVENTORY.md)。

## 分類判準

- **A 儀器（conservation / measurement）**：動守恆量（錢／物／鑰匙／契據）、
  記錄與驗證事件、溯源、記憶/session 持久化、場景回合制＋感知、
  checkpoint/fork/重播、訪談 harness。底層永遠開。
- **B 社會物理假設**：編碼「agent／社會如何運作」的假設（張力動力學、疲勞、
  相識進程、口碑）。要 flag 化、可消融、進 ablation 表。
- **C 戲劇啟發式**：主要為了好看（心會冷、惰息、生計軟拉力、salience gate、
  文筆）。research profile 預設關。
- **D 春雪社特規**：語意綁定戲班世界（票房、行當、廟願、香火）。屬世界內容包。

## 逐模組分類

| 模組 | 分類 | 備註 |
|---|---|---|
| `want-core.ts` | **A+B 拆分** | 帳本與 lifecycle = A；張力公式、夜會／清算／妒追謂詞 = B。STRICT 的有限 `semanticTags`、`subjectRef`、`resolutionCause` 是機制 metadata，普通 prose rewrite 不得改 |
| `want-rewrite.ts` | **A+B 拆分** | 帳本記錄＋預算 = A；「執念由境遇再生」= B。STRICT 新 want 經獨立語意宣告座席，`desc` 不再授權 target／resistance／contract foreclosure |
| `actor-fatigue.ts` | **B（死碼）** | `TICK_ACTOR_FATIGUE` 未接線；本任務依範圍不清理 |
| `bond-graph.ts` | **B** | 親密度累積／冷卻假設；數字不進 prompt、只 gate affordance |
| `scene-routing.ts` | **A（偏）** | 回合制基礎設施；addressed 加成與 per-beat 疲勞是小 B |
| `spatial-routing.ts` | **B（引擎內死碼）** | 只被 web 包引用；本任務依範圍不清理 |
| `scene-perception.ts` | **A** | `audience`／`addressed` 結構化欄位決定感知，fail closed，永不從散文反推；testbed 核心資產 |
| `scene-loop.ts` | **A+B+C 拆分** | 回合／感知／入帳 = A；親密協商與 resolution gate = B；文筆二階 = C。STRICT opening-vocative regex 只做 shadow，不再 replan |
| `skills.ts` | **C+D** | 文風提示 = C；stage 語意 = D。STRICT 只讀 `SceneInfo.capabilities` |
| `physical-canon.ts` | **A** | STRICT 只提交 `objectEffects`；散文 mutation/reference/handoff regex 留作 shadow monitor，不 throw、不 replan。`objectEffects` 缺席表示「無物理變動」 |
| `production.ts` | **A+D 拆分** | 確定性投入累積器＋首演 razor = A；戲文／首演語意 = D |
| `box-office.ts` | **D（引擎內死碼）** | 只被 experiments 引用；本任務依範圍不清理 |
| `housing.ts` | **A** | 房契 vs 租約 vs 實體鑰匙三層分離；授權研究核心原語 |
| `renown.ts` | **B+D** | 公開名頭 vs 私下自視 = B；舊 role table = D。STRICT 要 authored 值，缺席採 neutral 並 warning |
| `acquaintance.ts` | **A+B** | 誰認識誰 = A；公開身分種子 = B。STRICT 讀 `publiclyRecognizable` |
| `dream.ts` | **A+D** | 有界外部影響通道 = A；注夢語意 = D |
| `incense.ts` | **B+D** | 有界影響假設 = B；香火／神明框架 = D |
| `temple-prayer.ts` | **D+C** | STRICT 讀 `capabilities: ['temple']`；祈願完成讀 `resolutionCause`；求願啟發式 = C |
| `livelihood-rhythm.ts` | **C+B** | 生計軟拉力 = C；「人有日常節律」= B |
| `stakes-brief.ts` | **C+D** | 利害簡報 = C；開鑼／廟行文 = D。STRICT 還願 pull 不讀 `resolvedNote` |
| `season-economy.ts` | **A+D 拆分** | 守恆金流核心 = A；班庫／票房／契約語意 = D。STRICT performance boost 讀 `stateTags`；無 typed condition verdict 時 fail closed，錢算術未改 |

其他：`session/character-session.ts` = A；`adapters/local/*` = A（確定性後端）；
`ports.ts` = A（接縫面）。

## Flag 總表

全部定義於 `world-state.ts`、預設關、隨快照持久化。

| Flag | 管什麼 | 分類 |
|---|---|---|
| `strictStructured`（CLI `--strict-structured`） | 結構化狀態／授權唯一入口；舊文字 detector 降為 shadow telemetry | A／研究 profile |
| `relationshipFallback` | 關係種子＋夜間自我整併＋心事自改＋執念再生 | B |
| `subjectiveNaming` | 相識分寸／主觀稱名 | A/B |
| `emergentProduction` | 劇本產出＋首演 | A/D |
| `heartsCanFade` | 情分會淡 | C |
| `beatPicksWant` | 執念自揀 | B |
| `quietPresence` | 惰息存在 | C |

已畢業為常開（無 flag）：叩門夜訪、借賒有據、尋人有路。
環境變數旋鈕：`SEASON_BED_CAP`。

## 「確定性核心」主張的三個威脅

1. **want resolution 仍是 LLM 裁決。** `scene-loop.ts` 仍呼叫
   `judgeWantResolved` 決定執念是否了結。這是留痕的結構化 verdict，但不是確定性計算。
   新 testbed 仍需選擇宣告式完成＋確定性判準，或明列為 LLM-judged transition。
2. **物件 prose gate：STRICT 已緩解，legacy 未移除。** `strictStructured=true`
   時，世界只由 `objectEffects` 改變；缺席即無物理 mutation。舊中文正則仍執行，
   但只寫 `structuredMonitor.divergences`，不再擋提案或觸發三改。flag off 保留原行為，
   因此不能宣稱所有 profile 都已無散文 gate。
3. **場景／preset 語意：engine STRICT 主路徑已緩解，跨包尚未清零。**
   stage／temple 改讀 capability tags；bond／相許、welcome disposition、
   public recognizability、renown 與 performance object state 也有宣告式欄位。
   盤點同時確認 `foodScenesOf` 早已讀 catalog 的 explicit `sceneName`，不是名稱 regex。
   但 runner 與 `web/lib/chain` 的自由文字決策站仍只盤點未改，role taxonomy／salary class
   也仍是跨包 schema 缺口。

金流仍由 `season-economy`＋`@endless-story/economy` 的結構化命令與 bigint
算術處理；本次只更換 condition／boost 的語意 gate，沒有改任何算術。

## Shadow telemetry 的解讀

- `evaluatedBeats`：送進 physical validator 的 proposal 數；replan retry 也算一個 proposal。
- `divergences`：同一 tick／domain／kind／subject 的 legacy vs structured 不一致；
  STRICT 的 legacy detector 只量測，不具 authority。
- `warnings`：STRICT seed／舊快照缺少宣告欄位，例如 scene capability、
  want subject、resolution cause、edge disposition。
- 物件 prose/state divergence rate 的報告定義為：
  `domain === 'object'` 的 divergence 事件數 ÷ `evaluatedBeats`。

## 死碼清理清單（本任務未處理）

- `actor-fatigue.ts`＋`want-core.pickSalient`
- `spatial-routing.ts`
- `box-office.ts`
- `TICK_ACTOR_FATIGUE`

## 後續動作

1. 以實際 STRICT run 報告 divergence、warning、`[跳拍]`，不要把 warning 當成成功率。
2. 補完 runner／web 的 typed identity、resource、plan、role taxonomy；engine 不反向依賴 web。
3. 決定 want resolution 的研究語義並留可消融的兩臂。
4. 另案處置死碼；不要和 prose-regex ablation 混成一個 commit。
