# Endless Story — 機制白皮書 · 數學與實驗卷

> **定位**：本文件彙整 Endless Story 所有**可被公式講清楚的機制**與**離線學術驗證實驗**：
> 模型定義、推導、形式性質、校準參數、假說檢驗、可重現性保證。
> 系統架構與機制總覽見 `docs/mechanism-report.html`；各機制的工程設計細節見
> `docs/NARRATIVE_AGENTS.md`、`docs/CHARACTER_ECONOMY.md`、`docs/EVENT_LIFECYCLE.md`、
> `docs/CONTENT_PIPELINE.md`、`packages/drama/WRITEUP.md`。
> 本卷所有數值（2026-06-11）皆可由文中註明的指令逐位元組重現。

---

## §0 方法論

整個系統遵循三條紀律，本卷的每一節都是它們的實例：

1. **LLM proposes，deterministic layer disposes。** LLM 負責提案、措辭與意義（戲）；
   一切涉及守恆量的狀態轉移——資源配置、金錢、氣血——由**定點數純函數**結算（帳）。
   LLM 永不輸出數值增量；模糊判斷被離散化後通過硬守衛。
2. **單一真理純函數，先驗證後產品化。** 每個機制核心先做成零依賴純 TypeScript 模組
   （`packages/drama`、`packages/economy`），以確定性模擬器跑過不變式與假說檢驗，
   通過後產品與 Move 合約**移植同一份轉移函數，永不重寫**。
3. **逐位元組可重現。** 全部域值採 `bigint` 定點數（`SCALE = 10^6`，中間值 u128 範圍），
   無浮點；同輸入必得同輸出，與 Move u64/u128 算術 1:1 對應——這是「任何人可 re-run
   驗證」承諾的工程基礎（見 §7）。

---

## §1 抽角定價（Gacha Pricing）

### 1.1 骰子模型

每個角色有 4 個先天屬性軸：**外貌 / 筋骨 / 機敏 / 心性**。mint 票券時以 32-byte 隨機種子
經 `HKDF-SHA256` 對每軸做**域分離**後取值（實作：`packages/llm/src/seed/roll.ts`）：

$$x_i = \big(\text{u32}(\text{HKDF}(\text{seed}, \text{axis}_i)) \bmod 101\big) \in [0, 100]$$

關鍵性質：

- **單一軸為均勻分佈**，非鐘型：值 95 與值 50 出現機率相同（各 1/101）。
- **四軸獨立**（HKDF 域分離保證）。
- **四軸總和**（總戰力 ∈ [0, 400]）依 Irwin–Hall / 中央極限近似鐘型，集中於 200。
- **同種子必得同角色**（確定性 roll）——重骰可在後端零成本進行，是 §1.3 必應機制的前提。

> ⚠️ 若日後需「單軸亦呈鐘型」（極端值更稀有），須改為 k 次均勻取平均；屆時高門檻
> 將變為指數級稀有，§1.3 之期望值與定價須全部重算。本節公式假設每軸均勻。

### 1.2 命中機率與期望抽數

徵召可設每軸硬性門檻 $m_i$（$x_i \ge m_i$）。單軸均勻 ⇒ 該軸命中機率
$p_i = (101 - m_i)/101$；各軸獨立 ⇒ 一抽同時滿足全部門檻：

$$p = \prod_{i \in \text{required}} \frac{101 - m_i}{101}$$

命中服從幾何分佈，期望抽數：

$$E[\text{draws}] = \frac{1}{p}$$

### 1.3 必應定價

**單抽**付 `basePrice`，先天隨緣。**必應**由後端僅重骰廉價的骰子（不呼叫 LLM、不上鏈、
不生圖）直至達標，命中才生成 + mint，一次付清。其合理錨點為期望硬抽花費乘以 margin：

$$\text{bulkPrice} = \max\Big(\text{basePrice},\; \text{round}_{10}\big(\text{basePrice} \times E[\text{draws}] \times \text{margin}\big)\Big)$$

- `margin = 0.85`（專案預設）：必應較期望硬抽**略廉** → 目標明確者直接選必應，
  消除變異引致的負面體驗並平滑營收；單抽留給偏好低門票/波動者。
  `1.0` 為公道價；`1.3` 為便利溢價。
- clamp 下界：必應永不低於單抽。
- $E$ 隨門檻急遽變化 ⇒ **必應為 per-徵召值，不可全站固定**。

### 1.4 實例（春雪社 · 台柱花旦）

門檻 外貌 ≥ 86、心性 ≥ 76；`basePrice = 220`：

$$p = \tfrac{15}{101} \times \tfrac{25}{101} \approx 0.0368,\quad E \approx 27.2,\quad \text{bulkPrice} = \text{round}_{10}(220 \times 27.2 \times 0.85) \approx 5090 \text{ ENDLESS}$$

對照全部 13 個現役徵召：期望達標抽數 4.4（票房，機敏 ≥ 78）→ 27.2（花旦），
必應 370 → 5090，難度差約 6 倍，印證不可用固定值。

### 1.5 邊界條件

- 性別不入骰（由 preview prompt 與鏈上 `check_voucher_requirements` 把關），不影響 $E$。
- 門檻極苛（四軸全 ≥ 90）時應調低門檻或抬高 basePrice，而非令必應天文數字化。
- 客戶端重骰上限 `MAX_REROLL = 1000`；超限即提示門檻過苛。
- 實作：`packages/web/src/lib/recruit-pricing.ts`（`expectedDrawsToMeet` / `suggestedBulkPrice`）。

---

## §2 戲劇張力引擎（Desire/Resource Drama Engine）

### 2.1 問題陳述

LLM 自由生成的角色目標（自由字串）缺乏稀缺與零和，長程敘事呈三種退化：
**flatline**（張力走平）、**runaway**（絕望吸子）、**oscillation**（目標每拍翻轉）。
本引擎的核心命題：

> 戲劇張力不來自慾望本身，而來自「慾望投射到**有限、守恆的資源**上、無法同時被滿足」
> 的那條邊。張力因此是資源配置的**確定性導出量**，而非 LLM 的判斷。

### 2.2 模型

三個純資料 primitive（`packages/drama/src/types.ts`）：

| Primitive | 定義 |
|---|---|
| `Desire` | $(\text{weight}, s, \text{baseline}, \text{volatility}, \text{draws\_from})$ — 慾望宣告其從哪些資源汲取滿足 |
| `Resource` | $(\text{capacity}, \text{allocations})$ — **守恆不變式** $\sum \text{alloc} \le \text{capacity}$ |
| `Action` | 資源重配置提案 + 行動成本（扣 per-agent 行動預算） |

轉移函數 `applyTick(world, actions, cfg) → world` 為純函數，相位序
**REFILL → RESOURCE → SATISFACTION**（tension 於讀取時導出，不入狀態）：

$$\text{target} = \text{SCALE} \cdot \frac{\text{held}}{\text{want}} \qquad (\text{want}=0 \Rightarrow \text{target}=\text{SCALE})$$

$$s \mathrel{+}= \alpha \cdot \frac{\text{target} - s}{\text{SCALE}}, \qquad
\alpha = \begin{cases}\alpha_{\text{up}} & \text{target} > s\\ \alpha_{\text{down}} & \text{target} < s\end{cases}$$

$$s \mathrel{+}= \gamma \cdot \frac{\text{baseline} - s}{\text{SCALE}} \qquad (\text{habituation})$$

$$\text{tension} = \text{weight} \cdot \frac{\text{SCALE} - s}{\text{SCALE}}$$

行動預算建模為 per-agent 獨佔資源（`schedule:<agent>`，capacity = 預算上限），
REFILL 相位每 tick 固定補充且封頂於自由容量，故補充本身不破壞守恆。

### 2.3 形式性質（規格而非建議）

| 性質 | 內容 | 保證方式 |
|---|---|---|
| **守恆** | 任何 action 後 $\sum \text{alloc} \le \text{capacity}$ | 違規提案被 reject，狀態不變 |
| **有界（無 clamp）** | $s \in [0, \text{SCALE}]$ 恆成立 | 截斷整數除法之凸組合步進不會越過 target / baseline；400-tick 對抗性參數掃描斷言，全程無 `clamp` |
| **損失趨避** | $\alpha_{\text{down}} > \alpha_{\text{up}}$ ⇒ 失去快於獲得 | 下行螺旋＝可讀的戲 |
| **習慣化** | $\gamma > 0$ 令滿足回歸 baseline | 防「成功平線」 |
| **決定性** | 同 $(\text{world}, \text{actions})$ ⇒ 逐位元組同輸出 | bigint 全程；canonical action order = 依 (actor, input-index) 原始碼點排序（非 locale 相依） |

衝突為**湧現**而非宣告（無 conflict matrix）：跨 agent 衝突源於兩慾望抽取同一
capacity-1 資源（零和）；agent 內衝突源於兩慾望競爭同一有限行動預算（取捨由
「預算有限」導出）。

### 2.4 校準參數

滿足度動力學（全場景共用）與規劃器參數（`packages/drama/WRITEUP.md` §3）：

```
SCALE = 1_000_000        alphaUp = 300_000 (0.30)    alphaDown = 600_000 (0.60)
gamma = 50_000 (0.05)    baseline = 200_000 (0.20)   volatility = 1_000_000 (1.00)

seizeMargin = 0.12   focusMargin = 0.15   actThreshold = 0.30
actionCost = budgetCap = 12  →  奪位週期（reign period）≈ 7 tick
```

核心校準洞察：**行動預算補充率決定翻轉週期**。`actionCost = budgetCap`、每 tick 補 1
⇒ 奪位至多每 `budgetCap` tick 一次，把逐拍 argmax 抖動轉為緩慢可讀的宿敵節奏。

### 2.5 失敗模式的操作化定義

測試斷言數字而非觀感（`driver/metrics.ts`）：

- **flatline**：爭奪慾望的張力峰谷擺幅 < 0.15。
- **runaway**：後期窗口全慾望平均滿足度 < 0.08（絕望吸子）。
- **oscillation**（頻率定義）：後期持有者政權期 < 4 tick **且** 後期翻轉 ≥ 3 次。
  頻率定義是關鍵修正：每 ~8 拍易手的對稱宿敵是**可讀的戲**，僅近週期-1 的退化翻轉
  才是病態；天真的翻轉次數閾值會錯判健康的宿敵戲。

### 2.6 實驗結果

全部數字由 `node driver/report.ts` 逐位元組重現（測試：**29/29 綠**，2026-06-11 實測）。

**實驗一 · 跨 agent 爭奪**（2 agent、1 個 capacity-1「孟雲屏搭檔位」）：

| 場景 | 翻轉 | 政權期 | 可讀升級 | 擺幅 | 失敗模式 |
|---|---|---|---|---|---|
| contested（近對稱 0.82/0.80） | 16 | 6.8 | 是 | 0.631 | 皆無 |
| uneven（0.90/0.35，margin 0.50） | 1 | ∞ | 是 | 0.619 | 皆無 |
| naive-ablation（拔除 margin＋預算成本） | 80 | **1.0** | — | 0.254 | **oscillation 重現** |

- contested：席位以 ~7 tick 的可讀節奏易手；敗者張力攀至 ~0.81 的尖峰**驅動**反奪——
  spike-driven re-seize。
- uneven：強欲者奪位長持，弱者收斂於「求之不得」的穩定渴望（滿足 ≈ 0.02、張力 ≈ 0.34）
  ——同一引擎產生第二種戲。
- naive-ablation 為負控制：margin 與有限預算被證明是承重結構而非裝飾。

**實驗二 · agent 內取捨（柳生春時刻）**：柳生春負載兩個慾望（陪孟雲屏排戲 / 搶壓軸），
共用一份有限行程預算；白牡丹為持續掠奪的固定對手：

| 場景 | 被迫二選一 | 焦點切換 | 兩慾皆滿足 | 最長冷落 |
|---|---|---|---|---|
| fame-scarce（預算 8/補 1） | **120/120 tick** | 14 | **0** | 120 |
| fame-abundant（僅放寬預算至 64） | 2 | 13 | 66 | 4 |

單變數消融：唯一改動為預算 ⇒ forcedChoice 120→2、bothHigh 0→66——
**取捨由預算有限因果地導出，非劇本寫定**（被劇本寫死的取捨無法被此消融消去）。

**附帶發現（可入論文）**：agent 內取捨僅在跨 agent 爭奪持續存在時才存活——
持有免費、僅奪取付費，故無掠奪者時 agent 可兼得兩席而息。規格中的兩類衝突
**耦合而非獨立**。

### 2.7 鏈上對應與跨層一致性

`contracts/endless_story/sources/resource.move` 為 `applyTick` RESOURCE 相位的 Move
對應體（守恆 = 合約不變式；轉移提案於鏈上重驗）。跨層一致性測試
（`test/onchain-conformance.test.ts` ↔ `contracts/tests/drama_e2e.move`）釘死同一
beat（柳持 capacity-1 席位 → 白奪取）在兩層必須得到**逐位元組相同的 allocation 與
導出張力**——「任何人 re-run 得到同樣張力」主張的最後一環。

---

## §3 注意力預算耦合（Attention Coupling）

並行事件（多個正交資源軸同時開局）引入跨事件互動問題：兩樁不碰同一守恆池的事件
本應透過**共享的人**互相拉扯。`attention-core.coupleAttention`（純函數，
`packages/web/src/lib/chain/attention-core.ts`）：

- 每角色僅「全額供養」其張力排序前 `focus`（預設 1）個慾望；
- 排序其後的慾望被**冷落放大**：rank 越後，張力乘數越大；
- 放大後聚合至全域張力列 → 被冷落軸的總張力上升 → 選題與結算轉向它——
  兩事件經由共享角色互相牽動（柳生春時刻的跨事件版）。

性質：對單慾望角色為恆等變換；僅作用於 off-chain 需求訊號（`drama.top`），
**不觸碰鏈上可驗的供給與守恆**——注意力是其上的 overlay。人物層由
`neglectHintFor` 將「主渴望被反超」翻譯為該角色 decide/POV prompt 的「顧此失彼」
提詞，使世界級拉扯落到台詞與決策。狀態：純測試綠、flag-gate（預設關）、待真鏈驗證。

---

## §4 角色經濟生命週期

### 4.1 金流模型與守恆不變式

全站單一幣 ENDLESS（6 位小數；內部 money 單位 = 1e-6 ENDLESS、vitality = milli-points、
age = milli-years）。閉環：

```
訂閱費 ──RevenueConfig{owner,storyteller,treasury}bps──▶ saga 金庫（發薪池；mint/抽卡費、夢費同入）
   saga 每敘事日發薪 ──▶ 角色 Balance（真實持幣） ◀── owner 挹注 / 角色間轉帳（淨額 0）
   角色每日扣 dailyCost ──▶ 協議金庫（對應真實基建：LLM 推論 / Walrus 儲存 / SEAL 解密）
```

**守恆不變式**（模擬器逐日斷言、Move 移植後須維持）：

$$\text{injected} \equiv \text{ownerSink} + \text{storytellerSink} + \text{protocolSink} + \text{sagaTreasury} + \sum_i \text{balance}_i$$

### 4.2 每日開銷（記憶租金 = 不可逃避的熵）

$$\text{dailyCost} = C_{\text{run}} \cdot \text{activeFactor} + C_{\text{mem}} \cdot \text{memory\_count} + C_{\text{img}} \cdot \text{image\_count} + C_{\text{seal}} \cdot \text{recallCount}$$

$C_{\text{run}}=6$、$C_{\text{mem}}=0.02$/記憶、$C_{\text{img}}=0.1$/張、$C_{\text{seal}}=0.25$/召回。
訂閱 gate：subscriber = 0 ⇒ activeFactor = 0.3（休眠：不產 POV、召回退化）；≥1 ⇒ 1.0。

MemWal 記憶 append-only、永不刪除 ⇒ `memory_count` 嚴格單調上升 ⇒
**休眠可逃推論費、不可逃記憶租金**。一生開銷成長（active=1.0、recall=4、
genesis ≈5 條 + 每活躍日 +6 條）：

| 在世日 | 0 | 30 | 100 | 180 | 360 |
|---|---|---|---|---|---|
| memory_count | 5 | 185 | 605 | 1085 | 2165 |
| dailyCost | 7.10 | 10.70 | 19.10 | 28.70 | 50.30 |

### 4.3 收入：混合發薪

發薪池為當日 $\text{sagaInflow} = \text{subPrice} \cdot \sum \text{subscriber} \cdot \text{treasury\_bps}/10^4$
加金庫存量（鏈上 `saga::treasury_balance` 為種子——金庫由 mint/抽卡/夢費注入，
**零訂閱亦有保底班中俸**，金庫空才為 0）：

$$\text{salary}_i = \text{baseFloor}_i \cdot \text{attrModifier}_i + \text{perfBonus}_i$$

$$\text{attrModifier}_i = \text{clamp}\Big(1 + \tfrac{\text{con}+\text{app}+\text{acu} - 150}{300},\, 0.7,\, 1.3\Big) \quad (\text{心性不入薪})$$

$$\text{perfBonus}_i = \text{perfPool} \cdot \frac{\text{subscriber}_i}{\sum \text{subscriber}}, \qquad \text{perfPool} = \max(0, \text{sagaInflow} - \sum \text{baseFloor})$$

發薪池不足時全班保底按 $\text{ratio} = \text{sagaInflow}/\sum\text{baseFloor}$ 等比打折、
perfBonus = 0。行當保底表（班主可調，key 在 `role:*` tag）中位 ≈ 8，與 $C_{\text{run}}=6$
對齊：新生角色（dailyCost ≈ 7.1）微盈、有成長窗口。

### 4.4 淨流、runway 與生存等級

Balance 不可負（Move `Balance` 型別保證）：

```
payable = min(balance + salary, dailyCost)
netFlow = salary − dailyCost
runway  = netFlow ≥ 0 → ∞；否則 ⌊balance / −netFlow⌋
```

| Level | 條件（由上而下首命中；insolvent 強制 critical） |
|---|---|
| healthy | netFlow > 0 且 balance ≥ 30 |
| stable | netFlow ≥ 0 或 runway ≥ 14 |
| low | netFlow < 0 且 7 ≤ runway < 14 |
| critical | netFlow < 0 且 runway < 7 |

### 4.5 氣血與雙軌死亡

$$v(t) = \text{clamp}\big(v(t{-}1) + \text{recovery} - \text{econDamage} - \text{ageHazard},\, 0,\, 100\big), \qquad v \le 0 \Rightarrow \text{mark\_dead}$$

**經濟死軌**：破產定義為結算時 $\text{balance} < \text{dailyCost}$（非 balance < 0，
Move Balance 不可負）。連續破產 streak 加速衰減（呼應 §2 損失趨避）：

$$\text{insolvent} \Rightarrow \text{streak}{+}{+},\ v \mathrel{-}= 8 \cdot \text{streak}; \qquad \text{solvent} \Rightarrow \text{streak}=0,\ v \mathrel{+}= 5$$

滿血至死需連續破產約 5 日（8+16+24+32+40 = 120 > 100）——約一旬的搶救窗口，
同盟接濟可逆轉。

**年齡死軌（隱藏 hazard，不存壽限）**：

$$\text{ageHazard} = 3 \cdot \max(0,\, \text{age}_{\text{years}} - \text{onset}), \qquad \text{onset} = 55 \pm \text{hiddenVariance}(\text{seed}_{\text{char}})$$

無 `max_age` 欄位（連加密的都不存）；onset 種子由 runner 私有、永不上鏈。
死期由氣血累積**湧現**，無人可預先計算。死亡觸發 `mark_dead` → 擋移動/出牌、
釋放持有資源（`release_holder` → 席位回自由池）、殘餘 Balance 回流 owner（遺產）。

### 4.6 轉帳原語與硬守衛

角色間轉帳抽為單一真理純函數（`packages/economy/src/transfer.ts`）：

```
applyTransfer(from, to, amount, memo_kind)
  memo_kind ∈ {gift, patronage, loan, repay, bribe, tribute}
  守衛：禁自轉、禁轉給死者、禁透支（amount ≤ balance）
  性質：橫向轉帳淨額為 0，不破壞 §4.1 守恆
```

雙軌死亡同樣抽為 `stepVitality`（`src/vitality.ts`），`settleDay` / web 影子 /
模擬器 driver 全部呼叫同一份（parity 測試守衛），日後 `economy.move` 照搬。

### 4.7 假說檢驗（H1–H6）

純確定性模擬（bigint 定點數，鏡像 `packages/drama` 紀律）。**41/41 測試綠**
（2026-06-11 實測，`node --test "test/**/*.test.ts"`）；不變式：守恆逐日成立（6 情境 × 全日）、
有界（$v \in [0,100]$、balance ≥ 0）、確定性（同輸入逐位元組同輸出）、golden vector 命中。

| 假說 | 設計 | 結果 |
|---|---|---|
| **H1** 存在可養活穩態 | thriving（16 訂閱） | 整個黃金期 100% healthy；身家 56 → 1227 ENDLESS |
| **H2** 無永生 | starving（0 訂閱）＋延長 horizon 探針 | 零訂閱平均壽命 26 日；**固定 16 訂閱者 200 日全健康、300 日開始死、400 日全滅**——記憶租金終究碾壓靜態收入，唯成長中讀者能續命 |
| **H3** 世代交替 | mixed-cohort（生育＋檔期競爭） | 跨 320 日維持 avgAlive ≈ 3.43 的穩定族群帶；死 28 / 生 26，非全滅亦非永生 |
| **H4** 同盟因果有效 | alliance on/off 對照（唯一差別＝patronage 開關） | on：死亡 0、50 次救援；off：死亡 3 |
| **H5** 無病態 | mixed-cohort 分配檢查 | 財富 Gini 0.14，無暴富/全餓 |
| **H6** 挹注可豢養 | vendor（零訂閱＋owner 挹注）對照 starving | 全員存活、0 經濟死；每角色每日 ~5.5 ENDLESS（休眠 gate 壓低）、180 日共 ~1988，有界可負擔；對照組全滅 |

**機制論述**：機制保證死亡（append-only 記憶租金為不可逃避之熵，H2），同時獎勵
好營運（長黃金期＋可觀獲利，H1），令同盟成為理性續命策略（H4），並令 owner 得以
有界成本豢養無讀者之心愛角色（H6）。「記憶厚度 → 讀者 → 收入」為量化成立的敘事軸。

**Living-world 接濟對照（決策核心因果重驗）**：以 `decideAid` 決策核心（非寫死救援
策略）重跑 H4 型對照——無接濟 150 日死 3/4；開接濟死 0/4（413 筆轉帳、逐日守恆成立）。
證明因果性穿過決策層仍成立。

---

## §5 金錢行為的 LLM 判斷層與評測

### 5.1 四個金錢動作與「戲/帳」分界

角色的金錢行為補齊為 4 個 agent 動作，與出牌/移動同構：

| 動作 | 決策者 | 硬守衛（確定性層） |
|---|---|---|
| **給**（`decideAidAction`） | cheap-tier LLM：give/no-give、給誰、給多少 | 收款人須在 peer 名單、金額 clamp ≤ 餘額（no-overdraft）、對齊 `applyTransfer` |
| **收/拒**（GIVE 受方） | 關係驅動（v1）：仇家回絕、寫「傷和氣」記憶 | — |
| **要**（`decideAskAction`） | cheap-tier LLM：向誰開口、要多少 | target 須真實且非自己、amount > 0 |
| **回應**（= 給的決策） | 同 decideAid | 同上 |

設計原則：**LLM 決定「要不要、對誰」（戲），守衛決定「能不能、至多多少」（帳）**。
任何 LLM 輸出皆通過 `parseAid` / `parseAsk` / `clampAidAmount` / `finalizeAsk`
後才可能觸碰 Balance。

確定性版 `decideAid`（需求接地：自身瀕死/無餘額不給；無人真缺不給；金額 =
min(自身盈餘, 補至目標 runway)；仇家不資助）保留為 **fallback / baseline**。

### 5.2 評測（eval harness）

`runner/src/services/character-agent/__eval__/`：6 情境 = **3 hard（必過）+ 3 judgment
（觀察合理性）**。Hard 案例守衛行為 3/3 通過；judgment 案例（以 Claude 自評跑過一輪）
皆給出可辯護的判斷：富裕者救瀕死盟友、無人缺時不散財、自身拮据僅小額還情、
瀕死仇家有理拒絕、雙缺先救命懸一線者、「想要」非「急需」不傾囊。
cheap-tier 決策模型選定 GLM-5.1-FW（live eval 自洽性較佳）；
對 cheap-tier 的全自動評分待有 API key 環境補跑。
守衛層單元測試含於 runner 套件（**48/48 綠**，2026-06-11 實測）。

### 5.3 結算相位（off-chain shadow）

tick loop 的經濟相位序：**ASK（2.85）→ GIVE（2.9）→ SETTLE（2.95）**，排於 SOCIAL 之後、
ACT 之前。SETTLE 以鏈上金庫餘額為發薪池種子執行 `settleSagaTo`：日結算 **idempotent
per day**、轉帳**每 tick 套用**（核心攜帶 `lastSalaryMicro` 解決 tick 快於經濟日的粒度
不匹配）。影子已死者被剔出 active slice（不再 plan/move/act）。整條
**發薪 → 扣記憶租金 → 開口求助 → 接濟轉帳（可拒）→ 老死/餓死退場** 迴圈已可端到端
觀察；鏈上權威結算（`economy.move`）為既定後續，移植對象即 §4.6 的兩支純函數。

---

## §6 記憶召回評分（三因子）

記憶為 SEAL 加密文字存 Walrus，前綴標籤 `[[m|t=<kind>|i=<importance>|d=<敘事日>]]`。
召回分數：

$$\text{score} = \underbrace{\text{importance}}_{\text{tag},\ 1\text{–}9} \times \underbrace{\text{recency}}_{2^{-\Delta d / h},\ h = 2\ \text{敘事日}} \times \underbrace{\text{relevance}}_{\text{向量距離}}$$

- importance 既定刻度：夢 9 > 關係 8 = 規劃 8 > 反思/創世 7 > 章回 5 > 觀察 4。
- recency 以**敘事日**而非牆鐘衰減——推進 tick 即衰減，可演示。注夢（i=9）起始最高
  但隨 recency 被新記憶逐漸超越，非永久置頂。
- 託管模式：語意候選集 over-fetch 3× → client 端三因子重排 top-K。
  自架 relayer 模式：對**整個 namespace** 計算真三因子回傳 top-N（plaintext-blind，
  僅存向量 + 純量 metadata + blob id），省去約 3× SEAL 解密。
- **軟遺忘**：append-only 無刪除。睡眠期將非 anchored 的零碎觀察壓縮為 1–2 條高密度
  反思（i=8、`a=1` anchored 永不再壓），高 importance 直接壓過 observation(4)/chapter(5)，
  疊加 recency 衰減使零碎記憶自然沉底——遺忘為湧現性質，bytes 永不消失
  （此即 §4.2 記憶租金的物理基礎）。

---

## §7 可重現性與驗證紀律

### 7.1 數值表示

全部域值與中間值為 `bigint`（float64 無法承載 u128 中間值，且浮點捨入非跨引擎一致，
皆破壞逐位元組重現）。`SCALE = 10^6` 定點；除以 SCALE 顯式 rounding（截斷向零）；
canonical 排序用原始碼點比較（`localeCompare` 非跨機穩定）。此表示與 Move u64/u128
1:1 對應，是鏈上可驗證性的承重選擇。

### 7.2 Golden vectors 與跨層一致性

- `packages/drama/test/core.test.ts` 與 `packages/economy/test/core.test.ts` 各 commit
  一組 golden vector（寫死 world+actions 之預期下一狀態）——既是回歸測試，
  亦是日後鏈上 re-run 驗證的對照組。
- 跨層一致性（§2.7）：TS `applyTick` 與 Move `resource.move` 對同一 beat 須得
  逐位元組相同的 allocation；`tests/drama_e2e.move` 與
  `test/onchain-conformance.test.ts` 互為鏡像。

### 7.3 測試統計（2026-06-11 實測）

| 套件 | 測試 | 內容 |
|---|---|---|
| `packages/drama` | **29/29** | 守恆 / 有界無 clamp / 決定性 / golden vector / 三失敗模式 / 柳生春取捨 / 鏈上一致性 |
| `packages/economy` | **41/41** | 守恆 / 有界 / 確定性 / golden vector / H1–H6 / 轉帳守衛 / 雙軌死亡 / cohort 金庫發薪（settle parity） |
| `packages/runner` | **48/48** | LLM 輸出解析與身份漂移防線 / aid·ask 守衛 / 導演 capability 驗證 |
| 合約 unit tests | 47+（含 `drama_e2e.move`） | Move 模組（currency/world/saga/scene/character/recruit/event/…） |

### 7.4 重現指令

```bash
# 張力引擎：26+3 測試、報表、單場景軌跡
cd packages/drama && npm test
node driver/report.ts                  # §2.6 全部數字
node driver/cli.ts partnership-contested
node driver/cli.ts fame-scarce         # 柳生春時刻

# 角色經濟：41 測試、假說報表、圖表
cd packages/economy && node --test "test/**/*.test.ts"
node driver/report.ts                  # H1–H6 PASS/FAIL gate
node driver/html-report.ts             # → report/index.html

# Runner 守衛層
pnpm --filter @endless-story/runner test
```

---

## 附錄 A · 校準常數總表

| 域 | 常數 |
|---|---|
| 定點 | `SCALE = 1e6`；money base unit = 1e-6 ENDLESS；vitality = milli-points；age = milli-years |
| 張力 | `alphaUp 0.30 · alphaDown 0.60 · gamma 0.05 · baseline 0.20 · volatility 1.0` |
| 規劃器 | `seizeMargin 0.12 · focusMargin 0.15 · actThreshold 0.30 · budgetCap 12（reign ≈ 7）` |
| 抽角 | `margin 0.85 · MAX_REROLL 1000 · 屬性域 [0,100]（mod 101）` |
| 經濟 | `C_run 6 · C_mem 0.02 · C_img 0.1 · C_seal 0.25 · subPrice 3 · bps 20/30/50 · baseFloor 中位 8 · seedFunds 56 · slotBonus 1.5` |
| 氣血 | `ECON_BASE 8 · recovery 5 · AGE_K 3 · ONSET_BASE ≈ 55（隱藏變異）· v ∈ [0,100]` |
| 記憶 | `half-life 2 敘事日 · over-fetch 3× · importance：夢9 關係8 規劃8 反思/創世7 章回5 觀察4` |
| 注意力 | `focus 1 · maxConcurrentEvents 2`（flag-gate） |
| 事件 | `spine minTicks 2 / maxTicks 4 · 導演立題 cooldown 6 次 / 上限 3 個`（flag-gate） |

## 附錄 B · 實驗與素材索引

| 素材 | 位置 | 再生方式 |
|---|---|---|
| 張力曲線四圖（contested / regimes / trade-off / ablation） | `packages/drama/figures/` | `node driver/export-traces.ts` + `python3 figures/plot.py` |
| 經濟假說圖表報告 | `packages/economy/report/index.html` | `node driver/html-report.ts` |
| 校準記錄與決策 | `packages/drama/WRITEUP.md` | — |
| 接濟 eval 情境 | `runner/src/services/character-agent/__eval__/` | `--print` 出 prompt；有 key 自動評分 |
| 主觀真相實測案例（沈雪笙/唐桂蘭） | `docs/NARRATIVE_AGENTS.md` §5 | — |

---

_本卷為活文件：新增可公式化機制或實驗時於對應節擴充；狀態快照以 `docs/mechanism-report.html` 為準。_
