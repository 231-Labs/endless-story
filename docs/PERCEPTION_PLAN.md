# 角色認知重構：補上缺失的「感知（Perceive）」步驟

> **狀態**：plan · 2026-06-15 · 實作計畫，可交給新的 Claude Code session 迭代。
> **北極星檔**：[NARRATIVE_AGENTS.md](./NARRATIVE_AGENTS.md)（敘事架構唯一真相）。本檔是其
> `perceive→plan→act→reflect` 迴圈裡 **perceive** 步驟的具體補完計畫；與北極星檔衝突時以北極星檔為準。

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
