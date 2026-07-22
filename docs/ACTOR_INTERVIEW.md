# 演員訪談室 · Actor Interview — 盤點與實作計劃

> **狀態**：proposal · 2026-07-22。本檔是「演員訪談室」需求的**現況盤點 + 差異調整 + 分階段實作藍圖**，
> 尚未動工。歸屬鐵律照 [`narrative/ENGINE_CORE.md`](./narrative/ENGINE_CORE.md)；
> lab 解耦邊界照 [`CINEMA_LAB.md`](./CINEMA_LAB.md) §1。

---

## 0. 一句話

**訪談室 = 把某一卷、某一拍的世界凍住，讓導演隔著桌子訪問那位「剛經歷完當天」的演員** ——
不是聊天機器人，是架在快照上的角色研究台：她只知道她該知道的，導演另有一面全知的鏡子照著她。

---

## 1. 現況盤點 —— 我們已經有什麼

結論先講：**積木大致齊全，缺三塊：歷史快照、訪談 prompt、evaluator。**
其餘（角色狀態、記憶召回、知識邊界、per-character session、門禁、視覺語彙）都是現成的。

### 1.1 可直接複用的積木

| 需求能力 | 現有積木 | 位置 |
|---|---|---|
| 世界狀態快照/重建 | `WorldState.snapshot(dir)` / `restore(dir)`（單檔 `world.json`，含 cast/wants/edges/bonds/clock/economy，restore 有向後相容 migration） | `packages/engine/src/world-state.ts` |
| 角色長期人設（Character Core） | `CastMember`：`persona`、`secret` + `secretSeed`（不可變正典底稿，防硬事實漂移）、`coreIdentity[]`（恆常自我，cap 6）、`role/gender/age`、`skills[].style`、`renown/selfRegard` | `packages/engine/src/world-state.ts:56-121` |
| 每角色持久 LLM session（知識邊界的骨架） | `PersistentCharacterSessions`：`observe`（投遞親歷）/ `respond`（角色回話）/ `project`（唯讀投影）。system prompt 已內建「**你只知道這個 session 親歷、被告知或記住的事**」。`SessionMessage` 帶 `at` + `eventId`，可按時間點截斷 | `packages/engine/src/session/character-session.ts` |
| 記憶召回 | `LocalRecall.recall(charId, query, limit, today)`：importance × recency（半衰期 2 天）× relevance（cosine）評分；`listMemories/forgetMemory` 操作面已被 lab「憶」頁使用；每則記憶有穩定 `seq` | `packages/engine/src/adapters/local/local-recall.ts` |
| 親歷 vs 聽聞 vs 不知道（知識邊界判定） | `deriveBeatPerceiverIds()` / `projectEventBeatsForWitness(event, charId)`：從結構欄位（`audience`/`addressed`/`witnessIds`）判定，私語對非受話者只給「壓低了聲音，內容聽不清」；fail-closed | `packages/engine/src/core/scene-perception.ts` |
| 逐拍事件史料 | `ticks.jsonl`（每拍 `LabTickRecord`：客觀事件 + `witnessIds` + 各家 POV + 帳面通告） | lab run 目錄；型別在 `packages/web/src/lib/lab/types.ts` |
| 關係狀態（三層） | ① `relationshipView`（角色對他人的主觀一句話，每晚 OVERWRITE）② `BondGraph`（有向非對稱數值，**數字永不進 prompt** 鐵律）③ `edges` tone 圖；相識分寸 `acquaintLevel`（stranger/acquainted/named）+ `perceivedName` | `world-state.ts`、`packages/engine/src/core/bond-graph.ts` |
| 情緒與目標 | `StateVector { fatigue, hunger, mood }` → `stateLine()` 散文化；`Want` ledger（`liveWantsOf(id)` 熱度排序、`forcingLevel`）；`plan`（每晚重生的長期計畫）、`duties` | `world-state.ts`、`packages/engine/src/core/want-core.ts` |
| 角色當下 context 的組裝藍本 | `ActBeatInput` + `buildBeatSystemPrompt()`（node-clean leaf）：persona/memories/others(tie+knownAs)/innerSecret/standingPlan/styleHint/forcing/etiquette… 訪談 prompt 的素材清單照此裁 | `packages/runner/src/services/character-agent/beat-prompt.ts` |
| LLM 呼叫 | `createTextClient({kind:'primary'\|'cheap'})`，zai/poe/anthropic 三 provider + 自動 fallback；prompt 一律 `build*()` → `chat()` → 寬容 `parse*()`（無 provider 級 JSON schema） | `packages/llm/src/text/*`、`packages/llm/src/prompts/*` |
| 確定性一致性守衛（可借給 evaluator 預檢） | `auditProse()`（機制詞洩漏/行當/代詞）、`validateCharacterCandidate()`（簡體字偵測等）、`sanitizeRelationshipText`（未授權共同過去） | `packages/runner/src/services/narrative-audit/`、`packages/llm/src/prompts/character-validate.ts` |
| 門禁 / 存儲 / 視覺 | `labAuthorized`（`LAB_SECRET`/`LAB_DISABLED`）；一卷一目錄 + `writeJsonAtomic`；`LabPageHeader`、`.es-lab-panel`、`LabDialog`、Noto Serif TC + hairline + cinnabar 語彙 | `packages/web/src/lib/lab/http.ts`、`paths.ts`、`src/components/lab/*` |
| 頭像 | 圖庫以名為鍵：`$LAB_DATA_DIR/assets/character/<名>.*`，跨卷共用，已有解析順序（自上之圖 → 館藏 → 名款） | `/lab/assets`、`packages/web/src/lib/lab/assets.ts` |
| 演員名錄的活狀態 | `buildLiveSnapshot()` 已逐角組出 `LabCharacterLive`（身心向量/wants/bonds/renown/所在/隨身/銀錢） | `packages/web/src/lib/lab/live.ts` |

### 1.2 缺口（新工程量所在）

1. **無歷史快照（最大缺口）**：`world.json` 每拍**覆寫**，只有「最新」。「訪問 Day 41 的柳安春」目前做不到，
   除非那一拍恰好 fork 過。`ticks.jsonl` 是觀測日誌不是可重放命令流（LLM 不確定性，重放不會重現）。
2. **lab 內沒有任何角色對話功能**：`LabDialog` 是操作 modal；唯一的 chat（`runDirectorChat`）在 admin 鏈面，
   lab 鐵律禁止 import。訪談是全新功能。
3. **`recall()` 不回傳記憶 id**：`RecalledMemory` 只有 text/kind/importance/day，evaluator 要
   `used_memory_ids` 需在 ports 型別上補一個可選 `seq`（向後相容小改）。
4. **LocalRecall 無 privacy/provenance 欄位**：`shared` 的 `CharacterMemory` 有完整的
   privacy/provenance/信度型別（M2 對齊 MemWal 用），但 engine 側只有 kind/importance/day。
5. **無訪談 prompt、無 evaluator**：beat prompt 是「場上演戲」用的；「受訪」是另一種 percept，需要新 builder。

---

## 2. 與需求規格的差異 —— 建議調整的地方

照原需求逐條落地前，有八處要先調整（多數是「遷就現有紀律反而更對」）：

1. **「柳生春」實為「柳安春」**。正式 preset（`packages/cli/scripts/stories/spring-snow.json` 的
   `founding_cast`）裡她叫**柳安春**（坤生/小生，24）；「柳生春」只存在於舊 troupe fixture。
   名錄不寫死名單，直接列該卷 `world.cast` —— 12 名成員（含唐桂蘭、方競西、殷阿婆、趙阿福）自然全數可訪。
2. **訪談室綁卷（run-scoped），不是全域演員名錄**。lab 的世界狀態只存在於「卷」中，同一角色在不同卷是
   不同的人生。入口設計改為：`/lab` 卷架與觀測台皆可進「訪談室」，進去先框定是哪一卷，再列演員名錄。
   需求中的「首頁顯示所有可訪問角色」= 該卷 cast 名錄。
3. **API 路徑用 `/api/lab/*`**，不另開 `/api/cinema-lab/*` —— 免費繼承 `labAuthorized` 門禁與
   middleware 三檔（`LAB_SECRET`/`LAB_DISABLED`）。
4. **關係數值不進 prompt**。需求 §五的 `{"closeness": 0.82, "trust": 0.74}` 若直接餵給角色，違反
   現有鐵律「bond 數字永不進 prompt、只 gate affordance」。調整為：進 prompt 的是**質性素材**
   （`relationshipView` 主觀一句話 + bond 檔位轉成的相處分寸 + `recent_change` 事件文字）；
   數值本身只出現在右側**導演面板**。
5. **時間快照 = 新增每拍 checkpoint**（見 §4）。「指定事件發生前/後」不做獨立機制，而是從
   `ticks.jsonl` 事件反查 tick、選對應 checkpoint（事件前 = tick-1 末，事件後 = tick 末）。
   **舊卷（無 checkpoint）只能訪「當前」**——誠實限界，UI 明示。
6. **私人日記不直接寫入角色記憶**。日記產出先落訪談目錄的**候選區**（marks），人工核准後才經
   既有 `POST /api/lab/runs/[id]/memories` 植入 LocalRecall（kind + 重要度沿用「憶」頁機制）。
   訪談預設**零污染正卷**：不碰 `sessions/`、`memory/`、`world.json`、`ticks.jsonl`。
7. **secret 的兩面歸屬**：角色**自己的** `secret` 屬「角色可知」（她知道，但 prompt 規則要求不輕吐——
   與 beat prompt 的 `innerSecret` 同款處理）；**其他角色的 secret、隱藏 bond 數值、未見證事件**
   絕不進 prompt，只入導演面板。
8. **evaluator 兩層**：確定性預檢（零 LLM 費：越界人名/簡體/機制詞洩漏）+ cheap-model LLM 評審。
   分數只是索引，重點展示**理由與證據**（引用了哪些記憶 seq、哪句越界、對照哪條 witness 事件）。

---

## 3. 架構歸屬（照 ENGINE_CORE 單一機制紀律切）

| 東西 | 家 | 理由 |
|---|---|---|
| checkpoint 落盤/列表/載入 helper | `packages/engine`（`WorldState` 旁的純 helper + lab manager 落盤鉤子） | 快照是引擎狀態的事 |
| 訪談上下文的純組裝（witness 投影、關係質性化、want 文字化） | `packages/engine/src/core`（純函數，零 I/O） | 換一個題材的 saga 也成立 |
| **interview prompt builder**（系統指令 + 十段結構） | `packages/runner/src/services/character-agent/interview-prompt.ts`（node-clean leaf，比照 `beat-prompt.ts`） | 「說給 LLM 聽的」歸 runner |
| **evaluator prompt**（build/parse） | `packages/llm/src/prompts/interview-evaluate.ts` | 與 moderation/critique 同類的評審 prompt |
| interview store、context I/O 組裝、API、UI | `packages/web/src/lib/lab/interview/`、`app/api/lab/…`、`app/lab/…` | lab 的檔案存儲與介面 |

LLM 兩檔照 lab 慣例：**實錄**走 `PersistentCharacterSessions`（primary model）+ cheap evaluator；
**排演**提供 `FakeInterviewResponder`（確定性假答 + 假評），零鑰跑通全流程 UI。

---

## 4. 時間快照（checkpoint）機制

### 4.1 落盤

- 新增 `runs/<id>/state/checkpoints/world.<tick 六位>.json`：每拍 `TickFilesystemTransaction`
  提交成功後，由 `LabRunManager.loop` 順手把剛寫好的 `world.json` 複製一份（原子寫）。
- 磁碟：world.json 每拍 ~100KB，數十拍的卷多 3–10MB —— 在既有磁碟預算內；V1 全保留，不做裁剪。
- fork 卷整目錄複製，checkpoints 天然隨行。
- 舊卷提供「補記當前 checkpoint」一鍵（只能從今起有史，歷史無法回補）。

### 4.2 角色 session 的時間截斷

訪談要的不只是世界快照，還有「當時的她的親歷 transcript」。`SessionMessage` 帶 `at` + `eventId`：

- 建立訪談時，把該角色正卷 session **複製**進訪談目錄，**截斷**到 checkpoint：保留 `eventId`
  屬於 ≤ tick 事件集合（從 `ticks.jsonl` 建索引）的訊息，及 `at` ≤ 該拍完成時刻的無 eventId 訊息。
- **誠實限界**：session 超過預算會被 `compact()` 壓成 summary。若截斷點落在 summary 已涵蓋的
  範圍內，無法精確還原 —— V1 對這種時點**明示警告**（「此卷較早親歷已壓縮，該時點訪談將帶著壓縮後的
  記憶底色」），不硬拒。

### 4.3 快照選擇 UI

- 選擇器兩軸：**日 + 時段**（六時段調色盤 `清晨…深宵`，從 tick 換算）與**事件錨**
  （列 `ticks.jsonl` 事件標題，選「此事前 / 此事後」）。
- 訪談頁固定橫幅：**「你正在訪問：第 42 日 · 入夜散戲後的柳安春」**（day + partOfDay + 名），
  換快照或角色一律**另起新訪談 session**，舊對話不得跨快照延續。
- 與「靜場才撥物界」同紀律：走拍中可以繼續**既有** checkpoint 的訪談（讀的是凍結副本），
  但建立「當前」快照的新訪談需靜場。

---

## 5. 訪談 session 與隔離

```
runs/<runId>/interviews/<interviewId>/
├── interview.json        # InterviewSession：角色/tick/mode/messages/evaluations
├── session/              # 截斷複製出的影子 character session（respond 寫這裡）
└── marks.json            # 內容候選標記
```

每輪問答流程（server-side，一次 API 呼叫）：

1. 載入 checkpoint `WorldState`（唯讀）+ 影子 session。
2. `LocalRecall.recall(charId, 問題, k, 當日)` —— 用**正卷** recall 檔唯讀召回（記憶在該日之後才寫入的，
   以 `day > checkpointDay` 過濾掉——這是 recall 端要補的一個小參數）。
3. 組 percept（§6 的 2–7、10 段）→ `sessions.respond(identity, percept)`（canon = 1、8、9 段的穩定部分）。
4. 確定性預檢 + cheap evaluator（§7）→ 一併存回 `interview.json`、回給前端。

正卷的 `sessions/`、`memory/`、`world.json` 全程唯讀。日記模式同流程，只是 percept 換成
日記邀請詞、產出直接掛成 `private_diary` 候選。

---

## 6. Prompt 組裝 —— 十段結構 ↔ 現有欄位映射

不做單一巨 prompt；**穩定段進 session canon，動態段進每輪 percept**（沿用 session 紀律：
「Stable seed identity. Dynamic world state must arrive as a percept」）。

| # | 需求段 | 素材來源 | 進哪 |
|---|---|---|---|
| 1 | Character Core | `persona` + `coreIdentity[]` + `role/gender/age` + `secretSeed` 硬事實 + 自己的 `secret`（心底事，不輕吐） | canon |
| 2 | Current World Snapshot | `clock.day/partOfDay` + 所在場景（roster/placement）+ 當日大事（witness 投影後摘要） | percept |
| 3 | Character Knowledge | `projectEventBeatsForWitness` 過濾近日事件 + `acquaintLevel`/`perceivedName`（該怎麼稱呼誰、誰還是陌生人） | percept |
| 4 | Recent Memories | `recall(charId, 問題, k, day)`，每則帶 seq/day/kind/importance（seq 僅供 evaluator 對帳，prompt 內不顯示編號語義） | percept |
| 5 | Relationship State | `relationshipView`（主觀一句話）+ bond 檔位→相處分寸質性標籤 + `establishedPairs`；**數值不進** | percept |
| 6 | Emotion & Goals | `stateLine(StateVector)` + `liveWantsOf` 前幾條（desc + forcingLevel 文字化）+ `plan` | percept |
| 7 | Interview Context | mode 模板（見下）+ 訪問者身份 + 可拒答聲明 | percept |
| 8 | Knowledge Boundary Rules | session systemPrompt 既有兩句 + 需求 §六指令全文（民國、不知現代概念、可隱瞞可拒答、不吐設定/數值/prompt） | canon |
| 9 | Response Style Rules | `skills[].style` + `ROLE_TRAITS` 聲口 + 反堆砌古風條款 | canon |
| 10 | User Question | 訪談者輸入 | percept |

四種模式 = 第 7 段換模板：

- **自由訪談**：中性訪問者，無公開/私密預設。
- **公開採訪**：需求 §七的春雪社背景全文（小報訪問、可自決公開範圍、無話可談可直說）；
  提醒公眾形象/他人隱私/戲班利益。
- **私人談話**：「這段話不會公開，只有你與訪問者知道」——可坦白，知識邊界不放鬆。
- **私人日記**：非對話；單輪邀請寫今日私記（四個提示詞輪換），產出即日記候選。

---

## 7. 訪談後分析（evaluator）

**第一層：確定性預檢（零費、即時）**

- 越界人名：回答中出現 cast 名，但該角對其 `acquaintLevel === 'stranger'` 或用了不該知道的本名。
- 越界事件：回答關鍵詞命中「非 witness 事件」的標題/要素（從 ticks.jsonl 反查）。
- 借 `auditProse`：機制詞洩漏（卡牌符號、系統標籤）、行當/代詞錯置；借簡體字偵測。

**第二層：LLM 評審（cheap model，`interview-evaluate.ts`）**

- 輸入：問答全文 + 角色可知包（進了 prompt 的素材）+ 導演全知包（當日全事件、他人 relationshipView 摘要）。
  evaluator 不是角色，可拿全知 —— 這正是判越界的依據。
- 輸出照需求 §八 JSON（`character_consistency`…`notes`），寬容 parse、null 重試一次。
- `used_memory_ids`：由組 prompt 端如實填（recall 回傳的 seq），evaluator 只判 grounding
  （答案有沒有真的踩在這些記憶上）。
- 右側「查驗」面板：每項分數 + **具體理由**＋證據引用（哪句、對照哪條記憶/事件），不只總分。

---

## 8. 資料模型（落地版，微調需求 §十一）

```ts
type InterviewSession = {
  id: string;
  runId: string;                 // 綁卷（調整 #2）
  characterId: string;
  characterName: string;
  worldDay: number;
  worldTick: number;             // checkpoint tick（快照即 tick，不另設 snapshotId）
  mode: 'free' | 'public' | 'private' | 'diary';
  interviewerIdentity?: string;
  sessionTruncationNote?: string; // compact 截斷警示（§4.2）
  createdAt: string;
  messages: InterviewMessage[];
};

type InterviewMessage = {
  id: string;
  role: 'interviewer' | 'character';
  content: string;
  createdAt: string;
  recalledMemorySeqs?: number[];  // 本輪召回（組 prompt 端如實記）
  injectedEventIds?: string[];    // 本輪注入的 witness 事件
  evaluation?: InterviewEvaluation;      // LLM 層
  boundaryFlags?: BoundaryFlag[];        // 確定性預檢層
};

type ContentMark = {
  messageId: string;
  kind: 'public_note' | 'private_diary' | 'clip_line' | 'third_person_video'
      | 'character_memory' | 'needs_edit' | 'out_of_character';
  note?: string;                  // 人工備註
  createdAt: string;
};
// InterviewEvaluation 照需求 §八欄位（camelCase）。
// GET snapshot API 回傳體分兩半：{ known: …角色可知, directorOnly: …僅導演 } —— 前端不可能拿錯半邊去組 prompt，
// 因為 prompt 全在 server 組（前端根本不傳 context）。
```

## 9. API（全掛 `/api/lab`，`labAuthorized` 門禁）

```
GET  /api/lab/runs/[id]/interview/actors            # 演員名錄（cast × live 狀態 × 圖庫頭像 × 最後記憶日）
GET  /api/lab/runs/[id]/interview/checkpoints       # 可訪時間點（day/tick/時段 + 事件錨列表）
GET  /api/lab/runs/[id]/interview/snapshot?characterId&tick   # { known, directorOnly } 兩半
POST /api/lab/runs/[id]/interviews                  # 建訪談 { characterId, tick, mode, interviewerIdentity }
GET  /api/lab/runs/[id]/interviews[?characterId]    # 列表
GET  /api/lab/runs/[id]/interviews/[sid]            # 詳情（含 evaluations/marks）
POST /api/lab/runs/[id]/interviews/[sid]/messages   # 問一輪（組 context → respond → 預檢+評審 → 存）
POST /api/lab/runs/[id]/interviews/[sid]/marks      # 標記內容候選
GET  /api/lab/runs/[id]/interview/compare?a=<sid>&b=<sid>     # 比較模式（Phase 3）
```

原則不變：**角色上下文全在 server 組裝**，前端只送問題與模式，不能傳入/改動核心設定與私人記憶。

## 10. UI

- **路由**：`/lab/run/[id]/interview`（名錄）、`/lab/run/[id]/interview/[sessionId]`（訪談間）。
  入口三處：卷架 `RunCard` 加「訪」印鍵、觀測台 header icon 列、名帖（`LabCharacterSheet`）加
  「請至訪談室」動作。
- **名錄頁**：`LabPageHeader` + 細線框演員卡（報館名錄/選角檔案感，不做數值面板）：
  圖庫肖像（按名解析，無圖回落名款）、名、行當/身份、現在何處（placement）、正在做什麼
  （duties/plan/最近一拍）、心緒一句（`stateLine`）、最後記憶更新（`listMemories[0].day`）、「開始訪談」。
- **訪談間**：左右分欄。
  - 左：頂部固定快照橫幅（§4.3）→ 訪談記錄（「問／答」款式的段落體，宋體，不用聊天泡泡）→
    輸入框 + 發送 + 清除本次 + 另起新訪談。
  - 右：三籤 ——「**所知**」（A 面：日期地點/今日親歷與聽聞/情緒目標/召回記憶/關係摘要/未了之事）、
    「**內裡**」（B 面，僅導演：她不知道的當日事件、他人 secret 與 relationshipView、bond 數值、
    快照差異推測），「**查驗**」（預檢旗標 + evaluator 分數與理由 + 一鍵標記候選）。
    B/C 面帶明顯「僅導演可見」印記與異色邊，並且**這兩面資料由獨立 API 欄位供給，永不進組 prompt 的路徑**。
- **視覺**：沿用 `.es-lab-panel`/hairline/cinnabar/Noto Serif TC；避免古風雕花、卷軸、RPG 面板、
  現代聊天泡泡（需求 §十四禁項照單全收）。

## 11. 分階段實作

| 階段 | 內容 | 對齊需求 §十三 |
|---|---|---|
| **P0 · 地基**（小） | ① 每拍 checkpoint 落盤 + checkpoints 列表；② `RecalledMemory` 補可選 `seq`（ports 向後相容）；③ recall 補 `maxDay` 過濾參數 | — |
| **P1 · 核心訪談** | interview store + 影子 session 截斷複製 + `interview-prompt.ts`（canon/percept 十段）+ 四模式 + 名錄/訪談間 UI + 「所知」面板 + FakeInterviewResponder（零鑰排演） | V1 條目 1–9 |
| **P2 · 查驗與候選** | 確定性預檢 + `interview-evaluate.ts`（cheap）+ 「內裡」「查驗」面板 + marks 標記/保存 | V1 條目 10–11 |
| **P3 · 比較模式** | 同題雙快照並排（各自事件/情緒/關係/召回/評審）+ 事件錨快照選擇器 | §十 |

V1 明確不做（照需求 §十三）：語音、Live2D、自動生成影片、自動發布、觀眾留言、多角同訪、
角色打斷/呼叫他角、角色改世界狀態。

## 12. 誠實限界

- **舊卷無史**：checkpoint 自上線起才有；之前的卷只能訪「當前」（或其 fork 點子卷）。
- **compact 截斷不精確**：早期時點訪談可能帶壓縮摘要底色，UI 明示（§4.2）。
- **成本**：實錄一問 = 一次 primary 呼叫 + 一次 cheap 評審；與實錄走拍同級的等待感，UI 要有進行中狀態。
- **訪談非正典**：不進 ticks、不進正卷記憶/session；只有人工核准的候選經植入 API 落地。
- **privacy 分級是近似**：LocalRecall 無 privacy 欄位，V1 以 kind 近似（dream/reflection 視為私密）；
  真正的 privacy/provenance 分級屬 M2 對齊 `shared/types/memory.ts` 的後續工作。
- **單機單程序**：訪談與走拍同住 Next process，多 replica 邊界與 lab 現況相同。
