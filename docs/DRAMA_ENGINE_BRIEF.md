# Drama Engine — 獨立開發任務指引（Session Handoff）

> **這份是給「另一個 session」的任務簡報。** 目標:在隔離環境裡先把
> **Desire/Resource Drama Engine 的「純離線確定性核心 + 模擬器」**做出來、調好,
> 之後再移植回 Endless Story 主 repo。**這個 session 不碰產品其餘部分。**
>
> 開工前請把**完整的 design spec**(《Endless Story — Desire/Resource Drama Engine》)
> 一起貼進新 session —— 本檔提供的是 spec 之外的**前因後果、已鎖定決策、移植結構、退出條件**。
> spec 與本檔衝突時,以本檔的「已鎖定決策」為準(那是針對 Stage 1 收斂過的)。

---

## 0. 你是誰 / 這個 session 做什麼

你是一個**專注、隔離**的開發 session,只做一件事:

1. 寫出 spec §2 的 3 個純資料型別 + §3 的 `applyTick` 確定性 transition(定點數整數運算)。
2. 寫一個**純 TypeScript、零外部依賴**的離線模擬器,驗證「不坍縮的戲劇」確實湧現。
3. 跑通 spec §9 的 Stage 1 Step 0–2,附單元測試與失敗模式斷言。

**不要**:接 LLM、接鏈、接現有產品的任何 package、做 UI。那些是之後在主 session 做的整合。

---

## 1. 前因後果(為什麼做這個)

**專案**:Endless Story / 「住在 Walrus 上的梨園」—— Sui Move + Next.js monorepo,
民初上海戲園敘事平台。角色 NFT 在 Sui 上、記憶在 Walrus(SEAL 加密)、LLM 驅動 POV 敘事。
已參加 SuiOverflow(Walrus 賽道)拿**第二名**,評語「題目有趣」。

**問題**:現有引擎已做到「C 級自治」(角色會 perceive→plan→decide→act→move→reflect、
有自治 tick loop),但**敘事會坍縮(collapse)**:角色的動機是 LLM 自由生成的字串目標
(`longTermGoal`),**沒有稀缺、沒有零和、沒有機械性張力** → 故事走平 / 鬼打牆 / 各自滿足。

**戰略決定**(已與主 session 拍板):從第二名到「實際成績」(可投資 / 可發表 / 下次第一)的
距離**不是更多功能,是敘事核心的深度**。差異化來自一個鋒利、可驗證的核心:

> **戲劇不來自慾望本身,來自「慾望投射到有限、守恆的資源上、無法同時被滿足」的那條邊。**
> **LLM proposes(提案 + 敘述)→ 確定性 resource layer disposes(驗證 + 結算狀態)。**
> 確定性那層**可承諾、可上鏈驗證**(任何人 re-run `applyTick` → 重現一模一樣的 tension)。

這正是 Walrus/Sui 賽道最硬的故事(比「我們把 POV 存上鏈」強十倍),也是能寫進 workshop
paper 的真貢獻:**定點數約束下、可驗證、確定性、可承諾的 affective-state 演化**。

**為什麼先做純離線模擬器(而不是直接塞進產品)**:
- 校準要跑**幾千~幾萬個 beat**(找 flatline/runaway/oscillation、調 ALPHA/GAMMA)。
  現有產品 loop **一個 tick 要 ~200 秒還會 429**;純 TS 模擬器**毫秒級跑上萬 tick**。
- spec 明令「single-scene tuning = overfit,**run >1 scenario**」——只有快速離線迴圈做得到。
- 這個模擬器**就是 Stage 2 論文 eval 的種子**,也是「re-run 驗證」demo beat 的來源。
  **一份程式碼,三個用途(校準 / 產品 / 論文)。**

**這不是丟掉現有工作**:現有引擎是「LLM proposes」層;這個 drama engine 是「deterministic
disposes」層。模擬器驗證後,主 session 才把它接進現有 tick loop(現有的 decide/move 變成
「提出資源 reallocation 的 Action」)。**是深化,不是重寫。**

---

## 2. Spec 的承重點(完整版以貼進來的 spec 為準)

- **3 primitives**(純資料,無 I/O / 無 LLM / 無鏈):`Desire`(weight/satisfaction/baseline/
  volatility/`draws_from`)、`Resource`(capacity + allocations,**守恆不變式 sum(alloc) ≤ capacity**)、
  `Action`(reallocate resources + cost)。
- **`draws_from` 取代舊的 `threatened_by`/`fulfilled_by` magic-string**:慾望宣告它從哪些資源汲取
  滿足;`satisfaction` 是**當前配置的確定性函數**,不是 LLM 判斷、不是字串查表。
- **`applyTick(world, actions) → world`**(純函數,定點數):
  1. **RESOURCE PHASE**:依 canonical order 驗證 + 套用 transfers;違反守恆 / 預算不足 → reject。
  2. **SATISFACTION PHASE**:`target = SCALE * held / want`;非對稱鬆弛(`ALPHA_DOWN > ALPHA_UP`,
     loss aversion);habituation `s += GAMMA*(baseline - s)/SCALE`。
  3. **TENSION**(derived,不存):`tension = weight * (SCALE - s) / SCALE`。
- **必守性質(這些是規格不是建議)**:Bounded(分數逼近,**不需 clamp**)、Loss aversion
  (下跌快過上升 → 下行螺旋 = 好戲)、Habituation(滿足會衰退、防成功平線)、**Determinism
  (同 input → 同 output,逐位元組一致 = 上鏈可驗證的保證)**。
- **衝突是湧現的,不要寫 conflict matrix**:跨 agent(兩慾望抽同一 capacity-1 資源 → 零和)+
  agent 內(兩慾望搶自己有限的 action budget → trade-off 由「預算有限」**導出**,從不宣告)。
  柳生春那一刻活在 agent 內的預算競爭裡。
- **LLM 邊界(Step 3 才做,本 session 不碰)**:LLM **不**輸出 satisfaction 數值、不算 delta。
  乾淨 transfer 全確定性;模糊社交事件 → LLM 輸出**離散、可稽核**的分類
  `{resource_id, direction, level:1|2|3, justify_refs:[...]}`,離散 level 映射到小幅固定 nudge。

---

## 3. 已鎖定的決策(解掉 spec §11 會擋住 Stage 1 的開放問題)

> 主 session 已替 Stage 1 拍板,直接照做,別再糾結:

1. **action budget 補充** = **固定每 tick refill**(最簡單、可校準)。
2. **goal persistence** = **margin-based 切換**(挑戰者 tension 要超過在位者一個 margin 才換目標),
   放在 **Planner**、**不進**純 transition function。先用這個防 oscillation。
3. **tick driver** = **外部腳本 driver**(Stage 1 純離線,LLM 事件留到 Step 3)。
4. **定點數** = `SCALE = 1_000_000`;所有 `[0..SCALE]` 值是 **u64**;中間值用 **u128** 防溢位;
   除以 SCALE 顯式 rounding。**全程無浮點**(Move 沒有 float,要逐位元組對得上)。
5. **canonical action order** = 明確定義(例:依 `(tick, actor, index)` 排序),確保決定性。

---

## 4. 本 session 的建置序列(Stage 1,Step 0–2)

**Step 0 — 純核心**
- 3 個型別 + `applyTick` 純函數。單元測試:
  - **守恆**:任何 action 後 `sum(allocations) ≤ capacity`;違規的 action 被 reject 而非破壞狀態。
  - **bounded**:`s` 永遠 ∈ `[0..SCALE]`,**不靠 clamp**(分數逼近保證)。
  - **決定性**:同 `(world, actions)` → 同 `world`,跑兩次逐欄位相等。

**Step 1 — 最小但有戲的場景**
- **2 agent + 1 個 capacity-1 資源**(孟雲屏 partnership)+ 腳本化 actions。
- **先寫死退出條件,再開始調參**:
  - contention 產生**可讀的升級**(loser 的 tension 尖峰 → 驅動一個反制 action)。
  - tension 隨配置翻轉(誰拿到 slot,誰的 target→SCALE,另一個→0)。
  - **三種失敗模式都不出現**:flatline / runaway / oscillation。
  - **跑 >1 scenario**(單場景調參 = overfit,reviewer/投資人聞得出來)。

**Step 2 — agent 內 trade-off(柳生春時刻)**
- 每 agent 加第二個慾望(`fame`)競爭有限的 `schedule`(per-agent 資源)。
- 把預算投進「搶壓軸」就餓死「陪孟雲屏排戲」的時間 → **trade-off 由預算有限導出**。
- 這個**湧現的**取捨時刻必須在模擬裡自己跑出來(不是腳本寫死)。

**完成判準(本 session 的 Definition of Done)**:Step 0–2 綠;>1 scenario;可讀升級;
柳生春時刻湧現;三失敗模式皆不出現;一份**校準後參數 + tension 曲線**的小 writeup(論文種子)。

---

## 5. 怎麼結構才好移植回主 repo

- 做成**一個獨立、零依賴的純 TS package**:`packages/drama/`(或在 scratch repo 裡同樣命名)。
  - **只**含:3 型別 + `applyTick` + 模擬器 driver + 場景 fixtures + 測試。
  - **絕不** import 主 repo 的 `web / runner / sdk / llm / memwal / shared`。保持可單獨複製貼入。
- `applyTick` 寫成**純函數 + 顯式定點數整數運算**,讓它**1:1 對應到 Move u128**——之後 Step 4
  的 on-chain resource ledger(Move resource type + 守恆 linear-type 不變式)能直接照搬同一套算術。
- 測試裡放一個 **golden vector**(寫死一組 world+actions 的預期 next world),這既是回歸測試、
  也是之後「鏈上 re-run 驗證」beat 的對照組。

**未來整合點(本 session 只需「設計相容」,不要實作)**:
- 主 repo 的 `runTickLoopAction`(`packages/web/src/lib/actions/tick-loop.ts`)是現成 tick loop;
  之後 `applyTick` 會插進去當每 tick 的確定性狀態轉移,現有 `decideCardPlay`/`decideMove` 會變成
  「提出 Action」。
- 主 repo 的 `commitment.move` + `sign-and-anchor` 是現成的上鏈承諾模式;drama resource ledger
  的 per-beat commitment 會沿用它。
- 主 repo 合約用 u64/u128、`SCALE`-style 定點數——你的算術要對得上。

---

## 6. Repo 規範(若你在 monorepo 內的另一個 worktree/branch 開發)

- pnpm workspace;每 package `tsc --noEmit` 要綠。
- **先開 branch 再 commit,絕不直接 commit main。**
- commit message 結尾固定:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 不新增散文件(handoff memo);設計文件放 `docs/` 可以(本檔就是)。
- 若在 scratch repo:保持 `packages/drama/` 是乾淨純 TS package,移植 = 複製目錄進來。

---

## 7. 明確不做(scope discipline)

- 不接 LLM(spec §5 的 propose/dispose 邊界是 Step 3,本 session 之後才做)。
- 不接鏈 / 不寫 Move(Step 4)。
- 不碰主 repo 其餘 package、不做 UI。
- **先只模型化「一個」爭用資源(孟雲屏 partnership)**,把引擎在它上面證明,再泛化。
  一個好的爭用資源 > 十個手寫的。
- positional desires(「我要比她紅」)、`weight` drift(角色弧)= **v2,本 session 不做**。

---

## 8. 回報 / 交接

做完 Step 0–2,把 `packages/drama/` + writeup 交回。主 session(在 Endless Story 主幹上)會:
(a) review 張力曲線與失敗模式斷言,(b) 把 pure module 移植進來,(c) Step 3 接 LLM 邊界、
Step 4 做 on-chain ledger + commitment（那次 redeploy 會順手把已備好的 gallery 合約 / N5b 一起上）。

> **主 session 狀態(給你參考,不用動)**:分支 `feat/runner-narrative-memwal`;C 級引擎、
> 自治 tick loop、world-loop CLI、動態出圖、設定集合約(已測未部署)皆已在 branch 上。
> 唯一敘事方向文件 = `docs/NARRATIVE_AGENTS.md`。
