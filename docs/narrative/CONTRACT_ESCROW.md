# 契約即託管（Contract-as-Escrow）— 對方 agent、真底斡旋、交付驗收釋放

> **狀態**：設計提案 · 2026-07-19。owner 認可後照 §6 分三階段落地（每階段一個 squash PR 到 dev）。
> **關係**：`CHARACTER_ECONOMY.md` 經濟鐵律（LLM 永不碰數字、收支守恆）與 `ENGINE_CORE.md`
> single-home 紀律在此全部沿用。多堂口 Stage 1（#127，各營生實體自有帳與發薪）是本設計的地基。
> **北極星檢查**：第 300 回還好看 —— 一紙契約從開價、討價還價、到交出真的產出物換錢，每一步
> 都是可被寫進章回的戲；而且對方是「一個帳上有真錢、立場明確的人」，不是一張寫死的答案表。

---

## 0. 目標（owner 原話拆解）

1. **對方是真的角色**：唱片行（申聲）、報館（申報）、影片社（華光）各由一個 agent 座席代表，
   **依自己堂口的財務狀況**（真實準備金、跑道、待付義務）判斷要不要讓步 —— 代表公司跟春雪社斡旋。
2. **錢與條件都能談**：還價不只「加條款」，也能「改銀錢」（預付加碼、分成調整），且對方知道自己**真正的底**。
3. **交付 → 驗收 → 釋放**：最終春雪社（或某個角色）**真的交出對應的產出物**（新戲、唱片、稿件），
   由契約方判斷通過與否；通過即釋放託管價值。
4. **從第一天就長成 Sui Move 合約的形狀**：off-chain 的契約狀態機與未來的 `contract_escrow.move`
   同構，日後直接交換（LocalEconomy → SuiEconomy 換 adapter，機制不重寫）。

---

## 1. 現況盤點（已有 / 空心 / 缺）

| 塊 | 現況 | 位置 |
|---|---|---|
| **託管本體** | ✅ 已是真託管：`offerContract` 即 `reserveFunds` 鎖錢；signed→`payoutReserved` 原子分帳；rejected/expired→`releaseFunds` 退回 | `packages/economy/src/contract.ts` |
| **狀態機** | ✅ `offered → signed/rejected/expired → settled`；簽序、搭檔欄、逾期退款全有 | 同上（`ContractStatus`） |
| **還價通道** | ✅ 通了、❌ 空心：`contract_counter` → `pendingCounter` → 隔夜 `resolveCounter`；但答案來自**寫死的授權政策**（`negotiations[id].acceptDemandsMatching` 子字串比對），對方從不看帳 | `season-economy.ts` settle §0.5 |
| **還價能改什麼** | ❌ 只能「加條款＋順延限期」，**不能改錢**（accept 路徑不動 total/splits/escrow） | `contract.ts` `resolveCounter` |
| **對方的帳** | ✅ Stage 1 之後每個堂口有真準備金、固定開銷、自己的發薪（#127） | `season-economy.ts` businesses |
| **產出物** | ✅ 劇本產出已進引擎（#123）：`Production` 確定性積功、razor、首演 | `engine/src/core/production.ts` |
| **交付驗收** | ❌ 完全沒有：現在「簽名即放款」，沒有「交出東西、驗過才放」 | — |
| **鏈上錨** | ✅ `commitment.move` 已能把「blob X（hash H）是 subject Y 的正典交付」錨上鏈 —— 交付物的現成上鏈形狀 | `contracts/.../commitment.move` |

> 先前實驗（agent-season 談判 probe、season-one casting discussion）驗過甲（機械閘）與乙（agent 對談）
> 兩型；本設計把兩者收成同一個座席：**數字由機械閘決定，話由 agent 說**。

---

## 2. 目標形狀：契約物件（TS ↔ Move 同構）

契約 = 一個託管物。欄位以「將來能一比一搬進 Move struct」為準：

```
EconomicContract（off-chain, packages/economy）      contract_escrow.move（未來, Stage C）
──────────────────────────────────────────           ─────────────────────────────────────
id / label                                           UID / label: String
proposerAccountId（出資堂口）                          proposer: address（堂口 treasury cap 持有者）
total + escrow（reserved on proposer）                escrow: Balance<CURRENCY>（鎖在物件裡）
splits[{beneficiary, amount, memo}]                  splits: vector<Split>
requiredSignerIds / partnerSlot / signedBy           signers / partner_slot / signed
terms[]（白紙黑字條款）                                terms_hash: vector<u8>（條款 hash，全文在 Walrus）
deadlineDay                                          deadline_ms
status: offered→signed→delivered→settled             status: u8（同序）
        ↘ rejected/expired（退款）                            ↘ refunded
deliverableSpec（§4，驗收標準）                        spec_hash + 機械條件欄
deliverable?（交付物引用）                             commitment_id: ID（→ commitment.move 物件）
pendingCounter / negotiatorIds                       pending_counter / negotiators
```

**關鍵新語意**：帶 `deliverableSpec` 的契約，**簽成不再直接放款** —— 簽成 = 「約成立、錢鎖著、開工」；
放款移到**驗收通過**那一刻。不帶 spec 的契約（今日的 anchun 型）行為完全不變（向後相容）。

新增終態轉移：
```
signed ──submit_deliverable──▶ delivered ──驗收 pass──▶ settled（payoutReserved 分帳）
                                  │  驗收 fail（附理由）
                                  ▼
                               signed（限期內可再交）──限期過──▶ expired（releaseFunds 退回出資方）
```

---

## 3. 對方座席（EstablishmentAgent）：數字機械閘 × 話語 agent

### 3.1 結構化還價（先修通道，才有東西可判）

`contract_counter` 指令加一個**自標欄位**（沿用 ActionKind 自標鐵律 —— 引擎路由靠標記、永不 regex 猜 prose）：

```ts
{ action: 'contract_counter', contractId, demand: string,
  askYuan?: number }   // 有值 = 這句還價要改錢（demand 同時寫明白改哪一路）
```

- `askYuan` 缺省 → 條件型還價（今日行為）。
- `askYuan` 有值 → 銀錢型還價：接受時 total 加碼、還價人那一路 split 加碼、**escrow 補鎖差額**
  （`reserveFunds` delta）；出資堂口帳上**補不出差額 → 機械必拒**。

### 3.2 決策順序（誰說了算）

```
① 機械閘（確定性，唯一真相）：
   銀錢型 → 出資堂口 available 夠不夠補鎖差額？補完是否仍在底線之上
            （floor = dailyFixedCost × N 日跑道，frame 可調，預設 3）？
            不夠/破底 → 必拒，agent 無權推翻。
② agent 座席（實錄才有，選配）：
   在機械閘允許的空間裡決定接受/拒絕/口吻 —— 拿的是堂口的「帳面視圖」
   （available/reserved/跑道/待付帳單/在途契約）＋ frame 授權的「立場」（stance 一段文字）。
③ 授權政策（fallback）：無 agent（排演）時沿用 acceptDemandsMatching；
   銀錢型在排演下只走機械閘（可測、可重放）。
```

**鐵律不破**：LLM permanently 不碰數字 —— 它只在「付得起且不破底」的空間裡選擇與措辭；
所有金額變動都出自機械閘算好的結構化結果。

### 3.3 接縫落點（不破 two-adapters 紀律）

- `SceneAgentPort` 加**選配**方法：
  `negotiateCounter?(input: NegotiateCounterInput): Promise<NegotiateCounterReply | null>`
  `judgeDeliverable?(input: JudgeDeliverableInput): Promise<JudgeDeliverableReply | null>`（§4）
  Fake 不實作 → 排演路徑全確定性；RunnerSceneAgent 實作（cheap tier、fail-safe 到「拒」）。
- **settle 保持純函數**：LLM 呼叫發生在 tick 的 day-end 相位（7.45，settle 之前）。tick 先把
  每筆 `pendingCounter` 的 agent 判決算好，經 `SettleSeasonDayRequest.counterVerdicts?` 餵進
  `settleSeasonDay`；settle 內部只做「驗證判決是否過機械閘 → 套用」。無判決 → fallback ③。
- frame 每個 business 加 `stance?: string`（立場：這家公司在乎什麼、讓步邏輯、口風），
  只給 agent 讀，機械閘不看。

---

## 4. 交付 → 驗收 → 釋放

### 4.1 deliverableSpec（驗收標準 = 機械 razor，可稽核）

```ts
deliverableSpec?: {
  kind: 'play' | 'recording' | 'film' | 'article' | 'custom';
  note: string;                       // 白話寫給角色看的「要交什麼」
  // 機械條件（v1 全部確定性，對齊 production.ts 的可稽核累加器）：
  requiresPremiere?: boolean;         // 新戲須已首演
  minTotalEffort?: number;            // 積功門檻
  minScriptFragments?: number;        // 戲文段數門檻
  minContributors?: number;           // 真協作人數門檻
}
```

v1 **驗收 = 確定性 razor**（放的是真錢，判準必須可稽核、可重放）。agent 的
`judgeDeliverable` 只負責**驗收詞**（通過/退件的公文口吻、指名缺什麼）—— 不推翻機械判定。
v2（另議）：spec 可加「主觀品質條款」，屆時 agent 判決計入 —— 但那是把錢交給 LLM 的一步，gate-after。

### 4.2 交付指令與隔夜驗收（沿用還價的節奏）

- 新 economyCommand：`{ action: 'submit_deliverable', contractId }` —— 人須在契約紙前（同簽約規矩）；
  引擎自動把世界裡對應的產出物（`w.production` 快照 / 未來的稿件物件）附為 `deliverable` 引用。
- **隔夜回話**：今日交付 → 次晨對方回驗收結果（percept，正典事件）。通過 → `payoutReserved`
  分帳、契約 settled、產出物 timeline 記「售出/交付」；退件 → 附理由（機械 razor 缺哪條），
  限期內可補工再交。
- 限期語意擴充：`signed` 且逾期未交付 → `expired`，escrow 退回出資方，當事人收 §契約限期
  作廢 percept（#126 已建的通道直接複用）。

### 4.3 產出物從哪來

第一個接上的就是 #123 的 `Production`：申聲唱片行開「灌一張唱片」的約 → spec `kind:'recording',
requiresPremiere:true, minTotalEffort:6` → 班子排戲攢積功 → 首演 → 柳安春到紙前 `submit_deliverable`
→ 隔夜放款。**同一條 razor 既判首演也判驗收**，機制只寫一次。

---

## 5. Stage C：`contract_escrow.move`（形狀對齊，不搶跑）

- struct 見 §2 右欄；escrow 用 `Balance<CURRENCY>`（`currency.move` 既有）鎖進物件。
- **交付物直接複用 `commitment.move`**：off-chain 產出物 → hash → Walrus blob → `Commitment`
  物件；`submit_deliverable` 上鏈版 = 把 `commitment_id` 寫進 escrow 物件。驗收 entry 由
  counterparty cap 簽（各堂口一個 cap，對齊 saga `StorytellerCap` 授權模式），通過即
  `Balance` 分帳轉出。
- off-chain TS 狀態機與 Move entry 一比一（offer/sign/fill_partner/counter/resolve_counter/
  submit_deliverable/accept/expire）→ 屆時只換 EconomyPort adapter，引擎與 prompt 全不動。
- 跨 saga 對手（唱片行真的是「另一個 saga 的金庫」）掛在這一階段之後：帳先同構，再談跨界。

---

## 6. 分階段 PR 計畫

| 階段 | 內容 | 驗證閘 |
|---|---|---|
| **A（單 PR）** | 結構化還價 `askYuan` ＋ 機械閘（真底判定＋補鎖 escrow）＋ `negotiateCounter` 座席（fake 缺席、runner 實作）＋ `counterVerdicts` 注入 settle ＋ frame `stance` | 引擎測試全綠；新測：銀錢還價「付得起→補鎖接受」「破底→必拒」「排演無 agent 走機械閘」；快照 byte-for-byte |
| **B（單 PR）** | `deliverableSpec` ＋ `submit_deliverable` ＋ 隔夜驗收（razor 判定、agent 寫驗收詞）＋ 簽成不放款/驗收放款 ＋ 逾期未交退款 ＋ 接 `Production` | 新測：全生命週期 offer→簽→排戲→交付→放款；退件補交；逾期退款；無 spec 契約行為不變 |
| **C（後續）** | `contract_escrow.move` ＋ SDK bindings ＋ SuiEconomy adapter | Move 測試；lab 直連測試網互換 |

每階段照本季慣例：engine tests ＋ 排演確定性驗證 ＋ type-check 全綠 → squash merge dev。

---

## 7. 不變式（全程守住）

1. **LLM 永不碰數字**：金額變動只出自機械閘；agent 選擇與措辭，不算帳。
2. **收支守恆**：每一筆 escrow 補鎖/釋放/分帳都是 ledger 交易，audit 逐日成立。
3. **settle 純函數**：async agent 判決在 tick 相位算好注入，settle 可重放。
4. **一個 agent port、兩個 adapter**：新座席是 SceneAgentPort 選配方法，排演零 LLM 全綠。
5. **percept 是事實不是指令**：對方回話（還價答覆、驗收公文）以次晨正典事件落地。
6. **向後相容**：無 `askYuan`、無 `deliverableSpec`、無 `stance` 的舊 frame/快照行為 bit 不變。

## 8. 開放問題（不擋 A/B）

- 多輪討價還價（現制一約一時一 demand、隔夜一答）要不要放寬？建議先觀察實錄再議。
- 搭檔欄與交付責任的關係（誰有資格 `submit_deliverable`？現案：requiredSigners ∪ partner）。
- 驗收主觀條款（v2）與「品質分級改變分帳比例」—— gate-after，須 owner 另批。
