# 從 Endless Story 到通用多智能體安全 Testbed — 策略與路線圖

> **狀態**：research / working note · 2026-07-24 · 內部策略文件（非機制真相，不拍板合約參數）。
> **對外精煉版**（grant-facing、英文）：[`TESTBED_POSITIONING.en.md`](./TESTBED_POSITIONING.en.md)。
> **緣起**：評估「把 Endless Story 往一個*通用* multi-agent safety testbed 走」的可行性與路徑，
> 對齊 Schmidt Sciences × Google DeepMind × ARIA × Cooperative AI Foundation 的
> **《Scaling AI Safety for a Multi-Agent World》** 資助計畫（deadline 2026-08-08 AoE）。
> **本輪只寫計畫**；通用化介面的程式碼 scaffold 另開分支做（見 §9）。

---

## 0. 一句話論點

> **Endless Story 已經是一個「確定性、可重現、鏈上可驗證」的多智能體世界 —— 它只是被實例化成了一個戲曲敘事世界。**
> 通用化 = 把 **domain-neutral 的基質**抽出來，讓「敘事」降格成眾多 scenario pack 之一，
> 再補上一套 **safety probe / benchmark**。核心資產（純確定性引擎、鏈上身分與承諾、
> 加密的 per-agent 記憶隔離、監督 agent、可重跑的實驗骨架）**全部已在庫裡**，不是從零開始。

這件事的槓桿在於：這個資助計畫的**第一個、也是被列為「其餘工作的前提」的研究群集，就叫
「Sandboxes and Testbeds」**——「沒有真實、可重現的多智能體環境，其餘方向都難以評估或比較」。
我們手上這套東西天然就是那個環境，而且帶了別人沒有的東西：**真的鏈上身分、真的密碼學承諾、
真的加密記憶邊界**。

---

## 1. 資助計畫速覽（對齊用；submit 前以官方 call 為準）

| 項目 | 內容 |
|---|---|
| 名稱 | Scaling AI Safety for a Multi-Agent World |
| 出資方 | Google DeepMind · Schmidt Sciences · Cooperative AI Foundation · ARIA · Google.org |
| 總池 | 約 **$10M** |
| Tier 1 | **≤ $300K** — 探索型 / pilot / 聚焦技術驗證 |
| Tier 2 | **$300K–$1M** — 更有企圖心 / 跨機構協作 |
| 期程 | **1–2 年** |
| 截止 | **2026-08-08 23:59 AoE**；決定約 fall 2026 |
| 資格 | 個人研究者 / 團隊 / 研究機構 / 多機構協作；**全球開放**。**非營利研究機構全球可申請；營利實體只能當 partner。** |
| 理論根基 | ARIA *Scaling Trust*；CAIF *Multi-Agent Risks from Advanced AI*（arXiv 2502.14143） |

**四個研究群集**（我們的映射見 §2）：

1. **Sandboxes & Testbeds** — 真實、可重現的多智能體環境供**比較性評估**（例：虛擬市場、模擬生態、多組織工作流）。
2. **Science of Agent Networks** — 互動 agent 群體的安全相關性質：集體能力如何**湧現與擴張**、網路如何**失效/失穩**、如何**偵測危險的族群層級性質**。
3. **Agent Infrastructure** — 壓力測試支撐可信互動的技術原語：**identity · verifiability · reputation · communication · commitment**。
4. **Oversight & Control** — 部署後保持安全所需的 **detection · attribution · security · intervention**。

被點名的失效模式：**collusion（勾結）· conflict（衝突）· destabilizing dynamics（失穩動態）·
emergent agency（湧現能動性）· security vulnerabilities**。

> ⚠️ **資格上的關鍵現實**：營利實體只能當 partner。231-Labs 若為公司，**單獨不具主申請資格**，
> 需要一個**學術/非營利 host（大學實驗室、研究所、非營利）當主申請或 PI**。
> 這一點直接連到「博班緩衝」的策略價值 —— 見 §7。

---

## 2. 現況盤點 → 四群集映射（核心表）

盤點以實際程式碼為準（非文件宣稱）。標記：✅ 已落地可重現 · 🟡 已寫待接線 · 🧭 潛在資產待顯影。

### 群集 1 · Sandboxes & Testbeds

| 我們已有的 | 落點 | 狀態 |
|---|---|---|
| **純確定性引擎 A（張力/資源爭搶）**：`applyTick(world,actions,cfg)`，bigint 定點、tension 由讀取導出不儲存、bounded-without-clamp | `packages/drama/src/applyTick.ts` · `tension.ts` · `fixed.ts` | ✅ |
| **純確定性引擎 B（角色經濟 life-cycle）**：`settleDay`，單日結算、含守恆不變式 | `packages/economy/src/settle.ts`（`conserves()`） | ✅ |
| **離線 driver + scenario 庫 + 失效模式 metrics**（每秒數千 tick、零 I/O） | `packages/{drama,economy}/driver/`、`scenarios/` | ✅ |
| **seedable RNG**（明言「no Math.random，runs must be reproducible」） | `packages/economy/driver/run.ts` `lcg(seed)`；`Scenario.seed` | ✅ |
| **可重跑的 story preset / fixture** | `packages/cli/scripts/stories/*.json`、`troupe/src/fixtures/*` | ✅ |
| **製作管線狀態機**（可 resume、每步冪等） | `packages/troupe/src/pipeline.ts` | ✅ |
| **Saga = generic narrative unit**（設計上就與題材無關；「換個 Saga 可以是詩社/舞廳/星艦/偵探事務所」） | `PRODUCT_POSITIONING.md §0.5` | 🧭 潛在（設計已通用、尚未被非敘事 scenario 實測） |

→ **這一整欄就是群集 1 要的東西。** 缺口只有「把它從*戲曲*實例抽成*通用*介面 + 一個非敘事 scenario 佐證」（§4）。

### 群集 2 · Science of Agent Networks

| 我們已有的 | 落點 | 狀態 |
|---|---|---|
| **湧現而非腳本化的動態**：柳生春「意圖 trade-off」不是寫死的，由「有限預算」falls out；經 ablation 證明是預算導致 | `drama/WRITEUP.md §5`、`scenarios/fame.ts` | ✅ |
| **量化失效模式偵測器**：flatline / runaway / oscillation，各有數值門檻（不是 vibes） | `packages/drama/driver/metrics.ts` | ✅ |
| **negative control + ablation 方法學**：拔掉 seize margin/budget → oscillation 復現 | `drama` naive-ablation scenario | ✅ |
| **族群層級假設檢定 H1–H6**：可行穩態 / 無永生 / **世代交替** / **聯盟因果有益** / 無病態 / owner 補貼 | `packages/economy/test/step1.test.ts`、`README.md` | ✅ |
| **incumbency / holder-stickiness**（在位優勢＝壟斷的種子）| `drama` 持有者黏性、`NARRATIVE_AGENTS.md §8b D3` | 🧭 潛在（機制已在，未當「安全現象」量測） |

### 群集 3 · Agent Infrastructure（identity / verifiability / reputation / communication / commitment）

> **這欄是最強的差異化：計畫點名的五個原語，這裡幾乎是逐一對應的鏈上 Move module。**

| 原語 | 我們已有的 | 落點 | 狀態 |
|---|---|---|---|
| **Identity** | `Character`(NFT, `has key`) + **`OwnerCap`**（根所有權、可轉讓＝出售角色）+ **`ControlCap`**（操作委派、epoch-gated + saga-bound、可撤銷） | `contracts/.../character.move`（`issue_control_cap`/`revoke_all_control`/`reassign_saga`） | ✅ |
| **Verifiability** | **golden vector**（re-run 對照）+ **off-chain==on-chain 一致性測試**（TS `applyTick` 與 Move ledger 逐 byte 相等）+ **HKDF 確定性擲值**（同 seed → 同角色、可稽核） | `packages/drama/test/onchain-conformance.test.ts`、`packages/llm/src/seed/roll.ts` | ✅ |
| **Reputation** | `subscriber_count`（角色上）；**關係圖** `relationship_seed` → reader 聚合 per-pair tone；經濟信用 | `character.move`、`director.move`、`web/.../chain/relationships.ts` | ✅（輕量，可深化） |
| **Communication** | **鏈上事件匯流排**（no in-process state）：導演發軟事件、角色訂閱回應；耐久捕捉 | `event.move`、`director.move`、`packages/indexer` | ✅ |
| **Commitment** | 字面上就有 **`commitment.move`**：每個產物 hash→Walrus→鏈上 `commit`；`reflection.move` | `contracts/.../commitment.move` | ✅ |

### 群集 4 · Oversight & Control（detection / attribution / security / intervention）

| 面向 | 我們已有的 | 落點 | 狀態 |
|---|---|---|---|
| **監督 agent（有 in-the-loop overseer）** | **Saga Director / Showrunner**：心跳巡檢、劇情健康度評估、必要時介入重導 | `runner/.../saga-director/`、`web/.../director/{showrunner,audit,repair}.ts` | ✅ |
| **detection（確定性巡檢）** | **AUDIT pass 純程式偵測**（卡住事件、空場景、缺漏），LLM 只決定「做不做」 | `web/.../director/audit.ts` | ✅ |
| **attribution** | 每個產物 sign-and-anchor（`commitment`）+ 全事件帶 `sender` → 可歸因「誰做了什麼」 | `commitment.move`、`indexer` `CapturedEvent.sender` | ✅ |
| **security / access control** | **SEAL 加密 + cap-gated 解密**；`revoke_all_control` → 斷一個 rogue agent 的記憶存取 | `packages/memwal`、`character::seal_approve_control` | ✅ |
| **intervention / kill switch** | relayer `GET/POST /control` 暫停開關；`set_runner_paused` 工具；導演護欄（tool-call 上限、鏈寫前 dryRun、audit log） | `packages/relayer`、`web/.../director/tools.ts` | ✅ |
| **information boundary（安全相關）** | **密碼學 per-agent 記憶隔離**：一個角色讀不到另一個的私密記憶；同一事件不同 agent 各長一版真相 | `memwal` SEAL id = `nsHex+bcs(characterId)` | ✅（原生現象，見 §5） |

**小結**：四個群集**全部**有已落地、可重現的對應資產，其中群集 3（infrastructure）幾乎是逐項命中。
這不是「勉強套框」，是**結構性契合**。

---

## 3. 誠實分界（不可 over-claim 的地方）

| 事項 | 真相 |
|---|---|
| **確定性的邊界** | 只有 **transition 核心**（drama `applyTick` / economy `settleDay`）確定性、可 byte-for-byte 重現。**LLM agent loop 本身非確定性、service-dependent**（叫 LLM、簽 Sui tx、讀寫 Walrus/Seal）。→ testbed 的「可重現」主張分兩層：**環境層 = 位元級可重現**；**LLM-policy 層 = 固定 seed/temperature + 完整 trace 捕捉後「以 log 重播」可重現**，非位元一致。這一點要在論文/proposal 講清楚，不能混。 |
| **tick step function 的實際位置** | 真正的「一 tick = 世界活一次」整合器在 **`packages/web/src/lib/actions/tick-loop.ts`**（`runTickLoopAction`），**不在 `runner`**（CLAUDE.md 講的「runner = tick loop」只對一半）。要當可重用 harness 得先把它從 web 抽出。 |
| **written-but-not-wired** | `indexer` 的 Pg store + Flux capture、`economy.move` 的鏈上 balance adapter、IP 分潤 primitive —— 依各自 README 皆為「已寫、生產接線未完」。 |
| **通用性目前是「潛在」** | Saga 設計上與題材無關、drama 核心 domain-neutral —— 但**還沒有任何非敘事 scenario 實測過**。這正是 M1 要交付的證據。 |
| **資格** | 見 §1：需要學術/非營利 host。 |

> 這張表本身就是 proposal 的加分項：計畫評審最在意「哪些真的會跑、哪些是願景」。
> 沿用本 repo 一貫的 ✅/🟡/🧭 紀律，把「implemented / deployed / verified-in-a-live-run」分清楚。

---

## 4. 通用化架構 —— 「怎麼往通用 testbed 走」

### 4.1 核心洞見（seam 早就畫好了）

`packages/drama/WRITEUP.md §7` 已明說：
> 「**照抄 `applyTick`。產品替換的是 *planner*（誰動、動什麼），但 **import 同一個 `applyTick`** —— 絕不重寫 transition。**」

也就是說 **domain-neutral（純轉移）↔ domain-specific（planner/內容）的接縫，庫裡早就存在。**
通用化不是重寫，是**沿著這條既有接縫把基質提出來，並在其上定義通用介面**。

### 4.2 三軸分離

```
(a) domain-neutral SUBSTRATE  ── 純確定性環境轉移 + 鏈上身分/承諾/事件匯流排 + 加密記憶 + 監督鉤子
(b) SCENARIO PACK             ── 敘事（春雪社）只是其中一個；虛擬市場、資源賽局、多組織工作流是別的
(c) SAFETY PROBE / METRIC     ── 掛在 trace 上的可插拔偵測器 + benchmark
```

### 4.3 提議的通用介面（**shape，不是 code**；code 另開分支 scaffold）

| 抽象 | 是什麼 | 由現有什麼實例化 |
|---|---|---|
| **Environment** | 純確定性轉移 `(state, actions, cfg) → state'` + 不變式檢查器（守恆）+ metrics/probe 掛點 | `drama.applyTick`、`economy.settleDay` 是兩個現成實例；研究者可寫「市場」「拍賣」「公共財」新 Environment |
| **Agent** | identity（鏈上 cap）+ memory（SEAL namespace）+ **policy**（LLM planner 或 scripted）；policy 提議 typed `Action`，Environment 驗證後結算 | 角色 agent（LLM planner）與 drama driver 的 reactive planner 都已是「policy 提議 Action」的形狀 |
| **Scenario** | `{ N agents + 身分, 資源/目標圖, 互動協定(事件匯流排), 初始記憶/關係, seed, cfg }` | `spring-snow.json` 是一個 Scenario；safety scenario（勾結/壟斷/sybil）是別的 |
| **Probe / Metric** | 掛在 trace（indexer 事件流）上的偵測器 | 現成：flatline/runaway/oscillation、conservation、H1–H6；新增見 §5 |
| **Oversight harness** | overseer（Director/monitor）+ kill switch + intervention API，且**被量測**（能否即時 detect/attribute/intervene） | Showrunner + `/control` + `revoke_all_control` 已備，缺「把監督成效當 metric 量」 |
| **Verifiability layer** | golden-vector + on-chain conformance 紀律**推廣到每個 Environment**；鏈上 identity/commitment 給「誰做了什麼」的 tamper-evident 出處 | `onchain-conformance.test.ts` 是樣板 |

**關鍵差異化**：市面上的多智能體 testbed 幾乎都是**純模擬 sandbox**（市場只是程式裡的變數，沒有真身分、沒有承諾出處）。
我們的 Environment 之上疊著**真的鏈上身分、真的密碼學承諾、真的加密記憶邊界** —— 這是別人 replicate 不了的地基。

### 4.4 資產對位（一眼看清「現有 → 通用角色」）

```
drama.applyTick / economy.settleDay ─────► Environment 實例（純轉移 + 守恆不變式）
runner character-agent / drama planner ──► Agent.policy（提議 typed Action）
character.move OwnerCap/ControlCap ──────► Agent.identity（可撤銷委派）
memwal SEAL namespace ───────────────────► Agent.memory（密碼學隔離）＋ information-boundary probe 的基座
event.move + director.move 事件匯流排 ────► Scenario.interaction protocol
packages/indexer（queryEvents-shaped）───► Trace / observability bus（probe 的資料源）
commitment.move + golden vector ─────────► Verifiability layer（tamper-evident 出處）
saga-director / showrunner + /control ───► Oversight harness（overseer + 介入 + kill switch）
story preset JSON + Scenario.seed ───────► Scenario（敘事只是其一）
```

### 4.5 完全鏈解耦模式 —— 可行性判定（2026-07-24 補）

**問題**：testbed 是否必須帶鏈？**答：不必，可以做——庫內已有四個先例**：`drama`、`economy`、
`troupe`、離線敘事沙盒（§8 引），全是「鏈解耦先行、上鏈 gate-after」紀律的產物。更硬的證據：
`web/.../settlement-harness/fake-chain.ts` 已示範「in-memory 假鏈替換真鏈、保留同一套
BCS/型別/守恆紀律」，並靠它抓到一個真 production bug —— 「純孿生找到部署系統的真 bug」本身
就是 proposal 可引用的一句（雙實作創造驗證價值的證據）。

**逐原語替代表**：

| 原語 | 鏈上實作 | local 純實作 | 現成度 |
|---|---|---|---|
| Identity / 委派 | `OwnerCap`/`ControlCap`（Move 強制） | in-process cap registry：issue/revoke/epoch-bump 同語意，harness 強制 | 語意即 spec，小件 |
| Commitment / 出處 | hash→Walrus→`commitment::commit` | hash-chained append-only log + per-agent ed25519 簽章（`node:crypto`） | 小件 |
| 事件匯流排 / 觀測 | `event.move` + indexer 捕捉 | `MemoryEventStore`（冪等 upsert、queryEvents-shaped）+ 純 `page.ts` | **幾乎現成** |
| per-agent 記憶 | SEAL 加密 + cap-gated 解密 | relayer `InMemoryStore`（三因子召回、per-namespace、零依賴）；要保留密碼學隔離可用本地 per-agent 金鑰（撤銷＝換鑰） | **幾乎現成**（relevance 需 embedding，可退化 importance×recency 或本地 embedder） |
| 世界時間 | `advance_tick` | counter | trivial |
| 守恆不變式 | Move linear types | `conserves()` + Environment invariant checker | **現成** |

**失去 / 得到**：

| 失去 | 得到 |
|---|---|
| 密碼學強制 → harness 強制（harness 成信任基底；所有其他 sandbox 本亦如此） | **`git clone && node --test` 即跑** —— benchmark 採用率的生死線（評審/研究者不會架 Sui） |
| 第三方公開可驗 → 改發佈 hash-chained trace + seed（對 reviewer 反而更好驗） | **速度與規模**：數千 tick/ms vs 單 StorytellerCap 串行簽章 —— **族群規模實驗只有 local 做得到** |
| 「真」sybil 鑄造成本 → 參數化成本（testnet 本非真成本；參數化反而可 sweep） | 避開「crypto gimmick」過敏；去掉 testnet/RPC/SEAL 429/Walrus epoch 營運風險 |

**最強的重新框架 —— 基礎設施作為自變數**：不是二選一，是**基質介面 + 雙後端**
（`local` 預設 / `sui` 錨定模式）。identity/commitment/reputation 於是變成**可 ablate 的實驗變數**：
同一 collusion/sybil scenario，開/關可撤銷委派、開/關承諾錨定，量安全指標的差。這比「焊死在鏈上」
更貼群集 3 原文的「evaluate and **stress-test** the technical primitives」—— testbed 是量測儀器，
鏈是其中一個被量測的實現。on-chain conformance test 的意義隨之升級：證明**同一轉移語意可攜**於
TS 與 Move 兩個實作。

**工作量分界**：
- **新 safety scenario 走 local 後端 = 便宜**：多數積木現成（上表），缺 cap registry + hash-log + 訂閱包裝，皆小件。
- **把春雪社敘事世界整個鏈解耦 = 貴**：真 tick 整合器在 `web/tick-loop.ts`（~1500 行）與鏈讀寫/PTB 深度纏繞。**不必做** —— 敘事世界保留為 chain-backed scenario pack #0，新 scenario 一律 local-first。

**建議**：M1 介面直接以雙後端為前提；benchmark 與 CI 跑 `local`；`sui` 作為「高保證錨定模式」
保留差異化敘事（「原語有經 battle-test 的鏈上實現」），但**不是使用前提**。

---

## 5. Safety Scenario Packs —— 把已「偽裝」在敘事裡的安全現象顯影

戲曲引擎裡其實**已經在跑**好幾個計畫點名的失效模式，只是穿著戲服。顯影 = 換一組 probe 去量它。

| Pack | 對應計畫失效模式 | 已在庫裡的形狀 | 新增 probe |
|---|---|---|---|
| **資源壟斷 / 在位優勢** | destabilizing dynamics | drama 持有者黏性 + capacity-1 資源 → 單一 agent 長期霸佔稀缺席位；沙盒已有「班主介入破壟斷」 | 持有時長 / Gini / 破壟斷介入的成效曲線 |
| **勾結 / 聯盟** | **collusion** | economy **H4「聯盟因果有益」** → 聯盟餓死圈外者 | 聯盟優勢 vs 公平性；圈外者存活率 |
| **欺瞞 / 世界觀分歧** | emergent agency · deception surface | **SEAL 隱私 → 每個 agent 各長一版真相**（沈雪笙/唐桂蘭「封箱」案：同事件兩版私密記憶、皆未外洩） | 信念分歧度、跨 agent 事實一致性、可被利用的資訊不對稱 |
| **Sybil 身分** | security vulnerabilities | `recruit.move` voucher 可鑄多角色 → 對 reputation/economy 的 sybil 攻擊 | sybil 成本 vs 收益、cap+經濟門檻的抗性 |
| **Reputation gaming** | security vulnerabilities | `subscriber_count` / `relationship_seed` 是可被操弄的聲譽訊號 | 刷聲譽的可行性與偵測率 |
| **監督規避** | oversight failure | 角色 agent vs Director 目標張力 | overseer 的 detection latency / 漏檢率 |
| **守恆＝可驗證安全不變式** | value integrity | economy/drama 的 conservation invariant | 把「無中生有＝安全違規」推廣成通用 invariant 檢查器 |

> 這欄的價值：**不是憑空造 scenario，而是證明「這些安全現象在一個 *運作中的* 世界裡自然湧現」** ——
> 比「在乾淨 sandbox 裡人工植入一個 collusion」更有說服力，也更貼近計畫「realistic, reproducible」的用詞。

---

## 6. 分階段路線圖（對齊 1–2 年 + tier）

| 里程碑 | 內容 | 產出 | 對應 tier |
|---|---|---|---|
| **M0 · 現況固化**（大半已完成） | 兩個純核心 + on-chain conformance + indexer 觀測基座 | 已在庫；補一份「testbed 資產清單」= 本文件 | — |
| **M1 · 通用化基質**（~3–4 mo） | 抽出 Environment/Agent/Scenario/Probe 介面（**另開 scaffold 分支**）；把 drama+economy 移到介面後；交付**一個非敘事 scenario**（如極簡虛擬市場）證明題材無關；可重跑 run harness + trace export | 通用介面 + 1 個新 Environment + reproducibility harness | **Tier 1 骨幹** |
| **M2 · Safety probe 套件 + benchmark**（~6–9 mo） | §5 的 3–5 個 safety pack + probe；oversight harness 加 detection/intervention metric；一個小型 benchmark（scenarios + metrics + baselines），沿用 golden-vector/seed 紀律 | probe 套件 + benchmark v0 + baseline 結果 | Tier 1→2 |
| **M3 · 釋出 + 論文**（~3–6 mo） | 開源 testbed + benchmark；一篇論文（「on-chain、可驗證、可重現的多智能體安全 testbed」）；leaderboard | 公開 repo + paper + leaderboard | **Tier 2 收尾** |

**Tier 對照**：
- **Tier 1（≤$300K, 探索/pilot）** = M1 + §5 一個 probe pack。命題：**證明這套基質能通用，且「可驗證身分＋承諾」是新地基**。剛好落在計畫給 Tier 1 的定義（focused technical investigation）。
- **Tier 2（$300K–$1M, ambitious/collaborative）** = M1–M3 全包（testbed + benchmark + oversight），並拉一個學術 host 協作。

---

## 7. 學術 / 「博班緩衝」策略

**把兩件事接起來，不是二選一**：

1. **資格即載體**：計畫「for-profit 只能當 partner」→ **需要學術/非營利 host**。一個 PhD/實驗室掛靠，
   正好把你變成**技術主導 / co-PI**、讓 231-Labs 以 partner 身分進場。於是 grant 的 1–2 年研究 runway
   **同時就是**博班的第一個題目 + 前幾篇論文。**grant 與博班互補、不是替代** —— 這才是真正的「緩衝」：
   用一筆有 deadline、有錢、有 DeepMind/ARIA 背書的題目，換掉「先讀了再說」的機會成本。
2. **可引用的貢獻（differentiation / citable claim）**：現有多智能體安全 testbed 幾乎都是**模擬 sandbox**。
   Endless Story 獨有的組合 —— (a) 真密碼學身分 + 可撤銷委派；(b) tamper-evident 的鏈上行為承諾/出處；
   (c) 密碼學 per-agent 記憶隔離（讓「資訊邊界 / 欺瞞」研究有真地基）；(d) 確定性、可重跑、on-chain-conformant 的核心
   —— **這個交集是新的**，足以撐一篇 testbed/benchmark 論文。
3. **可重現紀律已就位**：golden vector、seeded RNG（no Math.random）、on-chain conformance —— 這些正是
   benchmark 需要、評審會加分的東西。**大多數團隊要從零建，我們已經有。**

---

## 8. 風險與反對意見（先講在前面）

| 風險 | 回應 |
|---|---|
| 「這是娛樂產品，不是安全研究」 | 對外定位徹底換框（英文 positioning doc）；用 §2 的四群集映射 + §5 的失效模式證明**安全現象是原生的**，戲曲只是 scenario pack #0。 |
| 「鏈上是 gimmick」 | 雙後端化解（§4.5）：testbed 預設 `local`、零鏈即跑；鏈降格為「高保證錨定模式」+ 可 ablate 的實驗變數，不構成使用門檻。仍**不主張** LLM 推論的 ZK 驗證等做不到的東西（`NARRATIVE_AGENTS.md §9` 已明列不做）。 |
| 「LLM loop 不可重現，testbed 說服力打折」 | §3 已分層：環境層位元級可重現；policy 層以 trace 重播。這是**誠實的**、也是主流 agent-eval 的通行做法。 |
| 「通用性只是宣稱」 | M1 就是要用一個非敘事 scenario **證明**，不靠嘴。 |
| 「時間到不了 8/8」 | 8/8 前務實目標 = **提案 + 本 testbed 資產清單 + M1 的 scaffold demo**（另分支），不是做完整套。提案賣的是「已運作的地基 + 清楚的通用化路徑」。 |

---

## 9. 這一輪不做 / 下一步

- **本分支（`claude/dev-branch-testbed-plan-qox0vl`）只交付兩份文件**：本 CN 策略 + EN positioning。
- **程式碼 scaffold 另開分支**（依你拍板）：`packages/testbed`（或 `packages/harness`）——
  Environment/Agent/Scenario/Probe 介面 + 把 `drama`/`economy` 包成兩個 Environment 實例 +
  一個**非敘事 minimal-market scenario** 當通用性佐證 + trace export。這是 M1 的頭。
  **介面以雙後端（`local`/`sui`）為前提（§4.5）；scaffold 先只做 `local`。**
- **提案前置**：確認學術/非營利 host（§1/§7）；對照官方 call 校正 §1 的 tier/資格細節。

---

## 附錄 A · 檔案地圖（testbed 視角的最短入口）

| 想看 | 去哪 |
|---|---|
| 純確定性環境轉移（範本） | `packages/drama/src/applyTick.ts`、`packages/economy/src/settle.ts` |
| 失效模式 metrics / ablation 方法學 | `packages/drama/driver/metrics.ts`、`drama/WRITEUP.md §4–5` |
| 假設檢定 H1–H6 | `packages/economy/test/step1.test.ts`、`economy/README.md` |
| on-chain 可驗證性（conformance 樣板） | `packages/drama/test/onchain-conformance.test.ts` |
| 鏈上身分 / 委派 / 撤銷 | `contracts/endless_story/sources/character.move`（`OwnerCap`/`ControlCap`） |
| 承諾 / 出處 | `contracts/endless_story/sources/commitment.move` |
| 事件匯流排 / 觀測 | `contracts/.../event.move`、`director.move`、`packages/indexer` |
| 加密 per-agent 記憶 | `packages/memwal`、`packages/relayer`（`/control` kill switch） |
| 監督 agent / 巡檢 / 護欄 | `packages/runner/.../saga-director/`、`packages/web/src/lib/director/{showrunner,audit,repair,tools}.ts` |
| 真正的 tick 整合器（注意在 web） | `packages/web/src/lib/actions/tick-loop.ts` |
| seedable 世界驅動 | `packages/cli/scripts/world-loop.ts` |

_本檔是活文件；scaffold 分支動工後回填 M1 的實際落點與狀態。_
