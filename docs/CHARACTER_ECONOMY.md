# 角色經濟 Life Cycle — 設計與驗證

> **狀態**：機制設計已用純模擬 harness（`packages/economy`）**學術驗證通過**（12/12 測試綠、6 假說全成立、收支守恆逐日成立、tsc clean）。**產品化（Part D）為 gate-after：須 owner 認可後另起。**
> **分支**：`feat/character-economy`。
> **關係**：這是 `docs/NARRATIVE_AGENTS.md` §7「經濟層」的展開。沿用 `docs/DRAMA_ENGINE_BRIEF.md` 的鐵律：**先純 TS simulator 驗證 → 同一 transition 模組移植進產品，不重寫**。

---

## 0. 為什麼 + 決策彙總

web 人物頁「日常開銷」欄（現銀/每日開銷/班中俸/可撐日數）目前是寫死 placeholder（`packages/web/src/lib/chain/character-read.ts` survival 區塊填 0）。本設計把它變成一套真實的角色經濟生命週期：

- **MemWal 記憶 append-only、永不刪**（`packages/memwal/src/manual.ts` 只有 remember、無 delete；軟遺忘只靠 importance 衰減 + recency 半衰期把舊記憶在召回集擠下去，bytes 永不消失）→ 記憶單調成長 → 儲存開銷只增不減。但記憶越多＝歷史厚度越深＝理應能寫更好故事、養更多訂閱者。**記憶量與年齡是同一條軸。**
- 全站單一幣 **Endless（包裝穩定幣，`currency.move`，6 位小數）**。角色靠**職業薪餉**賺 Endless 養自己；營運好者靠訂閱自養、對 owner 打平、更強者幫 owner 賺錢。
- 「Endless 不足（敘事＝健康/經濟惡化）× 年齡」× **資源競爭** × **死亡退場** ＝ 完整 life cycle。

| # | 決策 | 內容 |
|---|---|---|
| ① | 記憶量 | 真實計數器（off-chain index），非年齡代理 |
| ② | 死亡 | 經濟死 ＋ 年齡死 **雙軌** |
| ③ | 薪餉 | 由 **saga 金庫**發放（既有 `withdraw_from_treasury` rail），政策＝**混合：保底＋訂閱分潤**，**admin 後台可設**、key 在角色行當 tag |
| ④ | 持幣 | 角色 NFT 掛 `Balance<CURRENCY>`，**真實持幣**、可**互轉** → 同盟/包養/借貸/賄賂，接關係系統 |
| ⑤ | 壽限 | **不存壽限欄、隱藏 hazard**：死亡風險隨年齡平滑上升，死期由 vitality 累積**湧現**、不公開上鏈 |
| ⑥ | Owner 挹注 | owner 可**直接挹注 Endless** 到自己角色（獨立於訂閱）→ 養沒讀者但心愛的角色（§5.1，已驗證 H6 養得起） |
| ⑦ | 接濟 skill | 角色間接濟（給/受）做成 **AI 可調用的 skill**（`decideAid`，accept/refuse 皆角色自決），非寫死規則（§5.2） |

---

## 1. 金流總覽（單幣閉環）

```
訂閱者付訂閱費 (subPrice × subscriber_count)
   │  依 Saga.RevenueConfig 分潤
   ├─ owner_bps      → OwnerCap 持有者(IP owner)   [累進 cumulative_revenue]
   ├─ storyteller_bps → 班主 operator
   └─ treasury_bps   → 留在 Saga.treasury ＝ 發薪池
                          │ saga 每敘事日發薪（withdraw_from_treasury，§3 混合政策）
                          ▼
   owner ── 挹注(§5.1) ─▶ 角色 Balance<CURRENCY>（NFT 上 DOF，真實持幣） ◀─▶ 角色間接濟(§5.2 skill)
                          │  扣 dailyCost
                          ▼
                    協議金庫(protocol) ── 付真實基建（AI 推論 / MemWal·Walrus 儲存 / Seal）
```

**收支守恆**（模擬器逐日驗證、Move 須維持）：
```
injected ≡ ownerSink + storytellerSink + protocolSink + sagaTreasury + Σ 角色 balance
```
訂閱者餵 saga → saga 發薪餵角色 → 角色扣 dailyCost 餵協議 → 協議付真實基建帳單；角色間橫向轉帳淨額為 0、不破壞守恆。

---

## 2. 每日開銷 dailyCost（角色 → 協議）

```
dailyCost = C_run · activeFactor + C_mem · memory_count + C_seal · recallCount
```
每結算從角色 Balance 扣 dailyCost 轉入協議金庫（付真實基建）。

| 項 | 對應真實成本 | 常數（顯示值 ENDLESS） | 變數 |
|---|---|---|---|
| `C_run · activeFactor` | AI 推論（LLM token） | `C_run = 6.0` | `activeFactor ∈ {0.3 休眠, 1.0 活躍}` |
| `C_mem · memory_count` | MemWal/Walrus 儲存租金（單調↑） | `C_mem = 0.02` /記憶 | 真實計數器（§6） |
| `C_seal · recallCount` | Seal 解密 + 向量查詢 | `C_seal = 0.25` /召回 | ≈ 4/活躍日，休眠退化為 ~1 |

**訂閱 gate**（呼應 `subscribe.move` POV gate）：`subscriber_count==0 → activeFactor 0.3`（休眠：跑最小 plan/sleep 推論，不跑 POV、recall 退化）；`≥1 → 1.0`。**關鍵：休眠能逃推論費，逃不掉記憶租金**（`C_mem·memory_count` 照扣）→ 冷門角色＝緩慢自然死。

**一生開銷成長**（active=1.0, recall=4；genesis ~5 + 每活躍日 +6 記憶）：

| 在世日 | memory_count | dailyCost |
|---|---|---|
| 0（新生） | 5 | 7.10 |
| 30 | 185 | 10.70 |
| 100 | 605 | 19.10 |
| 180 | 1085 | 28.70 |
| 360（1 敘事年） | 2165 | 50.30 |

隨 memory_count **嚴格單調上升** → 「記憶厚度必須換成讀者」的經濟壓力。

---

## 3. 收入：saga 混合發薪（保底＋訂閱分潤；admin 可設）

訂閱費經 `RevenueConfig{owner_bps, storyteller_bps, treasury_bps}` 分潤後，`treasury_bps` 那份留在 `Saga.treasury` ＝**發薪池**；saga（`StorytellerCap`）每敘事日用既有 **`withdraw_from_treasury`** 把薪餉打進各角色 Balance。

```
sagaInflow = subPrice · Σ subscriber · treasury_bps / 10000        // 這天的發薪池（subPrice=3，建議 bps 20/30/50）
salary_i   = baseFloor_i · attrModifier_i + perfBonus_i
attrModifier_i = clamp(1 + (constitution+appearance+acuity − 150)/300, 0.7, 1.3)   // disposition 不入薪
perfBonus_i = perfPool · subscriber_i / Σ subscriber               // 帶讀者越多分越多
perfPool    = max(0, sagaInflow − Σ baseFloor)
若 sagaInflow < Σ baseFloor → 全班保底按 ratio = sagaInflow/ΣbaseFloor 打折、perfBonus=0   // saga 也要養活全班
```

**行當保底表（saga 預設，班主可調）** — key 在 `role:<名稱>` tag（既有讀法 `roleFromTags()` / `resolveRole()`）：

| 行當群 | baseFloor | | 行當群 | baseFloor |
|---|---|---|---|---|
| 富商/商/東家/金主 | 12 | | 老生/鬚生/老旦 | 7 |
| 花旦/青衣/名伶/坤伶/旦 | 10 | | 小報/記者/文人/報館 | 6 |
| 武小生/武生/武旦/刀馬 | 9 | | 琴師/樂師/場面/文武場 | 5 |
| 小生/文小生 | 8 | | fallback | 7 |

中位 ≈ 8，與 C_run=6 對齊：新生角色（dailyCost≈7.1）微盈、有成長窗口。

**owner 收益**：每結算 `cumulative_revenue += subPrice · subscriber_i · owner_bps/10000`（角色當日幫 owner 賺的）→ owner 可比較「哪隻角色最賺」。

**admin 後台設定**（Part D 實作）：新增鏈上 `SagaPayrollConfig`（mirror 既有 `DreamConfig`/`FaucetConfig` 的 shared-object 模式）存「per-行當保底 + perfPool 參數」；admin 面板 `SalaryPolicyPanel`（複製 `FaucetConfigPanel.tsx` 的 讀 snapshot→form→簽交易→刷新 模式）+ `payroll-config.ts` server action，用 `StorytellerCap` 寫。

---

## 4. 淨流 + runway + SurvivalLevel

`balance` 為真實 Balance（**不可負**）。
```
payable = min(balance + salary, dailyCost)         // 付得出多少付多少
netFlow = salary − dailyCost
runway  = netFlow ≥ 0 → ∞（UI "—"）；否則 floor(balance / −netFlow)
```
| Level | 條件（由上而下取第一命中；insolvent 強制 critical） |
|---|---|
| `healthy` | netFlow>0 且 balance≥30 ENDLESS |
| `stable` | netFlow≥0 或 runway≥14 |
| `low` | netFlow<0 且 7≤runway<14（吃老本） |
| `critical` | netFlow<0 且 runway<7（逼近破產） |

---

## 5. 角色真實持幣 + 兩條入金（決策 ④）

每 Character 掛 `Balance<CURRENCY>` DOF（鍵 `CharacterWalletKey`）。
**入**：mint 安家費 `seedFunds≈56`、每日薪餉（§3）、**owner 挹注（§5.1）**、**角色間接濟收款（§5.2）**。
**出**：dailyCost（→協議）、角色間接濟付款。
**Move Balance 不能為負** → 破產不是「balance<0」，而是「結算時 balance<dailyCost（付不出全額）」（§7）。

### 5.1 Owner 挹注（人類 owner → 自己的角色）

> 動機：一個市井攤販可能沒有讀者（subscriber=0），但他仍是 owner 心愛的角色。**沒讀者 ≠ 該餓死。**

新增 package fn（**OwnerCap 授權**，僅本人能挹注自己的角色）：
```
owner_fund_character(owner_cap: &OwnerCap, character: &mut Character, payment: Coin<CURRENCY>)
   assert owner_cap.character_id == object::id(character)
   balance::join(character_wallet(character), coin::into_balance(payment))
```
**獨立於訂閱**的金流：owner 自己掏錢養角色。web 在 ProfileTab 給 owner 一個「挹注」按鈕（owner-gated，類似既有 faucet drip 的簽 coin → 合約模式）。

**為什麼養得起（已驗證的湧現性質，§10 H6）**：沒讀者的角色被訂閱 gate 壓成**休眠**（activeFactor 0.3、不跑 POV 推論）→ dailyCost 便宜。模擬養兩隻零讀者角色 180 日，owner 每角色每日只燒 **~5.5 ENDLESS**（早期種子撐著≈0，之後隨記憶緩升 ~3→9），**有界、可負擔**。對照：同樣零讀者但無挹注 → 全員餓死。→ **owner 的愛是一條真實有效的續命線**。

life cycle 多一條**「豢養」分支**：被挹注的角色不靠訂閱自養，可長期低活躍存活、緩慢老去（年齡 hazard 仍在，§7），直到 owner 停止挹注（轉回經濟死軌）或壽終。

### 5.2 角色間接濟 ＝ AI 角色可調用的 skill（不是寫死規則）

角色之間能轉 Endless（同盟/包養/借貸/賄賂），但**這要做成角色 agent 的一個動作（skill），由 AI 自決何時給、何時受**，與出牌/移動同構——**不是**導演或寫死規則塞的。

底層 package fn（**ControlCap 授權**＝runner 代角色執行其決策；大額可要 OwnerCap）：
```
transfer_between_characters(control_cap, from_char, to_char, amount, memo_kind)
memo_kind ∈ { gift 餽贈, patronage 包養, loan 借貸, repay 還款, bribe 賄賂, tribute 進貢 }
```

**skill 化（接 §2 角色迴圈 DECIDE/ACT，照抄 `decideCardPlay` 模式）**：
- 新增決策函數 `decideAid()`（runner `character-agent/aid.ts`，鏡像 `decideCardPlay`）：輸入＝自己餘額 + 在場/相關角色處境（誰瀕死、誰是盟友/仇家）+ recalled memories + relationshipHints + planHint；輸出＝`{ doAid, recipientId, amount, memo_kind, reason }`（cheap-tier LLM，JSON）。
- 新增 web action `character-aid.ts`（鏡像 `character-turn.ts`）：讀鏈備選對象 + 餘額 → `decideAid` →（非 decideOnly）提交 `transfer_between_characters`。
- tick-loop 新增 **GIVE phase**（在 ACT 前後，批次成一個 PTB，與 MOVE phase 同模式）。
- **「受濟」也是選擇**：接濟是「提議 → 受方 agent 決定收/拒」。高傲或與對方為仇的角色可**拒絕**施捨（拒絕＝傷和氣、接受＝欠人情）。受方走 `decideAid` 的 accept/refuse 分支。

**接關係系統**（既有 `relationships.ts` tone 聚合）：每筆接濟/拒絕寫成 `kind=observation` 記憶並（由導演或角色反思）影響 tone：gift/patronage→affection/mentorship、loan 逾期→rivalry/estrangement、bribe→tension、拒絕施捨→pride/estrangement。

**經濟壓力 → 主動尋盟**：瀕死可被恩主 patronage 續命 → 報恩/背叛敘事。模擬已證**接濟機制因果有效**（§10 H4：開/關同盟對照組，開啟組死亡顯著更少）。

---

## 6. 真實記憶計數器（off-chain index）

remember 是 off-chain SEAL/Walrus 寫入、不上 PTB；硬把計數推上鏈會憑空製造 7×/日/角色 gas 且仍與 blob 數漂移。故走 **off-chain counter**（與 remember 成功回傳同生命週期，天然一致）：
- 新增 `packages/web/src/lib/chain/memory-counter.ts`（`increment(charId,kind)` / `getMemoryCount(charId)→{total,byKind}`），在 `rememberForCharacter()` 成功後呼叫一次 — **單一窄口，7 個呼叫點自動全覆蓋**。
- `character-read.ts` 讀回 `memory_count` 餵 dailyCost 並掛上 `SurvivalStatus`。

---

## 7. 雙軌死亡 + vitality（氣血）狀態機（決策 ②⑤）

`vitality ∈ [0,100]`，出生 100；`vitality(t) = clamp(vitality(t-1) + recovery − econDamage − ageHazard, 0, 100)`；觸 0 → 死。

**經濟死軌**（破產＝結算時 `balance < dailyCost`，連續計數 `insolventStreak`）：
```
insolvent → streak++; vitality −= ECON_BASE · streak     // ECON_BASE=8（加速衰減，呼應 drama loss-aversion）
solvent   → streak=0;  vitality += recovery（=5/日）
```
滿血→死約需連續破產 5 日（8+16+24+32+40=120>100）→ 約一旬搶救窗口（盟友 patronage 可逆轉）。

**年齡死軌＝隱藏 hazard、不存壽限（決策 ⑤）**：**無 max_age 欄位（連加密的都不存）**。死亡風險隨年齡平滑上升、無硬上限；死期由 vitality 累積**湧現**、不公開：
```
ageNow_years = age_years + livedDays/360                  // age_years 既有、livedDays 由 birth_ms/tick 推
ageHazard    = AGE_K · max(0, ageNow_years − onset)       // AGE_K=3 點/年
onset        = ONSET_BASE ± hiddenVariance(seed_char)     // ONSET_BASE≈55；seed 由 runner 私有(off-chain)，永不上鏈
```
剛過 onset 幾乎不掉，越老每日扣血越重。年輕破產走經濟死、高齡有錢走年齡死、又老又窮最快退場。**沒人能預先算出死期**（onset 私有 + 與經濟交織）。

**死亡觸發**：`vitality ≤ 0` → `mark_dead(character, new_death_record(victim, now, by_event=None, attributed=[]))` — 即 `character.move` 已預留、至今 0 呼叫的**自然死路徑**。需新增薄包裝 `public fun natural_death(admin_cap, character, clock)`（mark_dead 是 package-visible）。死後 `is_dead()` 擋移動/出牌；殘餘 Balance 回流 owner（遺產）；釋放持有資源（§8）。

**狀態機**：

| State | vitality | UI / 敘事 |
|---|---|---|
| ALIVE_HEALTHY | (66,100] | level healthy/stable，正常 |
| ALIVE_STRAINED | (33,66] | level low，疲態/病容（可回血/受援） |
| ALIVE_FAILING | (0,33] | level critical，瀕死獨白、求援/求盟 |
| DEAD | =0 | mark_dead → 卸場、釋放檔期、遺產回流 |

UI：`SurvivalStatus` 加 `vitality`+`vitalityState`，ProfileTab 加「氣血」進度條（復用既有 attribute bar 樣式，綠→黃→紅）。

---

## 8. 資源競爭 + 同盟 = 世代交替

**contested 資源放大器**（復用 `resource.move` capacity-1 contested slot，如「孟雲屏合作檔期」/「當家台柱」）：`h = held_by(resource, char)`；`slotBonus = h>0 ? 1.5 : 1.0` → 放大 baseFloor 與訂閱吸引力。勝者 income↑、vitality 穩、長壽積記憶；敗者失 slot → 老角色記憶租金已高 → 破產 → 經濟死。

**同盟層**（§5 疊上）：集資合保檔期 / 收買對手讓位 / patronage 續命瀕死盟友 → 零和競爭升級成結盟政治（與 relationship tone 互餵）。

**死亡釋放席位**：角色死亡時 SETTLE 在 mark_dead 後對其每個持有資源呼叫既有 `release_holder` → units 回自由池（`free_capacity`↑、守恆維持）→ 後輩下個 DRAMA phase `apply_transfers(from=None)` 搶。

**閉環**：新生搶 slot →（勝者長壽 / 敗者老窮死）→ 死亡釋放席位 + 遺產回流 → 新生再搶。稀缺檔期永遠一個贏家，輸家被記憶租金 + 失溢價慢慢淘汰 —— 戲班「角兒更替」，但同盟可暫時逆天改命。

---

## 9. 完整 life cycle 七階段

用 memory_count / balance / vitality / subscriber_count / 在世敘事日 / 資源持有 / 同盟 界定：

| 階段 | 進入條件 | 經濟特徵 | 敘事 |
|---|---|---|---|
| **出生** | 在世日 0；memory≈5；balance=56；vitality=100；sub=0 | dailyCost≈7；active=0.3 | 新角入班，行頭未穩 |
| **成長** | 在世日 1–~20；memory<120；netFlow≈持平；首訂閱者出現 | 薪餉 > 記憶租金，微盈 | 跑龍套、攢人緣、搶首檔期、拜碼頭結盟 |
| **黃金** | sub 高；持 contested slot；vitality>66；balance 累積 | income≫cost；累進 cumulative_revenue | 當家台柱，恩客如雲，收徒納盟 |
| **老化** | 逼近 onset；memory>600（租金>12/日逼近薪餉）；overAge>0 | dailyCost 被記憶租金推高；ageHazard 啟動 | 名伶遲暮，日見疲態 |
| **衰退** | 失 slot/掉 sub；netFlow<0；runway<14；vitality∈(0,66] | 持續破產 → econDamage；老+窮雙軌夾擊 | 失寵、讓位、吃老本、求恩主 patronage |
| **退場** | vitality≤0 → 自然死；release_holder 釋放檔期；遺產回流 | balance 結清 | 殞落/壽終，席位留與後人，恩怨了結 |

轉移由經濟驅動、非單向：GOLDEN 失 slot 可跌 DECLINE；DECLINE 受 patronage 可回 STRAINED 續命。

---

## 10. 學術驗證結果（Part C — `packages/economy` harness）

純 deterministic 模擬（bigint 定點數，鏡像 `packages/drama`）。`node --test` 12/12 綠、`node packages/economy/driver/report.ts` 全 PASS、`node packages/economy/driver/html-report.ts` 產出圖表報告。常數同 §11。

**不變式（test/core.test.ts）**：① 收支守恆逐日成立（6 情境 × 全日）。② 有界 vitality∈[0,100]、balance≥0。③ 確定性（同輸入 → 逐位元組同輸出；settleDay 不改輸入）。④ 手算 golden vector 精確命中。

**五假說（test/step1.test.ts，全成立）**：

| 假說 | 結果 |
|---|---|
| **H1 存在可養活穩態** | thriving（16 訂閱）整個黃金期 100% healthy、身家由 56 → 1227 ENDLESS。自養＋獲利成立。 |
| **H2 無永生** | starving（0 訂閱）全員經濟死，平均壽命 26 日。**且**延長 horizon 探針顯示：即使 thriving 固定 16 訂閱，200 日仍全健康、300 日開始死、**400 日全滅** → 記憶租金終究碾壓靜態收入，**只有成長中的讀者能無限續命**。 |
| **H3 世代交替** | mixed-cohort（生育＋競爭檔期）維持 ~3–4 在世的穩定族群帶（avgAlive 3.43）跨 320 日，死 28 / 生 26，非全滅亦非永生。 |
| **H4 同盟因果有效** | alliance-on vs off（唯一差別＝是否開 patronage）：on 死亡 0、off 死亡 3，on 執行 50 次救援。轉帳結盟**因果地**降低死亡率。 |
| **H5 無病態** | mixed-cohort 不全滅、財富 gini 0.14（無暴富/全餓）。 |
| **H6 owner 挹注可養活無讀者角色** | vendor（零訂閱、owner 挹注）全員存活、0 經濟死；每角色每日只燒 ~5.5 ENDLESS（休眠 gate → 便宜、隨記憶緩升），180 日共 ~1988 ENDLESS、有界可負擔。對照 starving（零讀者無挹注）全滅。 |

**關鍵發現（寫進機制論述）**：機制**保證死亡**（H2，append-only 記憶租金是無法逃避的熵），同時**獎勵好營運以長黃金期 + 可觀獲利**（H1），讓**同盟成為理性續命策略**（H4），並讓 **owner 能以有界、可負擔的成本豢養心愛但無讀者的角色**（H6）。「靜態好營運仍會老死、唯成長型讀者能續命」正是「記憶厚度 → 讀者 → 收入」這條敘事軸的量化體現；而「沒讀者→休眠→便宜」讓 owner 的愛成為一條獨立於市場的續命線。

---

## 11. 模組拆解（Part B）+ 常數

| 模組 | 路徑 | 職責 | 純度/依賴 |
|---|---|---|---|
| **economy core（唯一真理）** | `packages/economy/src/`（fixed/types/derive/settle/index） | `settleDay()` ＋ derive（dailyCost/salary/vitality/level/lifeStage），bigint 定點數 | **純函式**，無鏈/LLM/I/O；被模擬器與（後）economy.move＋web adapter 共用、**永不重寫** |
| 驗證 harness | `packages/economy/{driver,scenarios,test}/` | runScenario、metrics、report、不變式＋假說測試 | 依 core；離線 |
| on-chain 結算 | `contracts/.../economy.move`（**Part D**） | 協議金庫、per-char Balance DOF、SagaPayrollConfig、transfer、settle、natural_death | 依 character/saga/resource；移植 core |
| web adapter | `packages/web/src/lib/economy/`（**Part D**） | 讀鏈輸入→呼叫 core→寫結果（off-chain 影子 / 鏈上 settle） | 依 core + chain read |
| 記憶計數 | `memory-counter.ts` + 改 `memory.ts`（**Part D**） | off-chain 記憶總數（單窄口 hook） | off-chain store |
| SETTLE phase | 改 `tick-loop.ts` + `settle.ts`（**Part D**） | REFLECT→NARRATE 間日界結算（idempotent，比對 lastSettledDay） | 依 adapter |
| Admin 發薪 UI | `SalaryPolicyPanel.tsx` + `payroll-config.ts`（**Part D**） | 設 SagaPayrollConfig（mirror FaucetConfigPanel） | StorytellerCap |

**依賴鐵律**：結算邏輯只活在 `packages/economy/src`（純），web 與 Move 都是它的 consumer/移植。

**校準常數**（`DEFAULT_ECON`）：`C_run=6, C_mem=0.02, C_seal=0.25, baseFloor 中位 8, subPrice=3, bps 20/30/50, slotBonus=1.5, seedFunds=56, ECON_BASE=8, AGE_K=3, ONSET_BASE≈55, vitRecovery=5`。內部單位：money＝base units（1 ENDLESS=1e6）、vitality＝milli-points、age＝milli-years。

---

## 12. 產品化路線圖（Part D — gate-after，本輪不動）

| # | 改動 | 依賴 |
|---|---|---|
| D1 | `economy.move`：協議金庫 + per-char `Balance` DOF + SagaPayrollConfig + `transfer_between_characters` + **`owner_fund_character`（挹注，OwnerCap-gated）** + settle + `add_owner_revenue`（移植 core，同套常數） | core 已驗證 |
| D2 | `natural_death` 薄包裝 → 既有 `mark_dead(by_event=None)` | character.move |
| D3 | `memory-counter.ts` + 改 `memory.ts`（單窄口計數） | — |
| D4 | web adapter + 改 `character-read.ts`（解除 placeholder，填真 survival） | core |
| D5 | SETTLE phase（`settle.ts` + 改 `tick-loop.ts`，idempotent 日界結算：發薪→扣 cost→更新 vitality→死亡觸發+release_holder） | adapter |
| D6 | 改 `shared/character.ts` `SurvivalStatus`（+memoryCount/memoryRent/vitality/vitalityState/lifeStage）+ 改 `ProfileTab.tsx`（記憶厚度/記憶租金拆項/氣血條/lifeStage） | — |
| D7 | Admin `SalaryPolicyPanel.tsx` + `payroll-config.ts`（mirror FaucetConfig；行當 key 在 role tag） | D1 |
| D8 | **接濟 skill（§5.2）**：runner `character-agent/aid.ts` `decideAid()`（鏡像 `decideCardPlay`）+ web `character-aid.ts` + tick-loop **GIVE phase**（批次 PTB）+ 受方 accept/refuse 分支 + 接濟事件餵 relationship tone | D1 |
| D9 | **挹注 UI（§5.1）**：ProfileTab owner-gated「挹注」按鈕（簽 coin → `owner_fund_character`，mirror faucet drip 模式）+ 顯示豢養狀態/每日燒錢率 | D1, D6 |

**MVP 切點**：D3/D4/D6（off-chain 影子顯示，先讓人物頁有真資料 + life cycle 在 indexer 跑）；鏈上權威（D1/D2/D5/D7/D8/D9）隨後。年齡 hazard 的 hidden onset seed 留 runner off-chain、永不上鏈（決策 ⑤）。derive.ts/settle.ts 純函式可原封移植成 economy.move 結算邏輯（同套常數）。挹注（D9）與接濟（D8）金流在模擬已驗證（H6/H4），合約只需照搬同一筆 Balance 進出。
