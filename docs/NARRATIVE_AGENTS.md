# Endless Story · 敘事 Agent 架構（唯一設計真相）

> **狀態**：canonical · 2026-05-30 起 · 這份是敘事引擎的**唯一方向文件**。
> **取代**：2026-05-26 的 runner 重寫 proposal、memory `cognition_port_plan`、其餘散落筆記。
> 之後所有敘事層的開發**一律參照本檔**;與本檔衝突的舊文件以本檔為準。

> **北極星**：兩個自治 agent（**Director 導演** + **Character 角色/演員**），做到
> **C 級全自治**（角色自己 perceive→plan→move→act→reflect,世界自己會動）。
> 舊版已達到 C,只是架構混亂;本次是**用乾淨、chain-first、MemWal-native 的方式重建 C**,
> **不是**照搬舊 15k-LOC 實作。權責照 SOTA Director-Actor 切;認知層照 Generative Agents
> 的迴圈,但實作貼合 MemWal(語意 store)而非舊版的本地三因子 store。

---

## 0. 理論依據（一句話）

- **Director-Actor 分解**(IBSEN / Open-Theatre / Co-DIRECT)：集中控制(導演定目標+軟提示)
  + 分散執行(演員自己決策演出)。導演**給提示不給台詞**,演員**創造性詮釋不脫軌**。
- **Generative Agents**(Park 2023)：角色 = Perceive → Retrieve → Plan → Reflect → Act
  + memory stream + reflection tree。
- **敘事悖論的解法**：兩者並存,衝突時角色「自圓其說」(failing believably)。

---

## 1. 兩個 Agent 的權責分界（鐵律）

| | **Director（導演 agent）** | **Character（角色/演員 agent）** |
|---|---|---|
| 是什麼 | 體驗管理者 / experience manager,一個 saga 一隻 | 自治演員,一個角色一隻 |
| **負責** | 目標、環境、開局、分配誰上場、**監看劇情走向、必要時介入重導**、產出**客觀公報** | **感知場景、決策、行動(移動/出牌/發起)、維持人設、自己的記憶+關係、產出主觀 POV、反思** |
| **不可越界** | ❌ 不替角色決定他怎麼演、出哪張牌、移去哪 | ❌ 不脫離導演開的局與目標(可詮釋、可抗拒、但不無視) |
| 溝通方式 | 發**軟事件**(capability)到鏈上,不寫台詞 | **訂閱**鏈上事件 → perceive → 以**鏈上動作**回應 + 產出內容 |
| 觸發 | admin 意圖 / owner 注夢 / 新聞 / ImportanceDebtCrossed | 與自己相關的鏈事件(被召喚、同場、開了牽涉自己的 storylet、被注夢) |
| 模型 tier | 規劃用貴模型(低頻) | 決策用便宜模型(高頻)、POV/反思用貴模型(讀者直接看到) |

**判斷越界的試金石**:凡是「這個角色此刻**做了什麼**(移動、出牌、開口)」→ 角色 agent 的事;
凡是「世界**該往哪推**、**誰**該上場、**今天的客觀大事**」→ 導演 agent 的事。
> ⚠️ 現況破口:出牌(event deal/submit)現在是 admin 手動 = 角色的職權錯置在導演側。本檔的目標就是把它還給角色 agent。

---

## 2. Character Agent — 自治迴圈（核心待建）

每個 tick,對「在 active scene / event 內、或被事件牽涉」的角色跑這個迴圈。
**全部 MemWal-native + chain-first,不抄舊本地 store。**

```
PERCEIVE  讀鏈:我在哪個 scene、同場有誰(scene.current_character_ids)、
          我牽涉的 active event/storylet、被注入的夢、最近相關鏈事件
   ↓
RETRIEVE  MemWal recall(query = 場景+上輪意圖)→ importance 重排 top-K
          (夢 9 > 關係 8 > 反思/創世 7 > 章回 5 > 觀察 4)
   ↓
PLAN      (便宜模型)更新 longTermGoal / dailyPlanHint / openSubgoals
          —— 存成 MemWal kind=plan(i=8),下個 tick recall 回來
   ↓
DECIDE/ACT(便宜模型)從 perceive+retrieve 決定「此刻一件事」,輸出結構化:
          • 出牌  → event::submit_action(從手牌選一張 + intent)        [鏈動作]
          • 移動  → scene::move_character / walk_in_world(去某 scene)   [鏈動作]
          • 發起  → 一句 intent(對白/動作)→ 寫入該 tick 的 perception
          • 不動  → 延續上輪意圖
   ↓
PRODUCE   (貴模型,訂閱者 gate)若有訂閱者 → 寫 POV 章回
          → hash + Walrus + commitment::commit → emit ChapterCommitted
          → MemWal remember(kind=chapter)
   ↓
REFLECT   (sleep,週期性非每 tick)recall 近期 → 壓縮成 1-2 條高密度反思
          (importance 7-9, anchor=true 不被再壓縮)→ remember + reflection::submit
```

**動作空間(角色能對世界做的事)= 鏈上既有 primitives**:
| 動作 | Move call | 狀態 |
|---|---|---|
| 出牌 | `event::submit_action` | 鏈上有 ✅,**角色 decide 未接** ❌ |
| 移動 | `character::move_character` | 鏈上有 ✅,**角色 decideMove 已接 ✅**(tick-loop MOVE,批次 PTB) |
| 寫 POV | `commitment::commit` | ✅ 已接(被動觸發,需改主動) |
| 反思 | `reflection::submit` | ✅ 已接(只 trigger,未做壓縮) |
| 記憶 | MemWal remember/recall | ✅ 已接(加權已做) |

**輸出契約(DECIDE 的 JSON,參照舊版 character-decision 但精簡)**:
```json
{
  "intent": "≤60字第一人稱、此刻一件具體可觀察的事",
  "act": { "kind": "play_card|move|speak|idle",
           "cardIndex?": 0, "targetSceneId?": "0x..", "line?": "對白" },
  "planUpdate?": { "longTermGoal": "", "dailyPlanHint": "", "openSubgoals": [] }
}
```

---

## 3. Director Agent — 迴圈（已大致到位）

```
INTAKE   admin 意圖 / owner 夢 / 新聞(後) / ImportanceDebtCrossed
   ↓
DECIDE   (貴模型, tool-use)挑 1-5 個 capability,只給提示不寫劇情
   ↓
EMIT     director.move 軟事件 + event::push_event(開牌局)
         capability catalog:open_storylet / character_call /
         relationship_seed / attribute_pressure / advance_phase
   ↓
MONITOR  訂閱事件解算、judge 收尾、importance debt 推進
   ↓
NARRATE  gazette compiler(每 narrative day,有事才出)→ 客觀公報
         = 導演敘述側;Walrus + commitment(subject=saga)
```
**現況**:capability catalog ✅、gazette ✅、push_event ✅、**judge 自動收尾 ✅(N5a,在 tick loop)**。缺 ImportanceDebt 觸發(N5b)。

---

## 4. 通訊 = 鏈上事件匯流排(no in-process state, no local json)

導演 emit 軟事件 → 角色 subscribe + 反應。事件分類:
- **導演發**:StoryletOpened / CharacterCalled / RelationshipSeeded / AttributePressureApplied / PhaseAdvanced / BudgetEventPushed
- **角色發**:CharacterMoved / EventActionSubmitted / ChapterCommitted / ReflectionCommitted
- **系統/owner**:DreamInjected / ImportanceDebtCrossed / Subscribed
每個產出都 sign-and-anchor(hash → Walrus → commitment::commit → emit *Committed)。

---

## 5. 認知層(MemWal-native — 三因子已實作,但不抄舊「全量掃描」版）

- **記憶模型**:MemWal 存加密文字,前綴 `[[m|t=<kind>|i=<imp>|d=<敘事日>]]` tag。
  kind ∈ {dream, relationship, reflection, genesis, chapter, observation, plan}。
- **三因子召回(已實作,MemWal-native)** ✅:score = **importance**(tag)× **recency**
  (敘事日衰減,half-life 2 日)× **relevance**(MemWal 向量 distance)。over-fetch 3× →
  三因子重排 top-K。**唯一**跟舊本地 store 的差:只對「語意撈回的候選集」評分、非全量
  掃描(緩解:撈寬 + 必要時定向 recall)。recency 用**敘事日**非牆鐘 → 推進 tick 即衰減、可 demo。
- **自架 relayer = 真·全 namespace 三因子(client 已接好,待部署)**:`packages/relayer`(plaintext-blind,
  存 向量+純量 metadata+Walrus blob id)對**整個 namespace** 算 importance×recency×relevance、回真 top-N,
  取代託管版的「top-K by distance + client 重排」。**client 接線已完成**:remember 送 metadata + 用
  `RememberMeta.embedText` 嵌**去 tag 的原文**(向量不被 tag 污染);recall 在 **`MEMWAL_RELAYER_THREE_FACTOR=1`**
  時只撈 top-N、信 relayer 排序(**少 ~3× SEAL 解密 → recall 快很多**,即使並發=1)。預設關 → 維持託管行為。
  · **部署**:relayer 上自架 VPS(最好跟自架 Walrus publisher/aggregator 同機,relayer→Walrus 走本機),
    web 設 `MEMWAL_SERVER_URL` 指過去 + 開 flag。
  · **⚠️ 認證錯位**:自架 relayer 只認 `RELAYER_SECRET` 的 Bearer,但 client 送的是簽章 header(relayer 不驗)→
    **別設 `RELAYER_SECRET`**(會 401),改用防火牆/CORS 鎖;要 Bearer 得另在 client 加。
- **並發 = 1(SEAL key server 限流)**:`MEMWAL_RECALL_CONCURRENCY` 預設 1,PLAN/POV 串行避開 SEAL 429。
  要放寬 → **自架 SEAL key server**(`MemWalManual` 的 `sealServerConfigs`/`sealThreshold` 可配)+ 自架 Walrus,
  兩者到位才提高並發。**尚未做**;「慢但能跑」可接受,世界本就慢速自治。
- **反思壓縮(sleep)** ✅:把零碎觀察壓成高密度反思 → 防 recall 退化成噪音。**已做(N2)**:
  recall 非 anchored 的 observation/chapter → LLM 壓成 1-2 條 → remember(i=8,tag `a=1`
  排除再壓)→ 上鏈 Reflection。「遺忘已吸收的」採**軟遺忘**(MemWal append-only,無刪除):
  高密度反思 i=8 直接壓過 observation i=4/chapter i=5,加 recency 衰減,零碎記憶自然沉底。
- **關係** ✅:導演 relationship_seed → 鏈上 RelationshipSeeded → reader 聚合成 per-pair tone
  → 注入 decide+POV prompt + 餵 ProfileTab(chain-first 去 mock)。輕量:per-pair 一句 tone,
  不做完整加權圖。**已做(N3)**。屬導演記憶(客觀)→ 角色「感知」到它,但不寫進角色 MemWal。
- **夢**:owner 付 ENDLESS → moderator 改寫 → anchor → MemWal remember(kind=dream,i=9)。
  **起始最高,但隨 recency 衰減**(被新記憶逐漸超越)—— 不是永久置頂。✅
- **入科 induction(自身記憶 + 關係,一次寫)** ✅:角色被種進戲班時,一顆 LLM 同時產出「自身記憶 + 對班底的關係」,墊底防飄移。
  - **newcomer(用戶抽卡)**:`runner/services/induction` runOnce(snapshot →`{selfMemories, ties}`)←`web/.../induct-character.ts`
    (寫私密 selfMemories + 重用 assess 的 idempotent apply 種對稱 ties);`redeem-voucher` 尾端呼叫。預設陌生、只寫初見,
    唯有描述明確點名舊識才寫 prior。
  - **founding(創世班底,mode B)** ✅:saga 主在 admin「創世入口」一次直鑄整班(`character::mint_genesis_character`,免 voucher,
    cap+cap 歸班主),再跑 `runner/services/induction` **runBatchFounding** —— 一次看整批 → 各自 selfMemories + **整張兩兩 prior 關係網**,
    **共同往事只寫一次(雙向對稱)**,修掉 per-character genesis 各編一版會打架的問題(如「桂花糕方向相反」)。
    prompt 內含**爛梗黑名單 + 因果連貫**(出自記憶品質 review)。路徑:`web/.../create-founding-cast.ts` + `FoundingCastPanel`;
    班底背景存 `story preset.founding_cast`。
- **主觀記憶 / 不強制 canon(設計鐵則,刻意保留 — 勿當 bug 修)**:角色私密記憶是**主觀、視角化**的,
  系統**不維護全知統一真相**。因隱私界線,角色入科時只看得到別人的**公開描述**(看不到別人的私密 secret),
  所以 TA 對別人秘密的理解只能**自己長一個版本** → 同一事件,不同角色心裡各有一版(可能互相矛盾、也可能互補成
  層疊真相)。這個錯位**就是戲**,不是資料不一致。**推論**:想讓 A「真的知道」B 的秘密,必須把它**明寫進 A 自己的
  描述/secret**(系統不跨角色洩漏);不寫死就只會長出主觀臆測。日後若要「共享 canon 事實」需另走機制
  (導演種公開事實 / 共同事件),**不可**靠把別人的私密記憶餵進來。
  - **實測案例(白皮書素材 · 2026-06-08)**:班主**沈雪笙**的私密真相是「白蘭遠嫁南洋,從此封箱」。
    後加的衣箱師傅**唐桂蘭** mint 時,其 secret 只暗示「她隱約知道班主為何封箱」。因隱私界線,
    induction 看不到沈雪笙的真實 secret,只憑公開描述,於是替唐桂蘭**自行長出另一版**:封箱那夜她在箱底
    翻出一件染血的白蛇衣,信是班主當年為救戲班被迫委身軍閥所穿,遂縫進襯裡藏了十幾年、從未吐露半字。
    → 同一樁「封箱」,班主心裡是白蘭、唐桂蘭心裡是軍閥;兩版私密記憶**互不知情、皆未外洩**,系統零跨角色
    滲漏即自然產生「視角化真相」。可讀成唐桂蘭的**善意誤解**,或讀成同一危局的**第二層真相**(私情×公難並存)——
    系統不替你裁決,錯位本身就是日後章回的戲。這正是 SEAL/隱私界線「不是缺陷、是敘事引擎」的活證。
- **抽卡 mint = 阻塞式(等畫像好才上鏈)**:畫像 client 端生好 → 烤進 mint tx(NFT 縮圖即時、且**鏈上 = 票卡顯示同一張**)→ 才能按「入班」。
  曾試過「不等畫像、上鏈即蓋章、背景補圖」的非阻塞版,但 `after()` / 背景 server action 在本環境**沒真的背景化**(印章卡在等全部 enrich 跑完),且 server 重生的圖與顯示的不同張 —— 已**回退**。日後要再做非阻塞,需先解決 after() 不背景化的問題,並讓「補上鏈的圖 = 顯示的那張」(前端把自己那張 patch,而非 server 重生)。
  · **創世班底**:先生圖再鑄造,確保不出無頭像的人(見 §2 founding)。
- **創世班底 ≠ 抽卡職缺(避免重複)**:`founding_cast`(preset)= 有名有姓的開班 principals(班主沈雪笙…),由創世入口直鑄;
  `recruitments` = 開放給用戶抽卡的職缺。**創世獨佔的唯一行當(班主/丑/副刊記者)已從 seed 扣掉**,多人行當
  (花旦/小生/刀馬旦/衣箱/龍套/樂師…)保留開放,讓用戶在創世 principals 之上再補人。
- **行當聲口**:`shared/role-traits.ts` 注入所有 prompt。✅
- **導演記憶 ≠ 角色記憶(鐵律)**:角色記憶 = 主觀/私密/per-character(**MemWal,SEAL 加密**)。
  導演記憶 = 客觀/全知/per-saga = **就是鏈上事件日誌**(append-only、不可竄改、神之帳本),
  導演要回想就讀鏈 event log + saga/scene/location 物件。**禁止**把導演記憶塞進角色的 MemWal
  namespace。導演的「綜合記憶」(弧/張力/主題/已做過什麼)= saga 級 reflection,存 `saga_<id>`
  namespace 或鏈上 saga state(屬 N5)。此不對稱剛好對齊存取模型:公報=導演視角=公開;POV/反思=角色視角=私密。

---

## 6. 時間 + 排程 = 自治驅動器

- **兩層時間**:World tick(慢、衰老/經濟)+ Saga partOfDay(燈籠/storylet 篩選);互不強推。✅ 鏈上有。
- **Tick loop(自治的引擎)** ✅ N4:每 tick →
  1) 導演若有 intake → DECIDE+EMIT(仍 admin 驅動,N5 自動化) 2) 每個 active 角色跑 §2 迴圈
  ✅(ACT+POV+REFLECT 已串) 3) judge 收尾事件(N5,未做) 4) 推進時間 ✅ 5) 週期性 reflect
  (sleep)✅ + 編公報 ✅。**已做**:web `runTickLoopAction`(SchedulerPanel 手動驅動 **或**
  cli `world-loop` 無人驅動,經 `/api/tick`)+ judge 自動收尾 ✅(N5a)。**剩**:N5b debt 觸發。

---

## 7. 經濟 / 存取層(已大致到位)

- **訂閱 gate POV**:subscriber_count > 0 才自動生 POV(沒人讀不浪費)。✅
- **公開 vs 私密**:公報公開;POV/反思/夢 owner+訂閱者。✅(見 AGENTS.md 存取模型)
- **分潤**:Saga.revenue_config ownerBps/storytellerBps/treasuryBps。
- **SEAL 託管**:撤銷 ControlCap → 斷記憶存取;差異化證明。✅

---

## 8. 現況 → C 的差距 + 建置順序

**已到位**:event.move / 時間 / 排程殼 / 公報 / 訂閱 gate / **MemWal 三因子召回(importance ×
recency × relevance)+ 注夢衰減** + 創世記憶 + 反思 recall + MemoriesTab(接真 MemWal）+
行當 + SEAL 託管 + capability catalog。
**+ N1 出牌自決 / N2 睡眠壓縮 / N3 關係注入 / N4 自治 tick loop / N5a judge 自動收尾 / N6 規劃 —
即 §2 角色迴圈 PERCEIVE→PLAN→DECIDE/ACT→PRODUCE→REFLECT 全通,世界可一鍵自走一輪(C 級骨架成形)。**

**到 C 的缺口(依序做,每步 type-check + 不破壞地基)**:

| # | 缺口 | 內容 | 對應 |
|---|---|---|---|
| ~~N1~~ ✅ | 角色 DECIDE/ACT | **出牌 ✅**(decideCardPlay→submit_action)+ **移動 ✅**(character-agent decideMove,依 plan+在場者選 stay/move→move_character;tick-loop MOVE phase 批次成一個 PTB)。兩者都由 tick loop 自動驅動。**動作空間補齊。** | §2 補權責破口 |
| ~~N2~~ ✅ | 反思壓縮 sleep | **已做**:recallForConsolidation(撈非 anchored 的 observation/chapter)→ consolidateMemories(primary,壓成 1-2 條)→ remember(kind=reflection,i=8,**a=1 anchored 不再被壓**)→ anchorReflectionText 上鏈。admin ReflectionPanel「睡一覺·整理記憶」。 | §5 |
| ~~N3~~ ✅ | 關係上鏈讀 | **已做**:read.director.listRelationshipEvents → chain/relationships.ts(per-pair tone 聚合,seed 次數→weight)→ facade chain-first(ProfileTab 去 mock)+ fetchRelationshipHints 注入 **decide + POV** prompt。EventPanel 顯示「牽絆 N」。輕量一句 tone,不做加權圖。 | §5 |
| ~~N4~~ ✅ | tick loop 自治 | **已做**:tick-loop.ts `runTickLoopAction` 一鍵跑完整輪:ADVANCE→ACT(開著事件中每個未出牌的參與者自動 decide+submit,讀 resolution.submitted_actions 去重)→PRODUCE(POV)→REFLECT(sleep)→NARRATE(公報)。SchedulerPanel「自治推進一個 tick」。**剩**:獨立 CLI setInterval(可後置)+ judge 自動收尾(N5)。 | §6 |
| **N5** | 導演自動化 | **judge 自動收尾 ✅**(tick loop ACT 後,全員出牌即 resolve_event 收尾)。**剩 N5b**:ImportanceDebtCrossed → 觸發反思(需鏈上 debt 訊號,未做)。 | §3 |
| ~~N6~~ ✅ | 規劃 Plan | **已做**:character-agent/plan.ts updatePlan(承接舊計畫,不重來)→ MemWal kind=plan(i=8)→ recallCurrentPlanText 在 decide+POV 前撈回注入。tick-loop PLAN phase 最先跑。ReflectionPanel「立志」+ SchedulerPanel「含更新規劃」。**至此 §2 迴圈 PERCEIVE→PLAN→DECIDE/ACT→PRODUCE→REFLECT 全通。** | §2 |
| **N7** | Showrunner 自主經營 | 導演從「被動接 intent」升級成「主動巡店」:確定性巡檢補漏 + 劇情健康度評估 + 弧線計畫(director memory)+ admin 對話框。**完整設計見 §12**。 | §12 |
| 後 | 影片(Seedance)/ 新聞 adapter / 多 saga | 原 proposal R6/R7/R8 | defer |

**順序心法**:N1(角色能動性)→ N2/N3(讓決策有記憶+關係依據)→ N4(串成迴圈)→ N5/N6(導演自動化+規劃)→ 即達 C。

> **敘事品質 / 世界生長層(沙盒已驗,待一次性對齊真實代碼)**:N1-N7 解決「迴圈會自己跑」,
> 但**文字夠不夠好看、世界會不會長出新衝突軸**是另一條正交的工作線,已在
> `experiments/novel-lab/sim`(解耦 tick 模擬器,純 Node 零鏈,用真 LLM 跑)中驗證。已驗機制:
> 翻譯層(機制 token→人話才進 prompt)、行當本色卡、結構化代價、定向私帳召回、arcContext 接筆、
> 一致性自檢 lint(`auditProse`)、餘波回 / 溫情戲(非競爭章回)、班主介入(破壟斷)、D5 showrunner
> 開/退標的(世界長新衝突軸)。**這些尚未進真實代碼**——對齊施工圖(每條沙盒機制→真實落點+狀態)
> 見 [experiments/novel-lab/ALIGNMENT.md](../experiments/novel-lab/ALIGNMENT.md);策略是
> 全部先在 sim 驗、最後一次性照表搬。動敘事 craft / 世界推進前先讀那份帳本,別重新摸索。

**剩餘(達 C 後的打磨)**:
- **N5b** ImportanceDebtCrossed → 觸發反思(需鏈上 debt 訊號,可能動 contract)。
- ~~獨立 CLI~~ ✅:`web POST /api/tick`(headless 執行一 tick,選擇性 `TICK_LOOP_SECRET` 鑑權)
  + cli `world-loop` 腳本(`--interval`/`--max`,序列等每 tick 完成,永不重疊)。世界可真正無人驅動。
- ~~手卷 Step 3~~ ✅ 第一人稱飄字:tick-loop 把 decide intent / move reason 寫進 per-scene
  ephemeral cache(`scene-lines.ts`,15-min TTL,記憶體),getSagaLiveSnapshot 優先用它當飄字
  (退回牌名)。飄字從「防守」升級成「我退後半步,手按舊傷」。(持久層仍是 anchored POV/公報。)
- ~~§11 動態出圖~~ ✅ MVP:evolve-portrait(storyteller 觸發,鏈上 image_url 演化 + CharacterImageUpdated
  軌跡)。剩 owner 付費觸發 + 導演自動觸發(動 director.move)+ gallery 時間軸。

**唯一剩下需要動 contract 的**:N5b(ImportanceDebt 觸發反思)+ §11 導演自動觸發出圖。其餘 C 級
功能皆已落地、不需 redeploy。

**效能(已做)**:tick loop 全面 PTB 批次化 —— 出牌/收尾/POV commit/移動各包成一個 PTB(一次簽),
recall-heavy 階段(plan/POV/move 決策)`RECALL_CONCURRENCY=2` 限流避免 SEAL 429;sleep 只在夜裡跑。

### 8b. 敘事方法產品化（2026-06-14，分支 `claude/pear-garden-narrative-pov-5uges4`）

把解耦模擬器（`experiments/novel-lab/sim`）驗證過的寫作方法移植進產品層。**核心紀律：產品層更靈活、少寫死**——自檢資料驅動、行當卡只當隱形守門（不讓角色自報坤生/乾生/俊扮）、不帶測試用的寫死卡司/BONDS。

**已落地（全部零合約改動，只用既有 `commitment::commit` + 讀取）：**

- **章回三態 `ChapterMode`**（`character-worker/prompt.ts`）：共用一套敘事鐵則＋聲音，只換框架——
  `pov`（連載：承上/推進/啟下）、`genesis`（入世序章：前門、無承上、靠人生記憶寫厚）、
  `encounter`（兩人關係戲/溫情：不競爭、潛台詞、只揭一角）。串過 `pov-core` `PovCoreOptions.mode` → runner。
- **敘事自檢**（`runner/services/narrative-audit` + `shared/role-rules` + `shared/to-traditional`）：
  確定性 lint（零成本、可重現、資料驅動）——行當規則由 `roleCraftRules` 對 free-form role 子字串比對
  （未知行當寬容放行）；性別/代詞由 roster 推導（無寫死姓名）；髯口只抓非否定提及；簡→繁正規化。
  生成後跑，違規回饋做一次校正重生。可泛化到全新行當/角色零改規則。
- **厚度召回 `LIFE_QUERY`**（`pov-core`）：除事件召回外多一條「童年/家世/初戀/癖好/心事」人生記憶召回，
  genesis 吃最多、連載 POV 分一點（tick POV 併入 `'life'` 召回），讓章回像「活過的人」而非職務說明。
- **創世序章 → 種子流程（自治）**：`seed-genesis-prologue.ts` 生成＋上鏈每個新角色的入世序章；
  `reconcile-character.ts` 第 7 步，以**鏈上章回清單**冪等（已有章回就跳過，不重鑄）。
- **溫情/關係戲 → tick 迴圈（自治）**：`tick-phases/encounter.ts` `pickEncounterPair` 彈性偵測——
  同場 + 導演牽起的關係 tone（`fetchRelationshipPairs`）→ 每 tick 至多一篇最強對子、同對冷卻；
  經序列 `cutJobs` 背景上鏈，不搶 StorytellerCap。
- **養關係（機制驅動，非導演決策）**：`tick-phases/bond.ts`。一筆被接受的接濟（GIVE）會替那對
  補發一次 `relationship_seed` 加深公開羈絆（該 move 只發事件、無鏈上去重，`count` 累加）。關係圖
  從角色實際行為長出來，`pickEncounterPair` 偏好高 `count` → 常互助的人被關係戲優先選中。
  **設計取捨**：encounter 門檻設 1（入班那筆種子即可觸發，否則自治世界幾乎不會出現關係戲），
  靠養關係累加 count 做「深化羈絆」優先序，而非把門檻拉高到觸發不到。

**待議 / 可擴充（按使用者 2026-06-14 拍板：本輪先驗現有方法，不擴充導演 AI 的主動授權）：**

| 機制 | 內容 | 需合約嗎 | 狀態 |
|---|---|---|---|
| **D3 持有者黏性 + 冷卻** | verdict 計分加 holder bonus + 2-tick 冷卻（破唱片跑步機/鬼打牆）；落在 `act.ts deriveVerdict` / event-planner / spine | ❌ 純鏈下計分 | 🟡 待加 |
| **D5/F1 行使即退場 + 後繼標的** | scarce resource 加 `exercisable`/`successor`，結算 hook 觸發 retire＋下游 instantiate | ❌ **`resource.move` retire/instantiate/release_holder 合約已有**，只缺 TS 接 `director/tools.ts`、開 `TICK_DIRECTOR_RESOURCES` 驗鏈 | 🟡 沙盒已驗·待真模型 |
| **D6 混合制自由文字行動** | verdict 後加一句人設化自由行動文字餵 POV（純文字、不改判決、不上鏈） | ❌ | 🟡 沙盒已驗概念 |
| **導演 LLM 主動經營關係圖** | 讓導演像 showrunner 一樣 in-loop 主動牽線/深化/冷卻關係（非機制、是 AI 決策） | ❌（用既有 `relationshipSeed`） | ⏸ 本輪**刻意不做**（先驗現有方法） |
| **角色主觀羈絆 → 公開 tie 的更多橋** | 目前只用 GIVE 機制橋接；可擴充 SOCIAL 反覆對話/共同經歷升級，或把主觀 relationship memory 強度閾值升格為公開 tie | ❌ | 🟡 可擴充 |
| **養關係冷卻/上限** | count 目前隨互助每 tick 累加（每 tick cap 4 對，但同對跨 tick 仍持續加）；可加 per-pair 冷卻/上限避免膨脹 | ❌ | 🟡 視觀察 |
| **養關係 tone 細分** | 目前固定 `affection`；可依 GIVE 種類/SOCIAL tone 細分 mentorship/romance | ❌ | 🟡 可擴充 |
| **ensemble 楔子 / 餘波 / sequel mode** | 多角色開場楔子、事件餘波回、續作章回；目前 mode 只有 pov/genesis/encounter | ❌ | ⬜ defer |
| **N5b ImportanceDebt → 反思** | 鏈上 debt 訊號觸發反思 | ✅ 動 contract | ⬜ defer |

**驗證清單**：見 [docs/NARRATIVE_QA.md](./NARRATIVE_QA.md)（明天重部署合約後的整套 QA）。

### 8c. 資源爭搶重設計：意圖×能力（2026-06-15，已接進產品）

**問題**：原本 `chooseSettlementWinner` 把資源判給「張力(慾望)最高」的人——**技能與先天屬性完全不參與**（最會唱的不見得拿到唱片）。先前一度把技能接到「抽牌加權」是**錯的層**（只改手牌、不改輸贏）。

**重設計（已用解耦 sim 驗證，`experiments/novel-lab/contest-sim/`）**：
- **意圖(記憶推導的慾望) 閘參與，能力(先天+後天) 閘成敗**：`勝率 ∝ (意圖 + FLOOR) × 能力^γ`。
  - 想搶但搶不起：能力低 → `能力^γ≈0` → 輸；能力夠但不想搶：FLOOR 讓能者偶爾被推上去（臨危受命）。
- **每個資源「靠什麼本事贏」由 ContestSpec 決定**（`lib/chain/contest.ts`）：`{ innate:{先天→權重}, skill:{後天→權重}, abilityGate:γ }`，依資源語意而定（唱片→唱腔、頭牌→台緣、武戲→武場+身段、某人的青眼→外表+心性 但 γ 低＝意圖主導）。
- **確定性、可重現**（無 RNG，對齊鏈上結算）；戲劇變數由意圖隨 tick 變化＋持有者黏性/冷卻產生，不靠亂數。
- 落點：`lib/chain/contest.ts`（純模型）；`event-spine.ts settleEvent` 用 `pickContestWinner`（先天屬性缺失時優雅退回張力版）；`SpineCtx.attrsById` 由 tick-loop 帶入；技能由 role+attrs **重推**（與上鏈種的一致），結算端免讀 skill DOF。**只在 spine 模式結算時生效**（資源結算本就只在那裡），預設敘事 QA 不受影響。
- 新增 `martial:壓軸武戲台口` 資源 → 武行當（連翹）終於有得爭、爭得贏（sim+product 驗證：連翹勝出）。

**LLM 導演動態生成事件時要填的 `contestSpec` 指引**：
```
{ resource:"自由命名",
  innate:{ 先天屬性(appearance/constitution/acuity/disposition)→權重0..1, 只填相關 },
  skill: { 後天技能(vocal/movement/stage_presence/martial/literati/networking)→權重0..1, 只填相關 },
  abilityGate: 1.0–2.5 }  // 硬功型給高(~2)、關係/意圖型給低(~1.2)；意圖不由導演填，從角色記憶算
```
`resolveContestSpec(kind, override)` 已預留 override 入口；目前自治路徑用「依資源 kind 的預設 spec」。

**意圖已行當化（2026-06-15）**：`defaultDesiresForCast` 的慾望 weight 不再均勻——改由 `roleResourceAmbition(role, kind)`（行當→資源 ambition 表，0..1）縮放。weight 線性進 tension（=意圖），所以花旦為頭牌/唱片發燒、幾乎不碰武戲，武旦反之。低 ambition 仍保留為「弱意圖」(想搶但搶不起)，不硬排除，藉 ability 收掉。全鏈路驗證（行當意圖→爭搶名單→能力定勝負）：唱片/頭牌→蘇映雪、搭檔→柳生春、報紙/堂會→何阿喜、武戲→連翹。

**待續**：① 意圖再進一步「從記憶/關係動態推導」（如連翹因心底秘密而特別想要沈雪笙的青眼）——目前是行當靜態 ambition，記憶調變為下一層；② 讓 LLM 導演/Showrunner 真的產 `contestSpec` 並持久化（屬 N7）；③ 持有者黏性+冷卻(D3) 提供額外戲劇變數、破鬼打牆。

---

## 9. 非目標 / 明確不做

- 三因子**已用 MemWal-native 方式做**(不抄舊本地全量掃描版);tellings 結構化八卦傳播暫不做(除非 demo 需要)。
- 不把 MemWal 當可任意查詢的 KV(它是語意 store,認知放 prompt+壓縮)。
- LLM 推論 ZK 驗證、去中心 keeper、real-time chat → 不做。

---

## 10. 檔案地圖(實作落點)

- 角色 agent loop:`packages/runner/src/services/character-agent/`(新,取代/吸收 character-worker)
- 導演:`packages/runner/src/services/saga-director/` ✅
- 反思壓縮:`packages/runner/src/services/reflection-trigger/`(擴充 sleep)
- 認知:`packages/web/src/lib/chain/memory.ts`(加權✅)+ relationships reader(新)
- 動作 SDK:`event::submit_action` / `scene::move_character`(tx wrapper 已有)
- tick loop:`packages/runner/src/`(新 orchestrator)+ web SchedulerPanel(手動驅動)
- 舊版參照(只讀,挑 idea 不照搬):`/Users/harperdelaviga/Endless-Story/packages/runner/src/`
  {decision,memory,sleep,relationships,event-loop}/
- 敘事 craft 沙盒(已驗待對齊):`experiments/novel-lab/sim/`(模擬器)+
  `experiments/novel-lab/ALIGNMENT.md`(沙盒機制 → 真實落點對照帳本,§8 末有摘要)

---

---

## 11. 動態出圖 / AI-native NFT（規劃,排 N6 之後）

NFT 的藝術不是靜態 mint 圖,而是**隨故事生長的肖像變體**,每張上鏈可驗。

- **誰決定出圖**:**導演**(只有它有全知敘事視角判斷「此刻值得出圖」)。
  capability catalog 加 `generate_portrait(character, kind, occasion)`,
  kind ∈ {設定图 / 戲妝 / 老年 / 日常 / …}。
- **誰執行**:獨立 stateless **Image Compiler service**(POV/gazette/video compiler 的兄弟),
  訂閱 `PortraitRequested` → 組 prompt → 出圖 → Walrus → `commitment::commit(subject=character,
  kind=portrait, hint=occasion)` → 更新 character media_assets。**它是 service 不是自治 agent。**
- **一致性鐵律**:每張都 condition on mint 時的 **anchor 形象圖**(chain `image_url`,Walrus 永久錨)
  + physical_facts → 同一個人的不同樣貌,不換臉。(同影片 pipeline 用 portrait 當拍攝指令的招。)
- **雙觸發(對稱注夢)**:① 導演觸發(敘事驅動,訂閱階梯)② owner 付 ENDLESS 客製一張。兩路 → 同一 service。
- **成果**:每張變體 = 一筆鏈上 commitment,可追溯觸發它的事件 → 動態 NFT。出圖貴 → 導演判斷 + 付費/訂閱 gate 控成本。
- **現況**:**MVP 已做** ✅ —— `evolve-portrait.ts`:依同一 physical_facts(同一人)+ 情境
  (戲妝/老年/日常/自訂)出變體 → Walrus → **`update_image_by_storyteller`**(storyteller 觸發,
  **無需動 contract**)→ emit `CharacterImageUpdated` = 動態 NFT 軌跡。admin「動態形象」面板。
  **剩**:owner 付費觸發(`update_image_by_owner`,owner 簽)、PortraitRequested 事件 + 獨立 Image
  Compiler service(導演自動觸發,需動 director.move)、CharacterImageUpdated 時間軸 gallery、
  真 img2img anchor(目前靠 physical_facts 文字維持一致)。

---

## 12. N7 Showrunner — 導演自主經營 saga（定案 2026-06-12）

**動機**:角色側已自治(N1-N6),但導演仍是「admin 給 intent → 單發選 capability」的反應器。
N7 把導演升級成主動經營者:**漏了就補、不好玩就開新張力線、可對話**。
同一個 agentic loop 思想,套在 Director 身上,工具 = 既有 admin server actions。

### 12.0 配套地基:角色生成 validator-repair(Phase 0,最優先)

candidate 生成(`packages/llm/src/prompts/character.ts` + `preview-character.ts`)從單發改成
**生成 → 驗證 → 修復**(最多重試 2 次),根治「性別寫錯 / 筋骨不低卻扶牆喘 / secret 全是狗血」:

1. **確定性檢查(零成本,先跑)**:`body` 枚舉 ↔ 筋骨值對位(≥65 禁「孱弱」、≤35 禁「粗壯」);
   筋骨 ≥55 時 description/secret 禁弱體詞(扶牆/易喘/身子骨弱…);人稱「他/她」↔ physicalFacts.gender
   一致;玩家沒寫的前提下禁暗黑詞(殺/仇家/血債/滅口/被賣…)。
2. **修復**:違規清單附回原 prompt 重生成(「上一版違反了:…,修正並保留其餘」);兩次失敗 → 接受 + log。
3. **prompt 修正**:四軸「數值→敘事」範例改成**高低對稱對**(只有筋骨低範例 = 模型被弱體詞錨定的根因);
   無 requiredGender 時「先從玩家原文推斷性別並鎖定,全篇人稱一致」;secret 加 2-3 個正面少樣本。

### 12.1 工具註冊表(tool registry)

`packages/runner/src/services/saga-director/tools.ts`:名稱 + zod schema + 級別 + 對應 server action。
同一份餵 LLM tools 參數 + 執行器。admin 面 ~52 capability 中約 30 個是乾淨 server action,分四級:

| 級別 | 範例 | 政策 |
|---|---|---|
| 讀 | getSagaLive / getSceneDetail / 世界時間 / 經濟快照 / listRecruitments | 無限制 |
| 敘事寫 | reconcileCharacter / runPov / capability catalog(open_storylet…)/ compileGazette / evolvePortrait / rememberDream | 自主執行;鏈上寫先 dryRun 再實發;全部進 audit log |
| 配置寫 | faucet/dream 價格、custody 收放、recruitment 增刪 | 需 admin 在對話框確認才執行 |
| 危險 | runCliScriptAction(deploy/reset) | **不給 agent** |

`withAdminLock()` 序列化鎖與 Showrunner 工具呼叫天然相容(串行)。

### 12.2 心跳迴圈(每敘事日一次,world-loop 觸發)

```
OBSERVE   saga 快照:世界時間/開放事件/最近公報/經濟/名冊
AUDIT     確定性巡檢(純程式,不用 LLM):缺肖像/views/persona/記憶的角色(reconcile 檢查現成)、
          卡住 N tick 的事件、沒活動的場景、未滿徵召、快到期 Walrus blob → issues list
EVALUATE  貴模型讀最近 K 期 gazette + drama beats,對照弧線計畫評分:張力夠嗎?停滯?該收哪條線、開什麼新張力線?
PLAN/ACT  tool-use 迴圈(上限 M 次):補漏(reconcile…)/ 開新弧線(既有 capability)/ 更新弧線計畫
REPORT    導演日誌(admin 可見):看到什麼、做了什麼、下一步
```

**關鍵分工:「發現」交給程式(AUDIT),LLM 只決定「要不要做、先做誰」(EVALUATE/ACT)** — 便宜、可靠、可測試。

### 12.3 Director memory = 弧線計畫持久化

namespace `saga_<id>`(即 §5 已規劃的 Director synthetic memory,N5 殘留項):當前主題、進行中張力線、
已埋伏筆、做過什麼。每次心跳讀→更新→寫回;沒有它 agent 每次醒來都失憶、反覆開同樣的線。
**鐵律不變:絕不寫進任何角色的 MemWal namespace。**

### 12.4 對話框(admin DirectorChatPanel)

`/admin` 對話面板 → 同一 agent、同一工具表、同一 director memory:
- **問**(「現在劇情是什麼?」)→ 讀級工具 + 最近公報 + 弧線計畫,便宜模型回答。
- **令**(「我要一條復仇線」)→ INTAKE intent:小事即時 tool-use 執行;大事寫入弧線計畫由下次心跳消化。
- 對話歷史存 director memory → 隔天問「上次叫你做的怎樣了」答得出來。

### 12.5 護欄(必要,非可選)

每次心跳:工具呼叫 ≤ M 次、LLM 花費封頂,超限寫日誌收工。鏈上寫一律先 dryRun。
既有 RUNNER_CONTROL_URL 暫停面對 Showrunner 同樣生效。每個工具呼叫進 audit log,導演日誌可追溯。

### 12.6 技術選型

**自建迴圈於 packages/runner**(不引入 Claude Agent SDK):已有多供應商 LLM client(Z.AI/Poe/Anthropic
fallback)+ capability dispatch 雛形,所需只是有上限的 tool-use while 迴圈(~200 行)。導演 = 貴模型低頻,
成本可控。若日後對話框要做深(session 管理)再評估 Agent SDK。

### 12.7 實作順序

| Phase | 內容 | 狀態 |
|---|---|---|
| 0 | §12.0 角色生成 validator-repair + prompt 修正 | ✅ 2026-06-12 |
| 1 | §12.1 工具註冊表 + §12.2 AUDIT 確定性巡檢 + 自動補漏 | ✅ 2026-06-12 |
| 2 | §12.2 完整心跳 + §12.3 director memory + 導演日誌 | ✅ 2026-06-12 |
| 3 | §12.4 對話框 | ✅ 2026-06-12 |

### 12.8 檔案落點（已實作）

- 角色生成驗證:`packages/llm/src/prompts/character-validate.ts`(確定性檢查+修復訊息)
  + `preview-character.ts`(generate→verify→repair 迴圈,1+2 輪) + prompt 逐軸擲值指令(`character.ts`)
- 工具註冊表:`packages/web/src/lib/director/tools.ts`(read/narrative/config 分級;JSON-action 協定,
  provider-agnostic)。現有工具:get_world_time / get_saga_live / list_recruitments / run_world_audit /
  read_recent_gazettes / get_runner_state(讀)+ reconcile_character / reconcile_saga /
  direct_capabilities / compile_gazette / update_arc_plan / evolve_portrait /
  set_runner_paused(敘事寫;世界總開關——注意暫停 runner 後心跳也停,恢復靠 admin 或對話)
- 巡檢:`lib/director/audit.ts`(角色缺漏鏡像 reconcile 檢查、事件卡住/進行中、空場景、徵召)
  + `repair.ts`(機械補漏,有上限)+ action `world-audit.ts`
- 心跳:`lib/director/showrunner.ts` + action `showrunner.ts` + `POST /api/showrunner`
  (TICK_LOOP_SECRET 鑑權,序列化)。world-loop `--showrunner-every=N` / env `SHOWRUNNER_EVERY_TICKS`
- director memory:`lib/director/memory-store.ts` → `web/data/director-memory.json`
  (弧線計畫+導演日誌+對話;之後可換 MemWal `saga_<id>`,介面已收斂)
- 對話:`lib/director/chat.ts` + action `director-chat.ts`,面板在 `/admin`(駕駛艙)

**admin IA(2026-06-12 重組)**:後台從「操作台」轉為「監督台」——
`/admin` 駕駛艙(Showrunner 對話+心跳+runner 總開關)· `/admin/troupe` 劇團(對帳+角色工坊+託管)·
`/admin/stage` 戲台(手動敘事 override:創世班底/導演意圖/時間/排程/公報/合本/反思/事件除錯)·
`/admin/recruitments` 徵召 · `/admin/deploy` 系統(部署+Faucet+注夢+工具入口)· `/admin/assets` 資產。
舊 `/admin/director`、`/admin/showrunner` redirect;panel 元件仍住 `admin/director/` 目錄跨路由引用。
Prompt Lab 自 tabs 移除(實驗工具),入口在系統頁。

---

_本檔是活文件;每完成一個 N 項,更新 §8 狀態。_
