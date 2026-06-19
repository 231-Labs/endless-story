# Endless Story · 劇目製作引擎（Production Engine）

> **唯一設計真相**：戲班自治排一齣「舊戲新唱」——編劇寫本、導演行當選角、琴師作曲、花旦填詞、全體演「戲中戲」，
> 最後鑄成共有 IP（一折＝可收藏數位物件）。離線驗證 harness = `packages/troupe`（鏈解耦，比照 `packages/economy`
> 的「純 package 先驗、上鏈 gate-after」紀律）。本檔 = 概念 + 觸發模型 + 技能對接 + 落地序。

---

## 0. 一句話

把「角色各司其職地**真創作**」做成一個橫跨多敘事日的狀態機：行當×技能 =「能把什麼做好」∩ 記憶×關係 =「被觸動想做什麼」。
班主搭骨架，角色用魂去填。

---

## 1. 劇目 = 新的頂層名詞（橫跨事件）

既有脊椎是**事件中心**（一個鏈上事件 → POV/章回/公報/劇照都是它的投影，見 `docs/CONTENT_PIPELINE.md`）。
「排一齣戲」是相反的形狀 —— 它**橫跨**多場景：劇本＋選角＋譜＋多場演出。所以唯一真正新的名詞是 **劇目 / Production**，
一個 durable 狀態機：

```
PROPOSED → SCRIPTED → CAST → SCORED → VERSIFIED → REHEARSING → PREMIERED
   班主       編劇      導演     琴師      花旦        全體         系統
```

- 每個箭頭 = 一個敘事日邊界 + 金庫檢查 gate；每步 **idempotent、可 resume**（對應產品的 tick loop）。
- 狀態存「製作總綱（Production Bible）」，不存在任一 agent 的 context 裡。
- 產出物走既有 `sign-and-anchor` / `commitment::commit` + 新 `es:production` header（clone `es:cut`）。

各行當輸出（= harness 的 `out/`）：班主→製作綱要、編劇→**結構化劇本**（科介/角色(念|唱):詞，JSON）、
導演→**行當粒度選角表**（生旦淨丑 + 應工 + 乾旦/坤生：演員性別 ⊥ 角色性別）、琴師→**可演奏的譜**（板式 + 简谱 + 真 `.mid`）、
花旦等→**雙源詞**（應場填詞 + 有感而發）、全體→**戲中戲章回**（羅生門 POV 織回）。

---

## 2. 產出怎麼觸發？——**Director / Showrunner agent 決定（gated）**

對應多 agent 編排的鐵律：**「該不該排這齣戲」是 orchestrator（導演）的 gating 決定；戲裡的創作是角色自治**。
排戲 capability 掛在既有 Showrunner（`packages/web/src/lib/director/`）—— 它有工具註冊表（`tools.ts`）+ 每敘事日心跳，
本來就以 capability catalog（open_storylet / character_call / …）「經營」saga。排戲就是**新增一個 narrative-tier 工具 `launch_production`**。

Director 在心跳 evaluate 後，依四個條件判斷要不要開：

| 判斷 | 來源 | 用途 |
|---|---|---|
| **金庫** | 讀鏈 `Saga.treasury` | 排戲（尤其含音訊/影片）貴 → 付得起才開；否則排小戲或 defer |
| **班底** | roster 行當覆蓋 | 大戲要生旦淨丑齊；不齊 → 排小戲或先招角 |
| **弧線/節奏** | director memory + world-time | arc 需要高潮？距上次大戲多久？（**年度大戲** = 折子「某一年」的由來）|
| **觀眾訊號** | 訂閱/熱度 | 值不值得砸資源 |

三種觸發來源餵進這個決定：

1. **節奏 / 儀式**（主）：world-time 每「一年」一齣**年度大戲**，由 heartbeat/world-loop 觸發 Director 評估。
2. **就緒度**：金庫＋班底到位時 Director 主動提一齣。
3. **角色提案（bottom-up，野）**：一個高 `playwriting` 技能的角色，從自己記憶長出戲念，pitch 給 Director；**Director 仍是 gate**。
4. **人工 override**：admin `DirectorChatPanel`「排一齣紅樓」直接 commission（harness 現在就是這個）。

**Director 只決定「開 / greenlight 首演」，不微管每一步** —— 一旦 launch，劇目狀態機每 tick 自走（編劇→選角→…），
Director 頂多在 `PREMIERED` 前 gate 一次（品質 / 金庫）。這與既有 Showrunner 完全同構，零新範式。

---

## 3. 技能對接：兩條軸，共用同一個鏈上底座

兩邊都叫「角色技能」，但**用途正交**：

| | **main 的 saga-skills** | **劇目引擎的 craft-skills** |
|---|---|---|
| key | vocal唱腔 / movement身段 / stage_presence台緣 / martial武場 / literati文墨 / networking交際 | **playwriting編劇 / composing作曲 / lyricism填詞** |
| 作用 | 影響**事件抽牌**（`event.move compute_card_weights`）| **gate「誰能寫」+ dial「寫多好」**，產出作品 |
| 進 `card_weight_rules`？ | 是 | **否**（作者能力不該偏戰鬥牌）|
| 寫入 | `seedCharacterSkills`（main 已接好，mint 後 + reconcile）| 同 PTB 多寫 3 筆 |

**底座共用**：同一個 `SagaSkillsKey` DOF。`set_character_skill` / `define_saga_attribute` 都 key-agnostic（只驗證 key 有宣告），
所以加 craft = **零合約改動、零 redeploy**（runtime define + upsert）。perf 維度的 唱腔/身段/文墨/武場 是 **main 已有的 key**，
劇目引擎的選角 fit / 作曲・填詞品質**直接讀**；只需多三個純創作 key。

推導（跟 main 同哲學，確定性、免 admin UI）：`deriveCraftSkills(role, world, perf)` 從**行當 + 既有 perf 技能**推 ——
琴師→作曲高、班主/文人/老生→編劇高、旦/文人→填詞。要特別捧某角當編劇，`setCharacterSkill` upsert 覆蓋即可（天然 storyteller override）。

### 落地序（全部「擴充」非「改寫」）

| 動作 | 檔案 | 狀態 |
|---|---|---|
| `deriveCraftSkills` + `CRAFT_SKILL_KEYS` + `deriveAllSkills` | `packages/web/src/lib/chain/saga-skills-core.ts`（pure）| **離線 slice ✅**（+ `saga-skills-craft.test.ts`）|
| troupe 技能 key 對齊 main（唱腔→vocal…）| `packages/troupe/src/{skills,fixtures,hangdang}.ts` | **離線 slice ✅** |
| 宣告 3 個 craft 屬性（不進 card rules）| `packages/cli/scripts/stories/spring-snow.json` `saga_attributes` | gate-after |
| `seedCharacterSkills` 同 PTB 多寫 3 craft key | `packages/web/src/lib/chain/saga-skills.ts` | gate-after |
| troupe 移進 runner 時改讀 `character_skills_for_saga` | （port）| gate-after |
| craft 技能「製作完成→bump」leveling | — | defer（upsert 天然支援）|

---

## 4. 可行性分層（2026-06 研究，簡）

劇本 ✅ / 選角 ✅（**文化正確的行當選角是最強牌**）/ 詞 ✅ / 曲（胡琴）🟡 走 sample 京胡庫（一次性買庫、每首≈免費，**別用 Suno**）/
演出影片 🟡 只能「劇照活化／工筆動態」（水袖/身段/臉譜在動態中是全行業的牆）/ 真唱腔合成 🔴 暫放，用念白 TTS＋唱詞字幕。
**框定**：賣「自治戲班自排新編戲的圖文總譜＋念白配樂＋劇照短片，鑄成共有 IP」，**不要賣「AI 唱京劇」**。

---

## 5. 可收藏戲折（產品願景）

`--no-score` 純排戲會組一份 `00_戲折.md`：一折 = 整齣戲（班底＋分場＋折子章回＋角兒私詞）。
**這個 `out/` 資料夾本身就是一個「折子」物件的形狀** —— 接上 `production.move`（clone `still.move` 的 registry/TransferPolicy）+ Walrus，
一折就變成可持有、可交易的數位藏品 NFT，內容是劇本／選角／章回（選配譜）。即「春雪社某一年大戲的折子＋數位內容」。
共有 IP：cast vector = 真 cast OwnerCaps；launch 先限戲班自有 cast（admin 控所有 cap），跨錢包共有 defer。

---

## 6. 現況

- **已落地**：`packages/troupe` harness（鏈解耦、mock 零依賴可跑、自帶 fetch LLM client + 重試/退避/併發上限）。
  狀態機、行當粒度選角（乾旦/坤生）、雙源詞、戲中戲章回、確定性音樂（簡譜+MIDI）、戲碼目錄（白蛇/紅樓改良/白蛇全本大戲）、
  `--no-score` 純排戲、`00_戲折` 收藏品。技能對接離線 slice（craft derive + key 對齊）✅。
- **gate-after**：craft 技能上鏈（saga_attributes + seed）、真音色（sample 京胡）、念白 TTS、劇照活化影片、`production.move` 共有 IP。

---

## 7. 靠寫死 vs 自治：誠實盤點

**核心事實：LLM 目前只生「文字」（劇本/詞/POV/章回）；幾乎所有「決策」要嘛寫死、要嘛是規則跑在手設 fixture 上。**
harness 是**結構證明**（證明這條管線能產出連貫、可用的作品），不是自治證明。「活著」的部分（誰、排哪齣、誰被觸動）現在是用手寫資料模擬的。

| 環節 | 誰決定 | 來源 | 程度 |
|---|---|---|---|
| 排哪一齣戲 | 人（`--play`）/ 未來 Director | `repertoire.ts` 目錄 | 🔴 寫死/人選 |
| 立意 premise | LLM | 但 `premiseSeed` 寫死當底稿 | 🟡 生成但有底 |
| 分場結構（哪幾場、誰上場）| `repertoire.ts` | 寫死 | 🔴 寫死（**舊戲本來就固定，合理**）|
| 念白 / 科介 文字 | LLM | prompt | 🟢 生成 |
| 選角（誰演誰）| 演算法 `caster.ts` | `fitScore` + couple 規則，跑在 fixture 的技能/關係上 | 🟡 確定性演算法 over 手設資料 |
| 乾旦/坤生 偵測 | 規則 | actorGender ≠ roleGender | 🟡 規則 |
| 作曲（曲/胡琴）| 模板選取 | `music.ts` 板式庫**寫死** + mood 對應 | 🔴 寫死模板（不是真作曲）|
| 應場填詞「誰」| `bestFor`（填詞技能最高）| 確定性 over fixture | 🟡 |
| 應場填詞「內容」| LLM | | 🟢 生成 |
| **有感而發「誰」** | `movedToCreate`（bond≥75 + 對象在卡司）| **門檻跑在手設關係上** | 🔴 規則 over 手設關係 |
| 有感而發「內容」| LLM | persona + 關係 + **手設記憶** | 🟢 生成 |
| POV / 戲中戲章回 | LLM | | 🟢 生成 |

### 「誰會有感而發」——精確答案

現在＝**凡是手設關係 ≥75、且對象也在這齣卡司裡的角色**。fixture 裡**只有蘇映雪**（對柳生春 bond 88 + 兩條 `aboutId` 指向他的手設記憶）。
所以是**我預先安排好的、確定性的**，不是角色真的「累積了感情、被觸動」。觸發是寫死門檻，被觸動的素材（關係、記憶）是手寫進 fixture 的。

### 真自治＝把每個手設輸入換成「真來源」

| 手設的東西 | 真來源（變自治後從哪來）| 狀態 |
|---|---|---|
| 角色技能（編劇/作曲/唱腔…）| `deriveSagaSkills`/`deriveCraftSkills`（行當+attrs 推）| ✅ slice 已做 |
| 關係 + 記憶（誰跟誰深、為何）| **MemWal**（入科 induction + 遭遇/反思累積，敘事引擎）| ⛔ harness 用 fixture |
| 排哪一齣 | **Director 心跳**決定（`launch_production`，gated）| 🟡 設計好，未建 |
| 分場結構 | 舊戲＝寫死（對）；**新編戲**＝編劇生成結構 | 🟡 新編未做 |
| 曲（胡琴）| 真作曲（symbolic gen / sample 京胡渲染）| ⛔ 現為模板 |
| 「誰被觸動」的判定 | 可保留啟發式門檻，或升級成**角色自我 LLM 判斷**（讀自己的記憶+卡司，「你此刻動不動心想寫？」）| 🟡 現為門檻 |

一句話：**現在約 7–8 成的「驅動」是寫死或規則 over 手設資料，真正生成的只有文字。** 讓它變活，不是把 LLM 用更多，而是**把手設的輸入逐個換成真實累積的來源**（行當→技能 ✅、MemWal→關係記憶、Director→排戲決定）。craft 技能那一步已經示範了「手設→推導」的轉換方法。

---

## 8. 自治測試版 `--auto`（鏈解耦，已落地）

把 §7 盤點裡的「決策」逐個換成自治 —— 離線、零鏈，真作曲先跳過（依產品決策）。`node packages/troupe/driver/run.ts --auto --no-score`：

| §7 原本手設/寫死 | `--auto` 換成 | 落點 | mock 行為 |
|---|---|---|---|
| 角色技能（手設數值）| `deriveAllSkills`(行當推，**重用 web 的 pure 推導**) | `src/derive-skills.ts` | 推導（確定性，mock 也跑）|
| 關係 + 記憶（手設 fixture）| **入科 induction**，三層來源（見 §9）：**MemWal 真累積** ＞ LLM 生成 ＞ fixture | `src/genesis.ts` + `src/memwal-source.ts` | 沿用班底底稿 |
| 排哪一齣（`--play` 人選）| 班主 `chooseProduction` 自選（看行當覆蓋+新鮮感）| `roles/director.ts` | 啟發式（齊全→大戲）|
| 誰有感而發（寫死門檻）| **角色自我 LLM 判斷**（讀自己記憶+卡司，自己決定動不動心）| `roles/lyricist.ts`（`auto`）| 退回門檻 |

- `--play` 仍可覆寫班主的選擇（人工 override）。`--auto` 可疊 `--no-score`。
- **仍刻意寫死**：分場結構（舊戲本來固定）、板式庫（真作曲跳過）。
- 副產品：candidate 邏輯讓**互相**深緣的雙方都能有感而發（非寫死只取一個）。
- **真自治要真 key**：mock 模式社交網沿用底稿、有感而發退回門檻；真 LLM 才會生成新社交網、角色才會自判。
- 下一個真來源是把入科的「生成社交網」換成 **MemWal 累積的真關係/記憶**（見 §9）。

---

## 9. 真記憶來源：MemWal（`--memwal`）

入科的社交網有三層來源，優先序 **MemWal 真累積 ＞ LLM 生成（--auto）＞ fixture 底稿（mock）**。`induct()` 收一個可插拔
`MemorySource`（`src/memwal-source.ts`），有真資料就用真的，否則往下退。**這是「誰有感而發」從『這次生成』升級成『長年累積』的最後一哩**——
角色真的「處」出來的關係/記憶，才讓被觸動是真的湧現。

**讀法（重用 web 生產路徑，不重造 SEAL/recall）**：
- 記憶 ← `recallStructuredForCharacter(chainId, 關係查詢, 8)`（三因子 recall：importance×recency×relevance）。
- 關係 ← `fetchOnChainEdgesFrom(chainId)`（公開 `RelationshipSeeded` edges，免 SEAL）→ `Relationship{withId, kind=toneLabel, intensity=weight×10, note}`，`toId` 經 roster 的 chainId→id 對回 harness id。

**遵循 repo 的 MemWal idiom**（同 web `memory.ts`）：**gated + graceful，憑證到了才亮**。
- 角色**無 `chainId`** → 來源直接回 null，**完全不 import** memwal/sdk（離線 `node` 零依賴不受影響，已驗證）。
- 有 chainId 但 `isMemoryConfigured()` 為否 → graceful 回 null → 退回生成/底稿。

**要讀到真資料的前提**（⚠️ harness fixture 是假 id，讀出來是空的）：
1. roster 角色帶**真的鏈上 Character object id** 填進 `chainId`（`packages/troupe/src/types.ts TroupeMember.chainId`）。
2. 憑證在 env：`MEMWAL_PRIVATE_KEY` / `MEMWAL_ACCOUNT_ID` / `SUI_ADMIN_PRIVATE_KEY` / `OPENAI_API_KEY`。
3. **用 `tsx` 跑**（web 讀法用 `.js` 相對 import，`node` strip-types 會 ERR_MODULE）＋ `pnpm install`。

```bash
# 真讀（需上述三項）：
AI_PROVIDER=poe POE_API_KEY=... \
  pnpm --filter @endless-story/troupe exec tsx driver/run.ts --auto --memwal --no-score
```

無上述前提時 `--memwal` 仍可離線跑（每人回 null → 退回），所以這層**先落地、之後真角色+憑證到位就自動亮**。
真正的端到端驗證 = 指向**真的在鏈上活過、累積過記憶的角色**（live saga 的 cast），harness 的 fixture 角色不具備。

---

## 10. 接到 runner（已落地）

引擎邏輯**單一真相留在 `@endless-story/troupe`**；runner 只加一個**薄轉接 service**呼叫它（不重抄 15 個檔）。`packages/runner/src/services/production/`：

| 檔 | 做什麼 |
|---|---|
| `index.ts` `runOnce(input)` | induct（可注入 `source`）→ `newProduction` → `runToPremiere` → `assembleXiZhe` → **`signAndAnchor`**（`es:production` header、subject=sagaId） |
| `ask.ts` `makeProductionAsk()` | 把 runner 的 `@endless-story/llm`（`text.createTextClient`）轉成 troupe 的 `Ask` 介面（troupe 的自帶 fetch client 只給離線 CLI 用） |
| `prompt.ts` | `es:production` header embed/parse（純，mirror `es:cut`）；`castIds` = 共有 IP 的 cast provenance |

- 從 `@endless-story/runner` 導出為 `runner.production`；`runOnce` 形狀比照 `event-chapter-compiler`（`dryRun`/無 signer → 不上鏈）。
- **依賴注入的兩個 seam**：`ask`（測試傳 mock）、`source`（web 呼叫端用 `memory.ts` 建真 MemWal 來源）。
- runner 能在 node 下 import `@endless-story/troupe`（troupe 內部全用顯式 `.ts`，不像 llm 的 `.js`）。
- **驗證**：`prompt.ts` 純 header round-trip `test/production.test.ts` 4 綠（`node --test`，比照 runner 慣例只測純 leaf）；induct→runToPremiere→assembleXiZhe 的組裝由 troupe driver 證過（runOnce 同一組裝）。**端到端 runOnce 需 `pnpm install`（連 troupe 新 dep）+ 走 web bundler/tsx**（runner src 用 `.js` infra import）。

### 10.1 導演觸發：`launch_production` 工具（已落地）

由**導演（Showrunner）觸發**——工具註冊表（`packages/web/src/lib/director/tools.ts`）新增 narrative-tier 工具 `launch_production`。導演在心跳/對話裡**自己判斷時機**（班底齊整、金庫撐得起、敘事該排大戲——§2 的 gating，寫進工具 description 讓 LLM 自律），然後輸出 `{"tool":"launch_production","args":{...}}` 呼叫它。

工具 → server action `launchProductionAction`（`packages/web/src/lib/actions/launch-production.ts`，mirror `compile-gazette`）：
1. `buildSagaRoster` 讀真班底 → `rosterToTroupe`（用 troupe 純函式 `castingFromRole`：行當 tag→行當/應工，gender→actorGender）。
2. 內建**真 MemWal 來源**（`recallStructuredForCharacter` 記憶 + `fetchOnChainEdgesFrom` 關係 edges；graceful 空→induct 退回生成）。
3. `getAdminContext()` signer → `runner.production.runOnce({ sagaId, roster, source, signer, auto:true, classicKey?, dryRun? })`。
4. 回報 cast（含坤生）/分場/有感而發/上鏈 id 給導演。
- `runOnce` 在 `auto && !classicKey` 時呼叫 `chooseProduction`（**班主自選戲碼**）；導演也可在 args 指定 `classicKey`。`dryRun=true` 只跑不上鏈。
- **驗證**：純 `castingFromRole`（`troupe/test/casting.test.ts` 3 綠）。action/tool 是 web server 碼（`@/` alias + runner + memory.ts），**離線無法跑**，靠對齊已確認的簽名（`SagaRosterEntry`/`getAdminContext`/`recallStructuredForCharacter`/`fetchOnChainEdgesFrom`/`toneLabel`）+ 既有 `compile-gazette` 範本；端到端需 `pnpm install` + 跑起 web。

**手動觸發按鈕（已落地）**：`/admin/stage` 的「手動補產 / 逐項測試」區加了「新戲 · 排一齣」面板（`LaunchProductionPanel.tsx`，mirror `GazettePanel`）：戲碼下拉（班主自選/白蛇/紅樓/大戲）+ 純排戲勾選 + Dry-Run/上鏈雙鈕，直接呼叫 `launchProductionAction`，顯示選角（含坤生）/分場/有感而發/LLM 統計/tx·commitment·walrus 連結。**不經心跳/對話，手動點最快**。

**還沒接的（next）**：① 上鏈那半（craft 技能 attr 進 `saga_attributes` + `seedCharacterSkills` 多寫 3 筆，讓選角/品質讀真鏈上技能）；② 心跳裡讓導演真的「自發」決定排戲（gating 邏輯目前靠工具 description 讓 LLM 自律，可加確定性 readiness 檢查）。

### 10.2 指定選角（欽點）（已落地）

導演照常**觸發**排戲，但 owner/導演可**欽點誰演某角色**（其餘自動配）。一條 override 路徑貫穿引擎→工具→面板：

- **引擎**（`caster.ts`）`cast(script, troupe, couple, overrides)`：`overrides` = `partId → member.id`。**兩階段**——先把所有欽點演員**預留**（標 taken），再跑自動 fit/情緒選角，**故自動那輪搶不走被欽點的人**（曾踩過：白素貞的情緒選角先把蘇映雪搶走，許仙的 override 落空 → 兩階段修掉）。被欽點者標 note「指定選角（欽點）」，跨性別照樣算乾旦/坤生看點。`Production.castOverrides` 帶著它，CAST step 傳入。
- **runner**（`production/index.ts`）`RunProductionInput.castOverrides` → `newProduction`。
- **web action**（`launch-production.ts`）`input.cast` = **角色名(partName) → 角色 id**（UI/工具給的好寫格式）；用 `resolvePlay(classicKey).parts` 解析成 `partId → characterId`（=member.id=chainId），只認 roster 內的 id。**需同時給 `classicKey`**（戲碼定了才知道有哪些角色；班主自選時無法指定）。
- **工具**（`tools.ts`）`launch_production` args 加 `cast`（`{"許仙":"0x角色id"}`），讓導演 agent 也能欽點。
- **面板**（`LaunchProductionPanel.tsx` + server action `production-casting.ts` `getProductionCastingOptions`）：選定戲碼後拉出**該戲角色清單 + 班底**，每個角色一個下拉（預設「自動」），收成 `cast` 傳給 action。班主自選（無戲碼）→ 不顯示矩陣。
- **驗證**：`troupe/test/casting.test.ts` 3 綠；override 煙測（欽點蘇映雪演許仙 → `許仙→蘇映雪[坤生]✦欽點`，其餘自動填補）＋無 override 回歸原樣。web typecheck 0 錯。

---

## 11. 前台 surface：feed「排戲」tab + Seedance prompt（已落地）

排戲產出（戲折）原本**沒有任何讀回路徑** —— `launchProductionAction` 把 `es:production` blob 寫上鏈（subject=sagaId）但沒人讀，所以排戲看不到，**且會漏進公報 tab**（gazette-read 沒排除）。本節補上：

**讀回 facade（clone `cut-read`/`gazette-read` 那套）**：
- `lib/chain/production-read.ts` — 掃 saga-subject commitments → peek `es:production` header（用 `production.parseProductionHeader` from `@endless-story/runner`）→ `ProductionEntry`/`ProductionDetail`。short-TTL + stale-while-revalidate 快取。
- `lib/api/productions.ts`（`listProductions`/`getProduction`）+ `api/index.ts` 導出 `productionsApi`。
- `components/feed/ProductionList.tsx`（卡片→詳情）+ `app/(site)/feed/production/[id]/page.tsx`（戲單渲染 + 鏈上 commitment + cast 共有 chips）。

**戲單結構化渲染（不再 dump markdown）**：戲折 body 不直接丟 `<Markdown>`（會擠成「副標＋1.2.3…＋折子長文」一坨），改由純解析器 `lib/feed/xizhe-format.ts` `parseXiZhe(body)` 拆成 `{title,subtitle,premise,director,qizhi,cast[],scenes[]（含劇本行 lines）,climaxTitle,prose,povs[],ci[]}`，詳情頁＋卡片**共用同一格式真相**：
- `components/feed/XiZheView.tsx` 排成「戲單」——題目／立意框（班主·氣質）／**班底**（角色—角兒＋行當 chip＋坤生/乾旦標記）／**分場·劇本**（`SceneList` client island，點折展開該場劇本：科介／念白／**唱段硃砂高亮**）／**折子·戲中戲**（羅生門織版長文）／**各角視角**（每角兒一張卡：「角兒 飾 角色〔坤生〕」＋第一人稱 POV，讓讀者看得出折子是誰的視角）／**唱詞**（應場＋有感全列）。卡片摘要＝乾淨「立意」＋班底名＋N 折。
- 劇本＋唱詞來源：`assembleXiZhe` 的 `## 分場` 改成逐場 `### n 〈場〉（mood）`＋劇本行（科介/念白/唱），`## 唱詞` 帶**全部** `prod.ci`（`### 詞名 · 作者〔應場|有感而發〕`）。**修了舊洞**：原本戲折只塞第 1 首 emergent 私詞，應場唱詞＋第 2 首 emergent 全被丟；現在全收。唱段（劇本 `唱` 行）原本完全沒納入，現在點分場可讀。
- 視角來源：`assembleXiZhe` 除了織好的 `chapter`（POV 交錯、不標記），另寫 `## 各角視角` 段帶 `prod.takes`（`### 角兒 飾 角色`＋逐角 pov），parseXiZhe 解析成 `doc.povs[]`。**僅新排的戲折有**；既有上鏈 blob 只有織版（POV 隱含）＋無劇本/唱詞段，優雅退化（分場不可點、不顯示視角/唱詞卡）。admin「排一齣」面板的 Dry-Run 全文預覽（`buildPreview`）含完整劇本＋詞＋各角視角，**不上鏈即可先看**。
- 解析器**容忍**：舊/空 blob、無題《》→null、班底空括號/缺角、折子 prose 內殘留 `##`/`>` 不被當區塊截斷（meta handler 限 head 區、未知 `##` demote 成正文）。並 `isNoise()` 剝除既有上鏈 blob 的「可收藏」促銷句（assembleXiZhe 已停發）。
- 驗證：parseXiZhe 對 assembleXiZhe 真實輸出（baishe/honglou/大戲 × scored/skip）+ ~15 對抗輸入（8/8 回歸綠）；4-lens 對抗式 review（促銷殘留/設計 token/渲染正確/退化）。

**feed tab 改接**：`FeedTabs` 把「影像與畫冊」改名「**排戲 · 劇目**」（保留 key=`visual` 零 URL churn）；`feed/page.tsx` visual 分支從 `chaptersApi`(空) 改讀 `productionsApi.listProductions`。**必做止漏**：`gazette-read.isNonGazetteBlob` 加排除 `es:production`（同 subject）。

**Seedance 2.0 prompt（admin，零 gate）**：`launch-production.ts` `buildSeedancePrompts(prod)` 純函式 —— 每場 mood→運鏡光色、行當→身段（水袖/台步/亮相）、戲妝、15s，回傳 `seedancePrompts`；`LaunchProductionPanel` 每場一個 textarea + 複製鈕。⚠️ **text-to-video、不繼承角色臉**（CONTENT_PIPELINE §4 教條是 image-to-video／劇照當首幀），僅供手動試效果。

**TASK 2（gate-after，大工程 ~1–2w）排戲=限期大事件**：把排戲做成導演排程的 **spine event**（複用 event-spine + ACT/SOCIAL/POV→`rememberForCharacter`，排戲互動自然落記憶**不用新管線**）。需：導演 `schedule_production` verb（`capabilities.ts`+`dispatch.ts`）、`openProductionEvent`+**合作型（非爭搶）resolve**（`event-spine.ts`）、per-event 期限（`spine-core.ts`）、SOCIAL busy 放行（`social.ts`）、premiere 呼叫 `launchProductionAction` + per-scene 劇照（複用 `generate-event-moment` img2img）。需鏈上驗證 + MemWal 憑證。
**TASK 3 PART B（gate-after，需 `OPENAI_API_KEY`）排戲生劇照**：每場 loop `generate-event-moment` 的 img2img（refs=cast `media_assets[0]` anchor，鎖臉）+ `productionStillPrompt`（演員臉 + 角色戲妝），回 still URLs 顯示在 panel。

