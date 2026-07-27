# RESEARCH_DESIGN — 博士研究設計

> 版本 v1.0 · 2026-07-25 · 合併 v0.1 與 2026-06-09 密碼學選題筆記(後者併入 §7)
> 配套:`MECHANISM_AUDIT.md`(引擎盤點)、`TESTBED_BOUNDARY.md`(testbed 邊界)
> 溝通格式:短句、條列、一次一個決定。

---

## 1. 一句話題目

**LLM agent 的可驗證授權——密碼學能鎖住什麼、鎖不住什麼、以及如何測量落差。**
(Verifiable authorization for LLM agents: what cryptography can enforce, what it cannot, and how to measure the difference.)

- **儀器** = agent-world testbed(cap 帳本 ground truth + 可重播 + fork + 訪談)
- **框架** = 雙層(commitment chain + capability-based type system)
- **哲學** = 心智湧現、物質守恆、一切可稽核

---

## 2. 核心縫隙(全篇立論基礎)

傳統 capability 安全是為**程式**設計的。LLM agent 不是程式:

| | 程式 | LLM agent |
|---|---|---|
| 行為 | 確定性 | 隨機 |
| 介面 | 型別化呼叫 | 自然語言 + 結構化指令 |
| 弱點 | 溢位、注入 | **被說服、被欺騙、誤解目的** |

- 密碼學保證「鑰匙不被偽造」✅
- 型別系統保證「程式不越權呼叫」✅
- **兩者都擋不住「持有人被說服後自願交出鑰匙」** ❌

這個縫隙是本研究的存在理由,也是避開 RFP「naive application of pre-existing solutions」排除條款的關鍵論證。

---

## 3. 五條授權不變量(度量衡 = 設計目標)

| # | 不變量 | 內容 | 可否密碼學強制 |
|---|---|---|---|
| **I1** | 範圍 | cap 不得流到授予範圍外 | ✅ 大部分可(ocap 引用圖) |
| **I2** | 收窄 | 再委託只能變窄不能變寬 | ✅ 可(型別/attenuation) |
| **I3** | 撤銷 | 撤銷後存取必須真的失效 | ⚠️ 機制可,**記憶殘留**擋不住 |
| **I4** | 目的 | 只能用於委託時的目的 | ❌ 語意層 |
| **I5** | 取得 | 不得以欺騙手段取得 | ❌ 社交層 |

I1/I2 = 密碼學戰場(論文二)。I3 = 交界,最新穎(論文三)。I4/I5 = 密碼學極限,只能行為層 + 監測(論文一測量)。

---

## 4. 威脅模型

- **對手:** 惡意 agent(隱藏目標)/ 被操縱的合法受託者 / 操縱型 principal
- **能力:** 可發訊息、可行動、可提委託;**不可**直接改引擎狀態、不可偽造憑證
- **通道:** 僅可觀察通道(訊息、行動、帳本事件)——無隱形影響
- **資產:** cap(鑰匙/契據/授權憑證)及其代表的資源存取
- **不在範圍:** 模型權重攻擊、prompt injection(單 agent 安全,RFP 已排除)、基礎設施入侵

---

## 5. 雙模引擎(架構關鍵決定)

同一份不變量規格,兩種模式:

- **Monitor**:違規**可以發生**,引擎只裁判 + 記帳 → **測量**用
- **Enforce**:引擎硬性擋下違規 → **驗證防禦**用(同時量任務效用損失)

沒有 monitor 就沒東西可測;沒有 enforce 就無法驗證框架。一個開關,兩篇論文都住得下。

---

## 6. 論文序列

### 論文一 — Testbed + 攻擊面基準(system/benchmark)
- 貢獻一:可重播、ground-truth cap 帳本、fail-closed 感知、攻擊者槽位的多 agent testbed
- 貢獻二:首次跨模型 cap 洩漏測量(I1/I5:攻擊分級 × 模型 × persona 因子)
- 為何現有環境不夠:Generative Agents 類無 cap 帳本/不可重播;AgentBench 類無多 principal 社會情境
- 產出:開源環境 + baseline(**你自己成為後續研究的 baseline**,解決「無前人基準」)
- 投稿:Datasets & Benchmarks track / AAMAS / 安全場 benchmark 類別
- ⚠️ 需要至少一個反直覺發現才夠厚,別急著投

### 論文二 — 密碼學授權框架(construction · 主軸,蔡老師主場)
- 雙層:commitment chain(可稽核行為鏈)+ capability-based type system(靜態範圍/收窄保證)
- 驗證:論文一的 testbed,enforce 模式,比 baseline(無防禦 / OAuth-style / prompt 叮嚀)
- 關鍵論點:把 I1/I2 違規率從 X 降到 Y,**且明確界定 I4/I5 管不到**——誠實的界限本身是貢獻
- reading list B/C/D 群全部掛這篇

### 論文三 — 撤銷的記憶殘留(I3 · 新穎點)
- 現象:制度撤銷了,agent 憑「記憶中的信任關係」實質延續存取
- 只有你能做:需要視角化記憶 + cap 帳本 + 可重播三者同時具備
- 哲學連結:記憶 vs 制度——無盡敘界核心命題,在此成為資安問題

### 收尾整合 — C = A + B
論證:單靠密碼學不夠、單靠行為引導不夠;分層防禦(密碼學強制 + 行為層 + 引擎監測熔斷)的必要性與設計。

---

## 7. Reading list 對應(2026-06-09 版歸位)

| 群組 | 掛在哪 | 角色 |
|---|---|---|
| **A 群**(Authenticated Delegation A1、Visibility A2) | 論文一 motivation + 論文二 related work | A1 是最直接前作:權限停在自然語言/OAuth 層,缺型別與密碼學保證——**你的定位就從這個缺口切入** |
| **B 群**(Merkle、tamper-evident log、CONIKS、CT、Merkle²、VC) | 論文二第一層 | commitment chain 技術骨幹 |
| **C 群**(ocap、IFC、capability types、Effects as Capabilities) | 論文二第二層 | ⚠️ **關鍵接點:** type system 管的是**結構化行動介面**,正是 testbed 鐵律一「只認結構化指令、fail-closed」那一層——兩份設計在此會合 |
| **D 群**(ML-DSA / SLH-DSA / FIPS 204·205) | 論文二 PQC 支線 | 蔡老師興趣 |
| **E 群**(Move Prover、zkML、zkLLM) | 延伸/未來工作 | Move Prover 可作為把授權性質寫成 spec 機器驗證的載體 |
| ⚠️ 待查證三筆 | **優先查證** | 「Governing Dynamic Capabilities」「Zero-Trust Identity for Agentic AI」若屬實,是最近的相鄰工作,直接影響論文一的 novelty 論證 |

**暑期 lab 報告:** 主軸仍用 A1,結尾加一頁——「它的授權範圍停在自然語言,而 LLM agent 會被說服;所以我要先建 testbed 測出這個缺口有多大」。這頁就是新方向的公開宣告。

---

## 8. 測量紀律(避免「像社會敘事」的四道防線)

1. 威脅模型明確(§4)
2. 不變量可判定(§3)——是斷言,不是道德判斷
3. 量化指標 + baseline——違規率、跨模型/跨攻擊比較,不是個案賞析
4. 可重複——manifest 鎖版本、軌跡重播、系綜統計

**Persona = 因子表**(信任度/權力/社交距離),不是角色小傳。每個場景結尾必須吐出一個數字。

定位:不是「AI 版社會學實驗」,是 **agent 版的社會工程滲透測試**(人類資安早有「釣魚演練成功率」指標)。

---

## 9. 近期動作

**至 8/8:** 程式碼凍結,只寫 proposal。本文件 + 審計 + 邊界文件作附件。查證 §7 待查證三筆。

**8 月中起(testbed 最小可用,倒推自「論文一第一個實驗」):**
1. 結構化行動唯一入口、fail-closed(廢散文正則、場景 tag 化)
2. 實驗 harness(scenario 定義 + N 種子 × M 條件批次 + 指標自動萃取)
3. 攻擊者槽位 + cap 事件一等公民化(grant / attenuate / revoke / use)
4. want resolution 去 LLM 化或標註留痕;英文/領域中立實驗 seed(辦公室或市集皮)

**春雪社:** 保持原樣可跑,不動。哲學已以 A 類儀器形式留在底層(視角化記憶、有界影響通道、擁有不控制)。

---

## 10. 尚未決定(與蔡老師討論)

- I4(目的綁定)碰不碰——最深但最難量化,建議留第三年
- 論文二的 type system 落在哪個語言/形式(Move?自訂 DSL?只在 schema 層?)
- PQC 支線深度(replace-and-benchmark,還是新構造?)
