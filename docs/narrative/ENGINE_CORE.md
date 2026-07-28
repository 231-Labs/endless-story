# Engine Core — 單一機制核心紀律（single-home rule）

> **狀態**：canonical · 2026-07-12 起。本檔規定「敘事機制寫在哪裡」，終結研究線與生產線
> 各養一份實作的時代。與本檔衝突的舊習慣（把機制寫進 `web/lib/chain`、在實驗 harness
> 裡 fork 一份 core）一律以本檔為準。
>
> **北極星**：**第 300 回還好看。** 每一條機制工作用這個問題過濾：「這會不會讓第 300 回
> 更好看？」過不了的先不做。機制只寫一次、在一個地方演化，是這個北極星唯一撐得起的
> 工程結構——同一份程式碼，實驗跑幾百回驗質變，生產跑同一份給讀者。

## 1. 四個家，各自只放一種東西

| 家 | 放什麼 | 不放什麼 |
|---|---|---|
| **`packages/engine/src/core`** | 一切敘事機制（want、scene-loop、routing、fatigue、box-office…）。純函數/純狀態機，零 I/O、零鏈、零 LLM 呼叫 | prompt、鏈上讀寫、檔案存儲 |
| **`packages/engine`（ports/adapters/tick/session）** | `SceneAgentPort`/`RecallPort`/`ArchivePort`/`ClockPort` 介面、local adapters（fake/JSON/markdown）、`RunnerSceneAgent`（真 LLM delegate）、tick pipeline、WorldState snapshot/restore、`src/session/character-session.ts`（每角色持久 LLM session，key = (sagaId, characterId)，匯出 `@endless-story/engine/session`） | 機制本體（進 core）、web 專屬 wiring |
| **`packages/runner`** | LLM authorship services：prompt 建構與驗證（beat、weave、review、POV、判官）。純 prompt 部分抽 node-clean leaf（如 `beat-prompt.ts`） | 機制數學（進 engine core）、tick 編排 |
| **`packages/web`** | 鏈上 I/O、durable stores（file-store）、server actions、UI。機制一律 `import '@endless-story/engine/core/*'` | 機制實作。`web/lib/chain` 不再新增機制模組 |

實驗 harness（`packages/engine/experiments/*`）驅動**同一個** engine core，經 local
adapters 換掉 LLM/記憶/時鐘。實驗驗過的機制改動 = 生產已經拿到的機制改動，不存在
「沙盒已驗、待對齊真實代碼」的搬運債。

## 2. 判斷歸屬的試金石

- 「這段邏輯換一個題材的 saga 也成立嗎？」成立 → engine core。
- 「這段話是說給 LLM 聽的嗎？」是 → runner（prompt service）。
- 「這段碼碰 fs / chain / env 嗎？」是 → adapter 或 web store，機制部分抽純函數進 core。
- 測試想在 `node --test` 零依賴跑 → 它測的東西必須是 core 或 node-clean leaf。

前例：`spatial-routing` 的拆法（純置放數學在 engine，file-store 皮留在 web）、
`beat-prompt.ts`（純 prompt builder 抽 leaf，runner barrel 維持 tsx-only）。

## 3. 已完成的搬遷（2026-07-26 現況，涵蓋至 PR #202）

`want-core` · `want-rewrite` · `scene-loop` · `scene-routing` · `spatial-routing`（數學）·
`actor-fatigue` · `box-office` 已住進 `engine/src/core`；web 的 `tick-loop` 與 harness
直接 import engine；H3d（bond yearn）已直接落在 engine 單一實作（`core/bond-graph.ts`）。

`core/scene-perception.ts`（beat 層感知邊界：誰聽得到這一句）也是 engine 單一實作，
從結構欄位（`audience` / `addressed`）判定，不從生成的散文反推隱私；`addressed` 指不到人
時 fail closed 退回只有說話者聽見，不廣播。

**散文正則退役（`strictStructured`，PR #202）**：CLI `--strict-structured` 開的是同一份 core
的**研究 profile**，不是另一份引擎。開了以後，授權、物件 mutation、want subject 與 lifecycle、
場景 capability 一律**只讀結構化欄位**；舊的 prose／preset detector 照跑，但只能寫進
`structuredMonitor`，不得改狀態、不得拒絕 proposal、不得觸發 replan。`objectEffects` 缺席
就是「沒有物理變動」，給了無效 effect 仍由 core validator fail closed。旗標關閉時 legacy
路徑原封保留（byte-identical），對照臂因此不必 fork core。

- **心願不再靠 `layer` 字串比對**：legacy 臂拿 `LOVE_LAYER`／`JEALOUS_LAYER` 這類正則去測
  `want.layer`（角色自己寫的散文標籤）；STRICT 改讀語意標籤（`hasWantSemantic`）與
  `WantSubjectRef`（`{ kind:'contract', id }` 這種**穩定機制主體**——散文可以描述它，但永遠
  不能創造它）。`isBondWant`／`pairWantBetween`／`nightPursuit`／`confideWorry` 全部收
  `strictStructured` 參數，兩條路並存在同一份函式裡，不 fork。
- **結構化宣告走 port**：`SceneAgentPort.declareWantSemantics?()` 是 STRICT 限定的選配方法，
  legacy 臂**永不呼叫**（call graph 與位元都不動）。宣告缺席或失敗即 fail closed 成「無語意標籤」，
  並記一筆 monitor warning。
- **影子分歧是 telemetry**：`WorldState.recordStructuredComparison()` 只在
  legacy ≠ structured 時落一筆 `StructuredDivergence`（`domain` 分
  `authorization`／`object`／`scene`／`want`／`economy`／`preset`，同一拍同一 subject 去重，
  故重試不灌水），另有 `recordStructuredWarning()` 與 `recordStructuredBeatEvaluation()`
  記警告與分母。旗標關閉時 `structuredMonitor` 從不初始化。
- **種子跟著結構化走**：`spring-snow.json` 補上場景 `capabilities`（`stage`／`temple`）、
  逐角 `publicly_recognizable`，以及顯式的 `bonds`／`established_pairs`（即使是空陣列）。
  STRICT 下沒有「靠場景名字或人設散文猜」這回事——沒宣告就是沒有，故種子得把預設寫出來。

分類與完整站點盤點見 [`../testbed/MECHANISM_AUDIT.md`](../testbed/MECHANISM_AUDIT.md)、
[`../testbed/PROSE_REGEX_INVENTORY.md`](../testbed/PROSE_REGEX_INVENTORY.md)，邊界設計見
[`../testbed/TESTBED_BOUNDARY.md`](../testbed/TESTBED_BOUNDARY.md)。

**經濟物理（PR #93/#97）** 也落在 core，分兩塊：

- `core/season-economy.ts` — 一季世界的**錢守恆狀態**，存進 `WorldStateData` 故 snapshot/restore/rollback
  連同帳本一起走。它**只**解析持久狀態、把結構化的 `BeatEconomyCommand` 路由進 transition、把買到的
  affordance 施加回世界（物件／飢餓／房租／製作），並依知識範圍投出每角一份 percept——**它不重造任何
  餘額／runway／結算數學**（`ECONOMY_ENGINE_HANDOFF` 不變式），算術一律在 `@endless-story/economy`
  的 `production.ts` + `contract.ts`。LLM 永不碰數字：散文只負責敘事，`BeatEconomyCommand` 才動錢，
  引擎驗證。含契約全生命週期（offer/sign/reject/fill/expire）＋**還價通道**（`contract_counter`：當事人與
  受益帳戶當家可還價，日結算前隔夜答覆）＋**演出物理**（黃昏開鑼、出席決定票房、`depositExternal` 入
  班庫、排戲入帳），把戲班自己的手藝變成世界收入面。
- `core/physical-canon.ts` — beat 層**物件帳本**：只有 durable 改動（拿走／放進／簽／封…）才寫
  `objectEffects`，單純「拿起、翻看」的觸碰不算 mutation；`DURABLE_MUTATION` 用負向後顧
  （`(?<![已既])簽`）讓「已簽妥的契約」這種**完成態描述**是既成 canon 的敘述、不是新的落筆。
  **#202 起這條正則只在 legacy 臂當閘**：開 `strictStructured` 後改由 `objectEffects` 有無定生死，
  正則退居影子偵測器，逐物件記一筆 `object`／`durable-mutation` 分歧就不再有話語權。

**時辰之律隨拍數自導（PR #121）**：`tick.ts` 不再寫死「六個時辰」，改由 `clock.ticksPerDay`
自導——說出真正的拍數（一日 N 拍，`ticksPerDay===6` 才「一拍一時辰」，否則「推移」），並給每一拍
定位「此刻○○，為本日第 X／N 拍，過此還有 M 拍」。這是 world fact percept、不是導演指令；`ticksPerDay≠6`
（如排演卷一日 8 拍）時角色終於不再被「六個時辰」誤導，知道自己那一日的形狀。

**日程規劃（N6）接入引擎 tick（PR #121）**：規劃原本只掛在 web 路徑，現在直接活在 tick pipeline。
`SceneAgentPort.planDay?(PlanDayInput): PlanDayReply | null` 是**選配** port——`RunnerSceneAgent`
實作（呼 `updatePlan`），`FakeSceneAgent` 不實作故排演卷零成本、確定性不變。每夜 `dayEnd` 為每角
重生 `CastMember.plan`（帶今日互動／將臨死線／關係視角／心底事；空字串→保留舊計畫）。計畫餵回兩處：
移動決策的 `standingPlan`、beat prompt 的「你這些日子的打算」——角色不再純反應，會朝目標與季死線佈局。
`world.json` 加選配 `member.plan` 欄，向後相容。

**物件身分第一層：穩定唯一 id ＋ 出身戳（PR #115）**：`WorldObject.origin?`（`WorldObjectOrigin{
runId?, day, tick, source:'season'|'lab' }`）記物件生於何卷／何日拍／季框種下或 lab 置入；season
物件於 seed/reconcile 時蓋 origin（取 clock 值，確定性不破）。web 端物件 id 改 `crypto.randomUUID`
（`lab-obj-<uuid>`），取代原 `Date.now`＋process-local counter（重啟重號、跨卷無意義）。因 fork 是
state 位元複製、resume 只 append-reconcile，唯一 id 在分岔樹內天然穩定——平行世界共享同一物件真身分，
為日後跨世代遺物冊與展出鋪路。

### 3.1 世情物理一波（PR #122–#201，2026-07 下旬）

core 一口氣長出十個新模組，全部照 §2 試金石（純函數/純狀態機、node-clean、
不開旗標或 fake agent 路徑 byte-identical）：

| 模組 | 機制 | 旗標或常駐 |
|---|---|---|
| `livelihood-rhythm.ts` | 行當節律：part-of-day＋做活處/住處 → 一行「此刻本該在哪」軟拉（PULL 非命令）；行當專屬節律由 seed 宣告 | 常駐（#122/#130/#178） |
| `housing.ts` | 房產基座：擁有權（地契 `propertyOwners`）與使用權（實體門鑰 `keyFor`）分立；租約按期生租金帳單（租客→屋主轉帳，守恆不破）、屋主可換鎖逐客 | 常駐（#151/#152/#153） |
| `acquaintance.ts` | 相識分寸：角色不天生識得每人——stranger/acquainted/named 確定性種子、單調遞升，按認得程度稱呼 | `subjectiveNaming` 旗（#155） |
| `skills.ts` | 技藝框架：`Skill[]` 純資料＋`skillStyleHint`；數字永不進 prompt、只發 prose style；登台戲功染產出風格＋抬票房（才華換生計） | 常駐（#142/#145/#146） |
| `renown.ts` | 口碑：公論名頭 `renown`＋私下自視 `selfRegard`（皆 0..1），與錢無關、不碰帳本 | 常駐（#158） |
| `stakes-brief.ts` | 利害簡報：收集**所有**適用利害成多行簡報交 `decideMove` 自行權衡，取代舊單勝出優先級瀑布 | 常駐（#158/#190） |
| `temple-prayer.ts` | 廟願：對神明**說出口**的祈願（願牆 `prayers`，與內心 want 有別）＋還願 fulfilled 閉環；無廟場景的世界完全惰性 | 常駐（#141/#172） |
| `production.ts` | 劇本產出：角色自標提案/入夥/寫本/排練，努力值確定性累加，達 razor 即首演（每 run 一齣） | `emergentProduction` 旗（#123） |
| `incense.ts` | 香火：擁有者影響通道——每角每日一炷，微推**既存** want 熱度 ε＋私密 percept；紅線＝永不創 want、永不碰決定，角色不知香火存在（spec 見 [`../RECRUIT_INCENSE_SPEC.md`](../RECRUIT_INCENSE_SPEC.md)） | 常駐入口，每日上限（#175） |
| `dream.ts` | 注夢：擁有者第二通道——深宵一幅意象入夢（≤60 字），只是意象、永非指令；是否生 want 由角色自讀；每三日一夢、隨時入佇列（路線圖見 [`MORTALITY_AND_DREAMS.md`](./MORTALITY_AND_DREAMS.md)） | 常駐入口（#177/#178） |

**tick 世情動詞**（機制在 `tick.ts` 編排、由 `SceneAgentPort` 選配座席定奪）：叩門/放行
（夜叩心上人門、屋主 `decideAdmit` 隔門定奪，#164）、邀約（`decideInvite` 遞一次性領入，#170）、
借賒有據（`decideLend` 合意才成帳、欠條騎 bills 軌過期生怨，#166）、尋人掛心（`seeking` 持久
掛心＋移動軟拉，#167）、資助搭救（`decideAid`，#148）、贈物暖情（#147）、班主排戲
（`decideRehearsal`，#132）、移動距離成本＋路遇攔截（場景歸區、`transitReact`，#125）、
看客群體（名頭引客→座→票房閉環，#165）、戲佔定檔＋規劃避讓（演出佔黃昏＋入夜兩格，#192）。
**#190 起 叩門/借賒/尋人 三動詞畢業常駐**（旗標已拆）。port 新增的選配方法全部 fail-safe：
fake 不實作即走確定性保守預設（拒/不做），排演卷零成本。

**經濟側同波**：多堂口（#127，各營生實體自有帳與發薪）＋契約託管 Stage A（#129，結構化
銀錢還價＋機械閘真底＋商號當家談判座席 `negotiateCounter`，設計見
[`CONTRACT_ESCROW.md`](./CONTRACT_ESCROW.md)）＋食肆攤販真經濟實體（#134/#140）。

**中途入場（PR #198/#200）**：`preset.ts` 的 `joinCastMember(world, input)` 是**純狀態變異、零 I/O**
的加人術，與開卷建 founding cast 同構（persona/secret/secretSeed/蒸餾恆常自我/state 預設全一致），
故新人除了「沒有過去」外與開卷之人無異：無 want（下一個白日拍的 genesis 補衍）、無情分邊、
`subjectiveNaming` 下對眾人皆面生。**先驗證後變異**是鐵律——場景名、重名、舊誼對象是否在卷、
溫度是否落在 0–1 全先查完才動 `w.cast`，任一項不合則整卷 byte-identical。選配 `ties[]`
（#200）讓新人**帶舊誼入卷**：`tone`/`toneBack` 入 edge、`view`/`viewBack` 入 `relationshipView`、
`warmth` 雙向 `seedBond`、開相識分寸時兩造互設 `named`。兩半都是**作者所寫的主觀**（同
`relationship_views` 紀律），溫度起手同值、不對稱交給戲。記憶種入與「到場天時」是呼叫端的事
（web `lib/lab/join-cast.ts`：genesis 記憶走該卷唯一 recall 實例、到場作一條 public scheduled
event 讓在場者**結構性**得知，不靠操作者私語），engine 本身不碰 I/O。

**仍在 A/B 的旗標**（world 級、預設關、關閉時 byte-identical）。卷架／lab config 上勾得到的
五支：`relationshipFallback` · `emergentProduction` · `heartsCanFade`（情分會淡：LOVE want 久不見面
餓死退場、只記一筆心事不收鑰匙，#183/#184）· `beatPicksWant`（執念自揀：這一拍推哪條 want
由角色自選，帳本跟真實選擇走，#186）· `quietPresence`（惰息存在：獨處無事者省 solo beat、
日終一筆反思整併，#196；#201 起這筆反思以 `eventId='quiet-reflect'` 推進該拍紀錄的 POV
通道並落檔——原本只活在當日 accum、不成章回就隨拍散去，現在從磁碟讀得到）。
另有一支**只由季框開**、lab UI 不暴露的
`subjectiveNaming`（相識分寸，#155）——`manager.ts` 讀 `seasonFrame.subjectiveNaming` 蓋上去，
現由 `spring-snow-open` 與 `spring-snow-market` 兩支季框啟用。

**文筆二階（#179/#182）**：跨場意象窗（`recentBeatsByChar` 滾動緩衝 12 拍）抓反覆意象（tic）
餵回 beat prompt 的動態避用清單；量測與裁決協議見 [`EXPERIMENT_ARMS.md`](./EXPERIMENT_ARMS.md)。
**世界合流**：全旗標共存長跑測（`world-converge-allflags` + `world-longrun`，#149/#169）逐拍驗
決定論與守恆；願望 id 決定論修為世界自帶序號 `wantSeq`（不用 wall-clock）。

角色「能做什麼／還缺什麼」的活清單維護在
[`WANTS_WITHOUT_MECHANISM.md`](./WANTS_WITHOUT_MECHANISM.md)。

## 4. 待搬遷清單（`web/lib/chain` 剩餘機制模組）

搬遷模式一律照 §2：純機制進 core、store/鏈讀寫留 web、測試跟著機制走。

| 模組 | 備註 |
|---|---|
| `contest.ts` | 意圖×能力結算（§8c），純模型，搬遷成本低 |
| `drama-core.ts` / `drama.ts` | 張力引擎核心 vs 鏈上 wiring，先拆再搬。注夢攪動（`applyDreamStirs`，§2.51 劑量語義）住在 `drama-core.ts` 裡，沒有獨立的 `dream-stir.ts`；測試在 `dream-stir.test.ts`，搬遷時跟著 `drama-core` 走 |
| `event-planner.ts` | 導演出牌規劃 |
| `attention-core.ts` | spotlight/注意力 |
| `arc-pressure.ts` / `arc-lifecycle.ts` / `arc-convergence.ts` | 弧線壓力/生命週期 |
| `character-secrets.ts` | 秘密機制（store 部分留 web） |
| `centrality-select.ts` | 選角中心度 |

原則：**不做大爆炸搬遷**。每個模組在下次被實驗或功能碰到時順手搬（碰到 = 搬），
搬完 web 端留 re-export shim 或直接改 import，全 repo type-check + 該包測試綠才算完。

## 4.5 宏觀節奏層（macro rhythm）

微觀層過關之後，一卷 13 拍的診斷指出壞的是宏觀節奏：飢餓成了同質化吸引子、願望只進
不出、月半結帳永遠逼近卻不抵達、支出是機制而收入是台詞。修法全部住在 `src/core`，
一律 opt-in（不給 deck／不給追蹤名單的卷與加這層之前逐位元相同）：

| 模組 | 管什麼 |
|---|---|
| `event-deck.ts` | 事件卡 schema、可打牌集（純函式）、確定性結算、導演決策 log |
| `income-events.ts` | 工錢、按班規分紅（只分留底之上的餘裕）、結帳預告與月半結帳（**引擎不碰任何人的錢**：到日只公開叫帳，免／催／傳由債主座席決定） |
| `standing.ts` | 處境：**純推導、不存欄位**——由 `edges`／`bonds`／`renown` 讀出誰對誰轉冷、賒不賒得到、社會性死亡；另含街談隨照面而淡（`fadeHearsay`） |
| `patronage.ts` | 觀眾注資三管道（買票／買花／打賞）＋花帳與妒火素材 |
| `secret-ledger.ts` | 秘密的持有者／覬覦者／洩漏條件；記者的「發不發」帶死線 |
| `roster-change.ts` | 離班的孤兒資產強制重分配；故人進城（順手叫醒一樁睡著的秘密） |
| `want-lifecycle.ts` | 心事的兩條出場道：`completion` 成立即 resolved、過 `dueDay` 即 foreclosed |
| `background-needs.ts` | 生理需求降級：不具戲劇相關性的餓離場結算，上戲名額封頂 |
| `vitals.ts` | 生命體徵：不可逆事件數／resolved 率／場景熵／收斂與迴圈偵測 |
| `artifacts.ts` | 日記與詩詞，claim 需引用 beat 證據（含帳面漂移閘） |

**兩條後來補上的鐵律**：

1. 外力層可以製造壓力、可以讓後果不可逆，但**不得代替角色做選擇**。月半結帳最初會
   強制扣款，那讓「打死不還」變成演不出來的立場；改成只叫帳、由債主決定聲量之後，
   錢只在角色自己 `repay` 時才動。壓力歸引擎，選擇歸角色，後果歸社會。
2. **後果先問既有機制能不能承。** 第一版替欠帳不還另造了一本口碑帳（mark／知情者
   名單／賒帳撤銷旗標）——能跑，但錯：同一件社會事實變成兩份會漂移的真相。世界本來
   就有關係圖（`edges` 的冷暖、`bonds` 的深淺、`renown` 的名頭），而「別人從此看低
   你」正是它們存在的理由。整本帳刪掉，改成純推導的 `standing.ts`，唯一新增的是
   `chillBond`——因為 `bumpBond` 只會雙向加溫，而交惡是單向的、且必須蝕掉 `peak`，
   否則沒有任何行為能奪走一段已經掙來的交情。**加機制之前，先確認舊機制真的承不住。**

**權責邊界**（§5 鐵律 5 的同一條線，用在外力層上）：卡是宣告式資料，後果由引擎確定性
結算；LLM 導演的職權只有選哪張卡、何時打、對準誰，加上把卡面穿上戲服。導演選了牌面
上沒有的卡一律不採納，指了候選外的人一律丟棄，死線卡不得推遲。每次落牌連同當時的牌面
全集寫進 `directorLog`，重放同一份 log 即重現整卷，模型不必在場。

完整 schema／導演 I/O／追蹤開關／注資指令用法見
[`packages/engine/README.md` 的「宏觀節奏」](../../packages/engine/README.md#宏觀節奏macro-rhythm)。

## 5. 鐵律

1. **機制改兩份 = bug。** 若發現 web 和 engine 有同名機制分歧，engine 為準，web 收斂。
2. **engine core 永遠 node-clean**：`node --test` 零 creds 可跑全部機制測試。
3. **實驗不 fork core**：harness 只能經 ports 注入差異（fake agent、本地 recall、參數）。
   對照組用同一份 core + 不同 flag/參數，不用複製檔案。
4. 生產接線改動照 research-line 規則：**feat/* → dev PR**，research 分支只改實驗/harness。
   （完整版 `RULES.md` 目前只在 `research` 分支上，本分支沒有這個檔，故不放連結。）
5. **散文不是狀態入口**：research profile 的客觀世界只接受結構化 proposal；prose
   divergence 是 telemetry，不是 authority。不要在 adapter、runner 或 web 另造反向 parser。
