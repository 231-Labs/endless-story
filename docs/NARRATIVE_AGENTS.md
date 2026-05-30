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
| 移動 | `scene::move_character` / `character::walk_in_world` | 鏈上有 ✅,**角色 decide 未接** ❌ |
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
**現況**:capability catalog ✅、gazette ✅、push_event ✅。缺 judge 自動收尾 + ImportanceDebt 觸發。

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
- **反思壓縮(sleep)**:把零碎觀察壓成高密度反思 + 遺忘已吸收的 → 防 recall 退化成噪音。
  值得從舊版搬的「機器 idea」(實作 MemWal-native)。**尚未做(N2)**。
- **關係**:導演 relationship_seed → 鏈上 RelationshipSeeded;需建 reader → 注入 prompt +
  餵 ProfileTab(目前 mock)。輕量:per-pair 一句 tone summary,不做完整加權圖。**尚未做(N3)**。
- **夢**:owner 付 ENDLESS → moderator 改寫 → anchor → MemWal remember(kind=dream,i=9)。
  **起始最高,但隨 recency 衰減**(被新記憶逐漸超越)—— 不是永久置頂。✅
- **創世記憶**:mint 時從描述蒸餾,墊底防飄移。✅
- **行當聲口**:`shared/role-traits.ts` 注入所有 prompt。✅

---

## 6. 時間 + 排程 = 自治驅動器

- **兩層時間**:World tick(慢、衰老/經濟)+ Saga partOfDay(燈籠/storylet 篩選);互不強推。✅ 鏈上有。
- **Tick loop(自治的引擎,待建為獨立 process)**:每 tick →
  1) 導演若有 intake → DECIDE+EMIT 2) 每個 active 角色跑 §2 迴圈 3) judge 收尾事件
  4) 推進時間 5) 週期性 reflect(sleep)+ 編公報。
  demo 期可由 SchedulerPanel 手動驅動;最終為獨立 runner CLI setInterval。

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

**到 C 的缺口(依序做,每步 type-check + 不破壞地基)**:

| # | 缺口 | 內容 | 對應 |
|---|---|---|---|
| **N1** | 角色 DECIDE/ACT | 角色 agent:perceive 場景/事件 → decide JSON → 出牌(submit_action)/移動。把出牌從 admin 還給角色。 | §2 ★最高優先,補權責破口 |
| **N2** | 反思壓縮 sleep | recall 近期 → 壓縮高密度反思 → remember+anchor;防 recall 退化 | §5 |
| **N3** | 關係上鏈讀 | RelationshipSeeded reader → 注入 prompt + ProfileTab 去 mock | §5 |
| **N4** | tick loop 自治 | 把 §6 迴圈接成可連續跑(先 admin 驅動,後獨立 CLI) | §6 |
| **N5** | 導演自動化 | judge 自動收尾事件 + ImportanceDebtCrossed 觸發反思 | §3 |
| **N6** | 規劃 Plan | 角色 longTermGoal/subgoals 存 MemWal、每 tick 更新 | §2 |
| 後 | 影片(Seedance)/ 新聞 adapter / 多 saga | 原 proposal R6/R7/R8 | defer |

**順序心法**:N1(角色能動性)→ N2/N3(讓決策有記憶+關係依據)→ N4(串成迴圈)→ N5/N6(導演自動化+規劃)→ 即達 C。

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

---

_本檔是活文件;每完成一個 N 項,更新 §8 狀態。_
