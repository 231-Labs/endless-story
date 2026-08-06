# 折子與大拍 — agent 喚醒層設計

> 改曆（[`WORLD_TIME_MIRROR.md`](./WORLD_TIME_MIRROR.md)）給了世界**連續的時間**；
> 喚醒層給角色**連續的在場**。狀態：設計稿，未實作。

## 一、「活著」是什麼

不是常駐計算。每角色一個永遠在跑的 loop 成本上不可行、敘事上也不必要。
「活著」的體感由兩個性質構成：

1. **反應有延遲下限** —— 東家留言、鏈上有事，幾分鐘內世界有回音，不是等下一個整點。
2. **會自己起念** —— 角色能在自己選的時刻行動（「黃昏我去茶樓堵他」），不是只在全員大拍裡被搬演。

兩者都可以用**離散演繹**疊出來——差別只在由什麼驅動。改曆是先決條件：
舊制下拍與拍之間沒有時刻可言，任何拍外行動都無處落款；鏡像時間之後，
任意真實瞬間都是合法的故事時刻。

## 二、三層驅動

| 層 | 驅動 | 名字 | 狀態 |
|----|------|------|------|
| 晝夜基礎律 | 時辰邊界（一日六拍） | **大拍**（正戲） | 已有 |
| 反應式喚醒 | 外來刺激（留言、注夢、鏈事件） | **折子**（幕間小戲） | 本設計 P1 |
| 自主意圖 | want 宣告的時刻（timer） | **起念** | 本設計 P2 |

大拍不變：全員場景、weave、POV、判官、SETTLE、公報——敘事品質的管線留在這裡。
折子是小戲：一兩個角色、一次有界演繹、受限動詞集。世界的呼吸底頻仍是六拍，
即使整天無人打擾，戲照常開鑼。

## 三、什麼是一次折子（wake）

```
wake = (stimuli[], wakeSet ⊆ cast, 落款時刻 = 真實 now) → 一次有界演繹
```

- **wakeSet**：被刺激直接觸及的角色，通常 1 人，至多 2（一對一交會）。
- **動詞集受限**：聽見／回話／記下心事／改一筆 relationship view／一對一短交換。
  **不**開全員場景、不 weave、不 POV、不判官——那些是大拍的事。
- **落款**：鏡像時間下 14:32 的折子落在「民國十五年八月五日 晡時 14:32」，
  與大拍同構（day / bucket 完整），事件 id 走 `d{day}:b{bucket}:w{realMs}`。
- **不動 `current_tick`**：鏈上心跳仍一日六拍——那是曆法的自述
  （`tick_interval_ms = 4h`），折子是拍與拍之間的事，真實毫秒時戳已足以定其位。

## 四、喚醒源

1. **東家留言／注夢**（P1）——既有 `interventionsApi` 佇列就是刺激來源，
   Composer 的「下一個 tick 就會聽見」變成「幾分鐘內就會聽見」。
2. **鏈上事件**（P1）——indexer 已捕事件流；recruit 成立、訂閱、資源提案
   等映射為對相關角色的 stimulus。
3. **演繹波及**（P3，選配）——折子觸及了 wakeSet 之外的角色時，為對方**排一筆
   stimulus**，不直接喚醒（深度 1，絕不級聯）；對方由自己的折子或下一大拍聽見。
4. **起念 timer**（P2）——want 可宣告「某真實時刻我要做某事」，到點喚醒本人。
   排程資料掛在 want 上（want-lifecycle 已有 dueDay 語義，這是它的細粒度延伸）。

## 五之零、機制歸屬（鐵律，鏈解耦）

折子是敘事機制，**機制本體進 `packages/engine`**（core + ports），不安家在
web wiring——與 want、scene loop、fatigue 同一條鐵律（`ENGINE_CORE.md`）：

- engine 新增 **stimulus 佇列與折子演繹**：`StimulusPort`（enqueue/drain）＋
  tick pipeline 的折子入口（一次有界演繹，受限動詞集，走既有
  `SceneAgentPort` 座席）。純機制、零鏈、`now` 可注入。
- **lab 是第一個消費者**（解耦線先行）：UI「戳世界」按鈕／腳本注入 stimulus，
  折子的 `realMs` **記進 `ticks.jsonl`**——重播讀錄下的時刻，確定性不破
  （錄時重播，同 run-manifest 溯源紀律）。
- **鏈側是第二個 wiring**：web `/api/wake` 只是受權入口＋admin 簽名，
  機制不在這裡。

## 五、併發模型：單一寫者

抽象原則：**一個世界任何時刻至多一個演繹在寫**（大拍與折子同隊）。

- lab wiring：run 目錄本就單寫者（`TickFilesystemTransaction`），折子排進
  同一條 run 序列即可。
- 鏈側 wiring：`/api/tick` 既有的 process-wide promise chain（`tickChain`）
  **擴名為 enactChain**，`/api/wake` 與大拍同鏈排隊。折子撞上進行中的大拍
  （可長達 6–8 分鐘）→ 排在其後；承諾是「幾分鐘」不是「幾秒」。
  不需要場景鎖、不需要衝突仲裁——併發被構造性地消滅。
- 鏈側驅動器不新增：world-loop 的 4 小時邊界睡眠改為「睡到邊界，
  **每 N 分鐘醒來巡一次佇列**」。一個序列驅動器，零新併發面。

## 六、合併與預算（成本閘門）

- **Debounce**：同角色 5 分鐘窗內的 stimuli 合併為一次折子（讀者連戳十下
  = 一次演繹收到十句話，不是十次演繹）。
- **預算**：每角色每日折子上限 N（起始建議 4–6）；超出者不丟棄，
  **退化為排到下一大拍**——即今日行為。
- 這給出關鍵的優雅退化性質：**預算設 0 = 完全等於現制**。喚醒層是純增量,
  關掉即回到六拍世界，遷移零風險。

## 六之二、台柱與班底（惰性角色）

每個角色在 seed 宣告一級 **agency tier**，只是預算旋鈕的兩組值，不是兩套程式碼：

| | 台柱（初期 2–4 人） | 班底（其餘） |
|---|---|---|
| 起念（intent timer、日程偏離） | 有 | 無 |
| 主動折子預算 | N（如 4–6/日） | 0 |
| 反應折子（被觸及時回應） | 有 | 有（較小預算） |
| 大拍場景 | 照舊 | 照舊 |

核心公式：**存在是確定性的，認知是事件驅動的。** 班底不是被關掉的 agent，
是「有位置、有姿態、沒被叫到名字的人」——`livelihood-rhythm` 的行當節律
已經零 LLM 地推出「此刻本該在哪」，前台隨時能說「連翹在戲台練功」，
她的認知只在被 wakeSet 觸及或大拍拉進戲時啟動。

## 六之三、活性保底（純事件驅動的安全網）

純事件驅動的失效模式是**無聲死亡**：事件鏈靠「每次演繹排下一個事件」自我
延續，斷一次（結構化輸出缺 `next_check_at`、事件遺失、活動自然結束無後續）
角色即永遠沉默——而發現機制若也是事件驅動的，就沒有東西會發現。

故恢復機制必須是**無條件的笨機制**：每個台柱保底一次晨間規劃喚醒
（大拍的 circadian floor 正是這個保底）。答案是「事件驅動＋晝夜保底」，
不是「純」事件驅動。

## 六之四、Activity：拍與拍之間的存在形狀

演繹的產出不只一句行動，還有一段**有起訖的活動**：

```yaml
activity: { actor, type, location, start_at, expected_end_at,
            participants, interruptibility, status }
```

「持續生活」不是持續生成，是**持續存在於一項活動中**——14:10 到 16:30
她就在排戲，系統不逐分鐘問她要不要繼續。與行當節律分兩層：節律是預設行程
（零 LLM），activity 是 agent 明示的覆寫。中斷（有人闖入、意外、預期結束）
才觸發下一次折子。

演繹的結構化輸出可含 `next_check_at`（agent 參與排自己的未來），引擎驗證
上限並**計入本人折子預算**——否則 agent 每二十分鐘排一次自檢就是自我 DDoS。

## 六之五、Temporal catch-up（停機補算的紀律）

停機恢復時**嚴禁補演**：不得回溯合成停機期間的場景。只允許三件事：

1. 處理停機期間**已排入佇列的外部刺激**（送達的信、鏈事件）——在「現在」聽見。
2. 確定性推進狀態（睡眠完成、活動過期、節律歸位）。
3. 為無事時段生成**一行摘要**（「班子歇了兩日，無事」），入公報不入場景。

到期事件按**事件類型規則**定重要度（0 環境直套／1 規則處理／2 需角色決策／
3 完整場景），不走 LLM 定級——否則補算成本隨停機時長線性爆炸。
2、3 級也只在「現在」演繹，落款當下時刻。

## 七、折子如何匯入正史

1. 折子寫入該角色的持久 session（`engine/session`，key 既有）與其記憶。
2. 下一個大拍的 percept 帶「幕間發生之事」摘要——大拍**聽說**折子，
   不重演它；場景層的因果由大拍管線自然接續。
3. 夜間 REFLECT 統一整併（quiet-reflect 既有），折子與大拍在日終歸於同一筆反思。

`runner/services/character-worker`（單角色 chain-read → LLM → Walrus 錨定）
就是折子 worker 的原型：形狀不變，輸入從「本拍場景」換成「stimuli + session」。

## 八、分期

- **P1 反應式（engine 先行）**：`StimulusPort` + 折子演繹進 engine core、
  debounce + 預算、台柱/班底 tier、percept 匯入；**lab 首發**（戳世界按鈕、
  錄時重播）。體感目標：戳世界，幾分鐘內有回音。
- **P1b 鏈側接線**：`/api/wake`、enactChain、world-loop 巡佇列、
  留言/注夢/鏈事件三源映射為 stimulus。
- **P1.5 前台活性（零 LLM）**：presence 狀態（排戲中/睡眠中，由節律與
  activity 推）、夜間擋信（「柳安春已經睡了，可留信，明早醒來會看到」）、
  今日時間線表面。成本近零、體感極強，可與 P1 並行。
- **P2 起念**：want 宣告時刻 → timer 喚醒本人；activity 模型與
  `next_check_at`。體感目標：角色在你沒看的時候也在過日子。
- **P3 波及與世情動詞**：depth-1 stimulus 傳遞、叩門/放行等動詞進折子。

## 附錄 A、P1-lab 實作規格（定稿）

目標體感：**cinema-lab 一個開關，卷子與現實同刻活著**——鐘面走真時刻、
時辰邊界自動打大拍、戳世界幾十秒內折子回應、離開再回來看到「歇了 N 拍」。

### A1 引擎（機制本體，零鏈、now 可注入）

`ports.ts` 新增（緊鄰 PlanDay 選配 port 的先例）：

```ts
export interface InterludeStimulus {
    id: string;
    characterId: string;
    /** P1：'poke'（實驗者戳）| 'note'（留言）；P1b 鏈側三源再擴。 */
    kind: 'poke' | 'note';
    text: string;
    atRealMs: number;
}
export interface InterludeInput {
    characterId: string;
    name: string;
    /** debounce 窗內合併後的全部刺激。 */
    stimuli: InterludeStimulus[];
    clock: WorldClock;
    /** mirror 世界的日期標籤（民國十五年八月五日）；tick 世界缺省。 */
    dateLabel?: string;
    /** 行當節律「此刻本該在哪」一行（有則附）。 */
    activityHint?: string;
}
export interface InterludeReply {
    /** 聽見後的一句回應（可含動作記述）。 */
    response: string;
    /** 選配：記一筆心事（入長期記憶）。 */
    memoryNote?: string;
}
// SceneAgentPort 選配座席：
interlude?(input: InterludeInput): Promise<InterludeReply | null>;
```

`WorldData` 選配欄位（只加不改名不刪）：`pendingStimuli?`、
`interludeLedger?: Record<charId, { day, count }>`（日變歸零）、
`interludesSinceLastTick?: InterludeRecord[]`。

`src/interlude.ts`（新）：`runInterludes(w, deps, opts)` ——
按角色分組 pendingStimuli；最老刺激齡 ≥ `debounceMs`（預設 60s）才 due；
預算（預設 6/角色/日，鍵在 clock.day）超出者**留佇列給下一大拍**；
呼 `agent.interlude`（座席缺席同樣留給大拍）；`memoryNote` 走
`recall.remember(charId, text, { day })`；紀錄 append 至
`interludesSinceLastTick` 並回傳。`InterludeRecord = { id, characterId,
name, stimuli, response, memoryNote?, realMs, day, partOfDay, tick }`。

tick pipeline：拍首 drain `interludesSinceLastTick` → 涉事角色各得一行
世情 percept（「幕間：…」），drain 後清空——大拍**聽說**折子，不重演。

adapters：`FakeSceneAgent.interlude` 確定性實作（零鑰零費）；
`RunnerSceneAgent.interlude` 走既有 per-character session 一輪，嚴格 JSON。

### A2 lab（第一消費者，錄時重播）

- `run-config`：`timeMode?: 'tick' | 'mirror'`（預設 tick）；
  `interlude?: { debounceMs, dailyBudget }`。
- manager：mirror 卷 → `MirrorClock({ epochRealMs: 卷創建 ms, cfg:
  SPRING_SNOW_MIRROR })`；tick 紀錄加 `realMs?` / `dateLabel?` /
  `skippedBuckets?`（types 只加）；折子另記 `interludes.jsonl`。
  重播讀錄下的時刻，不再取樣牆鐘。
- **活著驅動**：`lab-run.json` 加 `alive?: boolean`；manager 內 per-run
  interval（~45s）查兩件事——大拍 due（現在的 bucket 序 > 上一拍取樣的
  bucket 序 → 排 **1** 拍，跨多界仍 1 拍並記 `skippedBuckets`）、折子 due
  （`runInterludes`）。全部走 manager 既有 run 序列（單寫者）。
  server 重啟後 lazy 重臂：任何觸及 alive 卷的請求即重掛 interval。
- API：control 加 `{action:'alive', on}` 與 `{action:'stimulus',
  characterId, text}`（或獨立 route）。

### A3 UI

- 建卷表單「時間」select：排演拍（預設）／與現實同刻·早百年。
- mirror 卷 run 頁 header：`StoryClock`（reuse `components/StoryClock`）
  ＋日期標籤＋「活著」開關（僅 mirror 卷顯示）。
- 戳世界：選角色＋一句話 → stimulus；折子回應以獨立樣式卡入拍流（標「折子」）。
- catch-up：帶 `skippedBuckets` 的拍前顯示「歇了 N 拍」一行。

### A4 範圍外（防蔓延）

起念 timer（P2）、台柱/班底 tier 欄位（P2——P1 全員可被戳）、
鏈側接線（P1b）、presence 面板進階版、天光日出。

## 附錄 B、P2 實作規格（定稿）

P2 = 起念 + 輕量 activity + 台柱/班底 tier。核心化約：**起念就是自己捎話給
未來的自己**——一枚定時的 stimulus，到點入佇列，走折子全套既有閘門
（預算、單寫者、落款、拍首兜底），不另造第二套機制。

### B1 台柱與班底

- cast 成員加 `agency?: 'principal' | 'ensemble'`（**缺席 = 'ensemble'**：
  惰性是預設，台柱要點名——成本安全）。preset `founding_cast` 同名欄位透傳。
- spring-snow 公開種子：開山三人皆 `principal`（初期 2–4 人之數）；
  後進／班底自然落 ensemble。
- P2 的 tier 只閘一件事：**起念**（followUp）僅台柱可立；被動折子（被捎話）
  全員照舊。

### B2 起念（intent）

- `InterludeReply.followUp?: { inMinutes: number; note: string }` —— 座席在
  折子裡替自己記一樁「稍後要做的事」。引擎驗證：僅 principal；`inMinutes`
  夾 [15, 1440]；`note` ≤ 40 字；**每人至多一枚在途**（新的換舊的——人會
  改主意）。存 `WorldData.pendingIntents?: Array<{ id, characterId,
  dueRealMs, note }>`，id 確定性構造。
- 到點轉刺激：`kind: 'intent'`、`text = note`、`atRealMs = dueRealMs`。
  `InterludeStimulus.kind` 聯集加 `'intent'`。
- **intent 免 debounce**：整組皆 intent 的折子立即 due——debounce 是為合併
  外來連戳而設，起念本來就是排程過的一件事；混組（intent＋外來捎話）走
  一般規則。預算照計（計入本人當日折子上限，防自我 DDoS）。
- 純函數對：`hasDueIntent(w, nowMs)`（peek，driver 判 due 用，不改狀態）／
  `collectDueIntents(w, nowMs)`（取出到期者轉刺激，**只在序列化 job 內呼**）。
- 座席呈現：'intent' 在 prompt 讀作「你先前起的念，此刻到了」；percept 的
  voiceOf 讀作「先前起的念」。

### B3 輕量 activity（明示覆寫節律）

- `InterludeReply.activity?: { what: string; forMinutes?: number }` ——
  夾 `what` ≤ 20 字、`forMinutes` [10, 360] 預設 60。存
  `WorldData.activityByChar?: Record<charId, { what, startRealMs, endRealMs }>`。
- 提示合成在引擎內：在期 activity > 呼叫端 `activityHint`（節律）——
  「activity 是 agent 明示的覆寫，節律是零 LLM 的預設行程」（§六之四）。
- 不限 tier（班底被捎話時也可自陳在做什麼）。過期自然失效，不另清。
- 完整的日程/scheduled_events 引擎**不在 P2**（見 §六之四 全版，另案）。

### B4 lab 接線

- driver 巡佇列的 due 判定加 `hasDueIntent`（peek）；佇列化後由序列化的
  折子 job 先 `collectDueIntents` 再 `runInterludes`——**狀態變更只發生在
  單寫者隊內**。
- live snapshot 帶 `activityByChar` 在期項；捎話下拉的角色名後綴當前
  activity（「柳安春（排戲中）」）。

## 附錄 C、P1b 實作規格（鏈側接線）

（依偵察後定稿——原則不變：機制在 engine，鏈側只做受權入口、三源映射
與排程；enactChain 單寫者；所有演繹落款真實毫秒。）

## 八之二、外部提案評審記錄（婉拒清單）

一份外部設計說明與本設計方向收斂（時間連續、事件喚醒、拒絕 1440 tick、
Activity、catch-up、前台活性——已擇優併入上文）。以下為**明確婉拒**的部分，
記錄理由防止日後重提：

- **世界狀態改存 `world_time`、刪除 `current_tick`**——鏡像時間是透鏡不是
  狀態（存起來就有第二真相源與漂移）；`current_tick` 是鏈上心跳與 provenance
  錨，刪它 = 改合約 + 遷移，零收益。該提案不知道這是鏈上世界。
- **重切六時段為不等長並改名（上午/下午/深夜）**——引擎全部鍵在正典六標籤
  （行當節律、`SHOW_ONSTAGE_PARTS`、夜段集、牌組 `atParts`）；不等長毀掉
  「tickOfDay ≡ bucket index」等式；且晡時/黃昏/入夜才是戲班的話。
- **Python worker + `FOR UPDATE SKIP LOCKED` 多工佇列**——技術棧不符
  （TS monorepo；Postgres 可沿用 indexer 的），且多 worker 併發對「同一角色
  同時在兩個場景」無解——單一寫者鏈才是答案。佇列三原則（持久、冪等、
  append-only）照收，實作走 TS + enactChain。
- **catch-up 例子中的補演**（回溯合成「08:40 班主詢問」場景）——違反其自身
  「不補演每分鐘」原則與本設計「錯過即無事」法則，見六之五的紀律。

## 九、張力（明示不迴避）

- **成本數字未定**：預算 N、debounce 窗、巡佇列間隔都要跑數據再定；
  設計只保證閘門存在且退化優雅。
- **lab 確定性 × 牆鐘**：以**錄時重播**解——現場跑時折子記下 `realMs`
  （入 `ticks.jsonl`），重播讀錄下的時刻不再取樣牆鐘；鏡像時間的 lab 卷
  （選配）同理。確定性與擬真不必二選一。
- **鏈上不記折子**（暫）：與改曆同哲學——ms 時戳已足以回溯定位；
  若日後折子要上鏈存證，事件形狀留待合約下一 rev。
- **一對一交會的對方也在折子預算內**：被動被拉進交會計一次折子，
  防止「用別人的預算演自己的戲」。
