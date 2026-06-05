# Endless Story — 機制白皮書 (數學公式集)

> 這份文件收斂遊戲機制裡**有數學的部分**：公式、推導、假設、參數。新的數學東西先丟這裡,之後再分章整理。
>
> 目前各處的設計細節仍散在:`docs/CHARACTER_ECONOMY.md`(角色經濟 life cycle)、`packages/economy`(經濟模擬驗證)、`packages/drama`(張力引擎)。本檔負責「**可被一條公式講清楚**」的那些。

---

## §1 抽角定價 (Gacha Pricing)

### 1.1 骰子模型

每個角色有 4 個先天屬性軸:**外貌 / 筋骨 / 機敏 / 心性**。mint 票券時用一個 32-byte 隨機種子,經 `HKDF-SHA256` 對每軸做**域分離**後取值(`packages/llm/src/seed/roll.ts`):

$$x_i = \big(\text{u32}(\text{HKDF}(\text{seed}, \text{axis}_i)) \bmod 101\big) \in [0, 100]$$

關鍵性質:

- **單一軸 = 均勻分佈 (uniform)**,不是鐘型。值 95 與值 50 出現機率相同(各 1/101)。
- **四軸獨立**(HKDF 域分離保證)。
- **四軸總和**(角色總戰力 ∈ [0, 400])才會 ≈ **鐘型**(Irwin–Hall / 中央極限,集中在 200)。

> ⚠️ 若日後想讓「單軸也呈鐘型」(極端值更稀有、90 更珍貴),需改骰法為「取 k 次均勻的平均」。那會讓高門檻變成**指數級**稀有,§1.3 的 $E$ 與一口價都要重算。**本公式假設每軸 uniform。**

### 1.2 命中機率與平均抽數

一則徵召可設 `minAttributes` 硬性門檻(每軸 `xᵢ ≥ mᵢ`)。單軸均勻 ⇒ 命中該軸機率:

$$p_i = \frac{101 - m_i}{101}$$

各軸獨立 ⇒ 一抽就同時滿足全部門檻的機率:

$$p = \prod_{i \in \text{required}} \frac{101 - m_i}{101}$$

「抽到符合」服從幾何分佈,所以**平均要抽幾次才達標**:

$$E[\text{draws}] = \frac{1}{p}$$

### 1.3 一口價公式

**單抽**:付 `basePrice`,先天隨緣,不中要再抽(再付)。
**一口價**:後端只重骰便宜的骰子(不叫 LLM、不上鏈、不生圖)直到達標,**命中才生成 + mint**,一次付清。它賣的是「**省下的平均硬抽花費 + 保證 + 即時**」。

合理錨點 = 期望硬抽花費,再乘一個 margin:

$$\boxed{\;\text{bulkPrice} = \max\Big(\text{basePrice},\; \text{round}_{10}\big(\text{basePrice} \times E[\text{draws}] \times \text{margin}\big)\Big)\;}$$

- `margin = 0.85`(專案預設):一口價比期望硬抽**略便宜** → 想要角色的人直接選它,消掉變異帶來的暴怒、營收平滑;單抽留給想賭便宜/求刺激的人。
  - `1.0` = 公道價(期望花費相同,但即時+保證)。
  - `1.3` = 溢價(把一口價當高級便利服務)。
- **clamp ≥ basePrice**:一口價永不低於單抽。
- 門檻越苛 → $E$ 越大 → 一口價越貴。**所以這是 per-徵召 的值,不能用一個全站固定數字。**

實作:`packages/web/src/lib/recruit-pricing.ts`(`expectedDrawsToMeet` / `suggestedBulkPrice`)。
Admin 後台「招募」每列有「建議」鈕(依當前門檻即時算),頂部有「批次定一口價」(一鍵套用到全部)。
種子(`seedDefaultRecruitments`)在 `bulkPrice` 缺漏時自動代入此公式。

### 1.4 範例(春雪社 · 台柱花旦)

門檻 外貌 ≥ 86、心性 ≥ 76;`basePrice = 220`。

$$p = \frac{101-86}{101} \times \frac{101-76}{101} = \frac{15}{101} \times \frac{25}{101} \approx 0.0368$$

$$E[\text{draws}] = \frac{1}{0.0368} \approx 27.2$$

$$\text{bulkPrice} = \text{round}_{10}(220 \times 27.2 \times 0.85) \approx 5090 \text{ ENDLESS}$$

對照(全 13 個現役徵召),平均達標抽數落在 **4.4(票房,機≥78)→ 27.2(花旦)**;一口價(×0.85)約 **370 → 5090**。難度差 ~6 倍,印證「不可用固定值」。

### 1.5 注意

- $E$ 只取決於 `minAttributes`;**性別不入骰**(性別由 preview prompt 強制 + 鏈上 `check_voucher_requirements` 把關),不影響抽數。
- 門檻極苛(例如四軸全 ≥ 90)時 $E$ 會很大、一口價會很貴 —— 此時考慮**調低門檻**或**抬高 basePrice**,而不是讓一口價變天文數字。
- 客戶端重骰有上限(`MAX_REROLL = 1000`);若超過仍未中表示門檻過苛,UI 會提示改用單抽或調低要求。

---

## §2 角色經濟 (待整理)

> 每日開銷 `dailyCost = C_run·active + C_mem·memory + C_img·image + C_seal·recall`、薪餉、氣血/壽限 hazard、survival level 等公式目前在 **`docs/CHARACTER_ECONOMY.md`** 與 **`packages/economy`**。之後搬重點公式到這裡。

## §3 張力引擎 (待整理)

> 稀缺資源滿足度 / tension 的定點數公式在 **`packages/drama`**(`DRAMA_ENGINE_BRIEF.md`)。之後摘要到這裡。
