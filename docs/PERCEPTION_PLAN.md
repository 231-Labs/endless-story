# 角色認知重構：補上缺失的「感知（Perceive）」步驟

> **狀態**：plan · 2026-06-15 · 實作計畫，可交給新的 Claude Code session 迭代。
> **北極星檔**：[NARRATIVE_AGENTS.md](./NARRATIVE_AGENTS.md)（敘事架構唯一真相）。本檔是其
> `perceive→plan→act→reflect` 迴圈裡 **perceive** 步驟的具體補完計畫；與北極星檔衝突時以北極星檔為準。

> **進度（2026-06-16，分支 `claude/perception-step1`，off committed Step 0）**
> - ✅ **防全知守門**：`situation-core.ts` `assertPerceivable` —— 持有預設私密、僅同場或 public 才揭露；
>   off-scene 暗持/未參演結算/跨場事件 fail-closed throw。+5 測試。
> - ✅ **Step 1（PLAN 感知）**：`tick-phases/perceive-core.ts`（純組裝+scope，+8 測試）+ `perceive.ts`
>   （鏈上抓取+跨 tick cursor：resolved-Δ、co-present-Δ）+ tick-loop 在 PLAN 前組 Situation 注入
>   + tick 尾 stash resolved。runner/web `plan.ts` 加 `situation` 段（置記憶前，框「只可詮釋不可改寫」）。
>   **旗標 `ES_SITUATION_PERCEIVE`（env=1 或 `/api/tick` body `situationPerceive:true`），預設 OFF=零行為改動。**
>   runner+web type-check 乾淨；20/20 純測試綠。
> - ⬜ **未做**：MOVE 直接注入（v1 靠 planHint 間接傳遞）、Step 2（directorBeat 寫入路徑）、Step 3（tick 重排）、
>   Step 4（記憶轉詮釋+importance 調校）、LLM liveness harness。
>
> **驗收實驗（同一 saga A/B，需在正式環境跑）**：
> 1. 基線：`POST /api/tick {"situationPerceive": false}` 連跑 K tick（K≥5），記錄每人 `plans[].longTermGoal/dailyPlanHint`。
> 2. 處理：`POST /api/tick {"situationPerceive": true}` 連跑 K tick，記錄同欄位。
> 3. 指標：處理組的**計畫變更率**應顯著高於基線（不再 ×8 重複停滯）；且計畫應**引用剛結算的事件/同場者**
>    （抽查 PLAN 是否回應 `news.resolvedSinceLastSeen`）。看 SchedulerPanel / `/api/tick` 回傳的 `plans`。

---

## 0. 一句話

北極星檔規定的認知迴圈是 **perceive → plan → move → act → reflect**，但**程式裡沒有真正的 perceive 步驟**：`plan` 排在 tick 最前面，只吃「自我語意 recall + 既有計畫」，對這個 tick 的張力、事件、危機完全失明。所有反覆出現的症狀（計畫停滯、世界打轉、不知道導演危機、補丁越疊越多）都源於此。本計畫補上一個權威的 **Situation（處境）** 感知層，餵給所有決策 phase。

---

## 1. 核心原則：分離「客觀舞台（Situation）」與「主觀靈魂（Memory + 人格）」

> ⚠️ **這是最重要的原則，不可違反。** 記憶（MemWal）是這個專案的賣點與靈魂，**不可被弱化或抹除**。

記憶目前被迫做**兩件事**，其中一件做得很爛：

- **Job A — 感知客觀事實**（「現在發生什麼：誰在場、我在哪場事件、有什麼危機」）。
  記憶做這件事**很爛**：模糊語意 recall、被 429 砍、被 importance 排序淹沒（plan=8 永遠壓過 observation=4）。
  → **這件事改由 Situation 權威提供**（鏈上讀 + 本 tick 計算，**不靠 recall**）。
- **Job B — 以「這個人」的身分詮釋並決策**（「以我的過往、傷痕、慾望，我怎麼讀這個局、出什麼牌」）。
  記憶做這件事**無可取代**——這是讓兩個角色面對**同一個處境**做出**不同**選擇的關鍵。
  → **這件事完全保留，而且強化。**

**結論：記憶的重要度不降反升。** 它不再浪費在重建基本事實上，而是專注在「詮釋與選擇」——也就是 MemWal 的價值所在。
**驗收級的故事**：同一場「百代逼宮」，沈雪笙與江聞鶴因為各自的記憶與人格，做出不同的出牌與計畫。

### 明確的非目標（Non-goals）

- **不**移除或弱化記憶 recall（`recallForCharacter` / 三因子排序留著）。
- **不**動 MemWal 的儲存 / SEAL 加密 / Walrus anchor。
- **不**抹平人格：role、tags、relationshipHints、各自的記憶全部保留並照常餵入決策。
- Situation 只承載**客觀事實**；**主觀詮釋永遠來自該角色的記憶 + 人格**。

---

## 2. 現況（測繪確認，給接手者對照）

Tick 順序（`packages/web/src/lib/actions/tick-loop.ts` `runTickLoopAction`）：

```
ADVANCE → ① PLAN → ② MOVE → DRAMA(算 dramaHints) → 開事件(spine) → SOCIAL
→ ASK → GIVE → BOND → SETTLE → ③ ACT → ④ POV → CUT → ENCOUNTER → ⑤ REFLECT → ⑥ GAZETTE
```

每個決策點目前吃到什麼（來源）：

| Phase | 函式 | 目前輸入 | 缺什麼 |
|---|---|---|---|
| ① PLAN | `plan.ts` `updatePlan` | recall(6) + 既有計畫 + rosterContext | **dramaHints、事件、Δ、危機全沒有；且排在 DRAMA 前** |
| ② MOVE | `tick-phases/move.ts` `decideMove` | planHint + 場景選項(含在場者) | **dramaHints、事件、危機沒有** |
| DRAMA | `chain/drama.ts` | 鏈上資源帳本 | （算出 `dramaHints`，但只餵 SOCIAL/ACT/POV）|
| SOCIAL | `tick-phases/social.ts` `decideSocialAction` | planHint + recent(4) + relationshipHints(5) + dramaHint + 同場者 | 沒有「剛收場了什麼、誰贏」、沒有導演危機 |
| ③ ACT | `tick-phases/act.ts` → `character-turn.ts` `decideCardPlay` | 事件(牌庫) + recent(4) + relationshipHints + planHint + dramaHint + rosterContext | 沒有導演危機、沒有跨場 Δ |
| ④ POV | `chain/pov-core.ts` `runPovForCharacter` | triggerNarrative + recent(4)+life(2) + relationshipHints + planHint + dramaHint + rosterContext + sceneBeats | 沒有導演危機、跨場 Δ 有限 |

共用層（已存在，是 Situation 的雛形，約 80%）：
- `tick-phases/support.ts`：`TickMemoryContext`（per-tick 快取 `plan()/recent()/relationshipHints()`）、`buildRosterContextById`（誰在場簡報）。
- `dramaHints`（DRAMA phase 算）：每人對爭用資源的張力句。

確認的斷點：
- **導演 capability 是寫了沒人讀**：`director::open_storylet` / `advance_phase` / `attribute_pressure` / `character_call` 都只 emit 軟事件，**沒有任何 phase 讀回**。唯一進認知的是 `relationship_seed`（經 `relationships.ts` → on-chain graph → `relationshipHints`）。
- 跨 tick 連續性只有：MemWal 記憶（含 plan=8 / reflection=8）、鏈上狀態、關係種子、process-local 快取。

---

## 3. 目標設計：`Situation`（純客觀事實物件）

```ts
// packages/web/src/lib/chain/situation-core.ts （新檔，純函式 + 型別，node-clean）
export interface Situation {
  self: {
    id: string; name: string; role: string;
    standingGoal: string | null;          // 既有計畫，當「明確欄位」帶入，不再混進 recall 競爭排序
    vitality?: number; solvent?: boolean;  // 生計/體力（若有）
  };
  place: {
    sceneId: string; sceneName: string;
    coPresent: { id: string; name: string; role: string }[];
  };
  stakes: {
    contested: { resourceId: string; label: string; heldBy: string[]; myAche: number }[];
    openEvent?: { eventId: string; label: string; cast: string[] };
  };
  news: {                                  // ★ 目前完全缺失的「Δ / 世界發生什麼」
    resolvedSinceLastSeen: { eventId: string; label: string; winner: string | null; stake: string }[];
    arrivals: string[]; departures: string[];
    directorBeat?: { text: string; phase?: string };  // ★ 一等公民危機，取代軟 storylet
  };
}
```

組裝原則：
- **客觀事實**從鏈上讀 + 本 tick 已算的東西（dramaHints、剛 resolve 的事件、roster Δ）。**不從 recall 重建。**
- 純邏輯（合併、排序、Δ 計算、`Situation` 組裝）放 `situation-core.ts`，**可單測**；鏈上抓取放薄薄的 `situation.ts`。

每個決策 LLM 的輸入 = **Situation（客觀）** + **該角色 recall 的記憶（主觀）** + **人格（role/tags/relationshipHints）**。

---

## 4. 漸進遷移（每步可獨立上線 + 旗標保護 + 解耦測試）

> 原則：每一步都 flag-gate（env / input 旗標），預設沿用舊行為，驗證後才打開；純邏輯一律 `node --test --experimental-strip-types` 解耦測試。

### Step 0 — 抽出 `buildSituation`（不改任何行為）
- **檔案**：新增 `chain/situation-core.ts`（型別 + 純組裝 `assembleSituation(parts): Situation`）、`chain/situation.ts`（薄抓取 `buildSituation(client, sagaId, charId, tickState): Promise<Situation>`，重用現有 reads）。
- **用現成資料**：rosterContext、dramaHints、open event（`reconcileOpenFromChain` / `listBudgetEvents`）、剛 resolve 的事件（本 tick spine resolves / `listResolvedBudgetEvents` Δ）、standingGoal（`memoryContext.plan`）。
- **測試**：`situation-core.test.ts` — 給定 parts，驗證 contested 排序、Δ 計算、coPresent 過濾、directorBeat 帶入。
- **驗收**：`buildSituation` 回傳正確物件；tick 行為**不變**（還沒接進任何 phase）。

### Step 1 — 把 Situation 餵給 PLAN + MOVE（解決「意圖失明」）★最高價值
- **檔案**：`plan.ts`、`tick-phases/move.ts`、`tick-loop.ts`（旗標 `ES_SITUATION_PERCEIVE`）。
- **改動**：
  - PLAN 的 prompt 新增「當下處境」段（Situation 的 place/stakes/news），並把 `standingGoal` 當**明確欄位**帶入（不再只靠 recall 撈回舊計畫——根除自我複製）。
  - MOVE 的 `decideMove` 也吃 Situation（它現在連 dramaHints 都沒有）。
  - **記憶照舊餵入**（recall 不動）——只是現在角色「先知道發生什麼」，再用記憶詮釋。
- **測試**：sim/解耦——同一 Situation + 不同 standingGoal/記憶 → 計畫不同；有 `news.resolvedSinceLastSeen` 時計畫會回應（不再 ×8 重複）。
- **驗收**：跑 live tick，看角色計畫在「某事件收場 / 有人到場」後**一個 tick 內**改變；柳生春不再連續卡同一計畫。

### Step 2 — 導演危機變一等公民，取代軟 storylet（解決「不知道逼宮」）
- **檔案**：世界狀態寫入點（新的 director capability 或 saga 上一個 `directorBeat` 欄位 / 一條高 importance 的 storyteller 記憶廣播）、`situation.ts`（讀進 `news.directorBeat`）、導演台 UI/action。
- **改動**：新增「寫入當前 beat/危機」的導演能力（**真的會被讀**），`buildSituation` 把它放進 `news.directorBeat` → 所有 phase 感知得到。保留 `inject_dream` 作為「寫進單一角色記憶」的精準工具。
- **測試**：注入一個危機 → 下一 tick 角色的 plan/POV 引用它。
- **驗收**：導演下「百代逼宮」→ 角色認知跟上、出牌回應。

### Step 3 — 重排 tick，讓最小感知在 PLAN 之前
- **檔案**：`tick-loop.ts`。
- **改動**：把「算 Δ + dramaHints（或其輕量版）」移到 PLAN 之前，或讓 PLAN 吃「上一 tick 收尾後的 Situation」。注意 DRAMA 目前依賴鏈上帳本讀取——確認順序調整不破壞 spine。
- **驗收**：PLAN 拿到的 Situation 反映本 tick 開場狀態；無回歸。

### Step 4 —（重新定義）強化記憶在「詮釋/決策」的角色，只停用「用 recall 重建客觀事實」
- **檔案**：`character-turn.ts`、`pov-core.ts`、recall importance 調校（`memory-tags.ts`）。
- **改動**：
  - 客觀事實一律走 Situation；recall 的 query 改成偏「詮釋這個處境」（情緒、過往類似經歷、與在場者的恩怨），**不再**用 recall 去問「發生什麼」。
  - 調 importance：讓**新的相關記憶**不再被 plan=8 永遠壓過（例如把 plan 從「記憶」抽出成 Situation 欄位後，recall 池就以真正的經歷為主）。
  - **明確驗收 MemWal 賣點**：同一 Situation、兩個不同記憶的角色 → 不同出牌/計畫/POV 語氣。
- **驗收**：解耦 sim——固定 Situation，換記憶集，決策有可觀察差異；live 上看到「同事件、不同靈魂、不同反應」。

---

## 5. 為什麼這會**降**複雜度（回應「一直 patch 複雜度變高」）

- 現況：每個 phase 各自拉片面世界觀 → 複雜度 **O(phase × 來源)**，每個格子都可能拼錯、要各自補（gravity pin、janitor、reconcile、429 都是這類格子）。
- 之後：**一次組裝 Situation，處處消費** → **O(來源) 組裝 + O(phase) 消費**。加 phase 幾乎零成本；「某 phase 看到的世界是錯的」這類 bug 在結構上消失。

---

## 6. 測試策略

- 純函式（`situation-core.ts` 組裝/Δ/排序）→ `node --test --experimental-strip-types`，比照 `spine-core.test.ts`。
- 「不同記憶 → 不同決策」的 sim harness（可放 `experiments/novel-lab/` 或 web 解耦測試），固定 Situation、換記憶集，斷言決策差異——這同時是 MemWal 賣點的迴歸測試。
- 每步 flag-gate，可隨時關回舊行為。

---

## 7. 建議起手式

**Step 0 + Step 1**：用全部現成資料，風險最低，但直接打中最痛的「意圖失明 / 計畫停滯」，且能驗證方向對不對再往下走。記憶在這兩步**完全不動**——只是角色終於「先看見世界」，再用自己的記憶去讀它。

---

## 8. 為什麼之前那麼多解耦測試沒抓到這個問題（給接手者的方法論教訓）

我們的解耦測試**沒寫錯，是高度不對**。這類 bug（認知脫節、世界打轉）屬於 **整合/wiring** 與 **跨 tick 湧現行為**，而我們的測試是 **單發純函式**。具體：

1. **單元測試驗的是「給定輸入 X → 產出 Y」，抓不到「正式環境裡 X 根本是錯的東西」。** `updatePlan` 的測試會親手餵它 `recalledMemories + currentPlan`，輸出合理就過——但正式管線**從不把當下處境放進 X**。測試自己造了豐富的輸入，所以結構上看不到真實 wiring 餵的是貧瘠輸入。每個 phase 皆然：手搖時齒輪都對，但測不到齒輪根本沒接到對的軸。
2. **解耦紀律（純 core、不碰 chain/wiring）剛好把 bug 所在之處排除在測試外。** tick 順序、每個 phase 餵給 LLM 什麼、janitor vs spine 的競爭、導演軟訊號——全是非純函式，按設計沒有測試。我們把 component 測得很乾淨，代價是把**組裝風險**全推進無測試層；這週每個 bug 都是組裝 bug。
3. **novel-lab 的敘事 sim 給了反向的假信心。** 它們**親手餵豐富、策展過的處境**（`*-rich.md`）去測文筆上限，證明的是「好輸入→好文筆」。但正式失敗是「管線根本沒組出好輸入」。sim 從壞掉那步的**下游**起跑，看不到問題，還因為輸出好而讓我們誤以為系統沒事。
4. **真正的失敗是湧現的、跨 tick 的；純測試是單發的。** 計畫自我複製（8 tick）、gravity→聚集→釘死迴圈、資源永不易手——都是帶累積狀態的回饋迴圈。單一函式斷言看不到迴圈，得真的把迴圈跑起來才看得到停滯。
5. **我們測了「機制」，沒測「結果/liveness」。** 測了「contest 選對贏家」「spine 開/收」「gravity 收斂」全過；**沒人**斷言「N tick 後計畫有變嗎」「資源真的易手嗎」「角色去過 >1 個場景嗎」「不同記憶在同事件下決策不同嗎」。被違反的性質（**liveness、多樣性、感知回應性**）從沒被編碼成測試。

**教訓**：agent 世界裡，component 單元測試是必要但對「整合」與「湧現行為」全盲。必須補一個 **多 tick 模擬 harness，斷言「結果/liveness 性質」**。

### 要補的測試（與本重構一起做）

- **多 tick liveness 模擬**（真實或忠實假造的管線跑 N tick），斷言：
  - 計畫會回應事件而改變（不再 ×8 重複）；
  - 爭用資源**會易手**（世界會動，不打轉）；
  - 角色會**移動到 >1 個場景**；
  - 同一 Situation + 不同記憶 → **決策可觀察地不同**（這同時是 **MemWal 賣點的迴歸測試**）。
- **wiring 守門測試**：斷言每個決策 phase 實際收到的 context **包含 Situation**（用假 LLM 攔截 prompt，檢查欄位齊全）——直接擋住「某 phase 又失明」的回歸。
