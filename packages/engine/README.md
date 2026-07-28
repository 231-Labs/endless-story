# @endless-story/engine

A standalone, **local-first** narrative engine: the verified want-engine loop
(see `RUNNER_V2`) running with **no chain, no Walrus/Seal, no Next.js**. It
promotes the proven harness form — fake chain + real (or fake) LLM + local
memory — to be the engine proper, with infrastructure behind pluggable ports.

The engine **stages situations and resolves collisions; it never scripts a
character's choice** (RUNNER_V2 §7). All LLM authorship goes through one port;
the loop itself is deterministic orchestration.

## What M0 covers

- **Pure narrative core** (relocated here from `web/lib/chain`, single source of
  truth): the want engine (`core/want-core`), scene interaction loop
  (`core/scene-loop`), turn routing (`core/scene-routing`), actor fatigue
  (`core/actor-fatigue`) and the night-placement math (`core/spatial-routing`).
- **WorldState** with full JSON `snapshot(dir)` / `restore(dir)` every tick —
  cast (persona/secret/state vector), scenes (privacy), roster, home/work
  anchors, want ledger, directed relationship edges, world clock and the
  day-accumulator. This kills the volatile in-process-Map failure mode diagnosed
  in production (CHARACTER_LIFECYCLE §6iii): a restart continues.
- **Tick pipeline** (`tick.ts`): advance clock → genesis wants grown from the
  **full self** (persona + secret + saga premise — not the stripped description
  that starved production) → day dispersal to work anchors / night routing home +
  want-driven pursuit → per-scene `runSceneLoop` self-assembled from persona +
  secret + recalled memories + state line → aftermath / ripples → weave tick 回 →
  day-end episode → archive everything → snapshot.
- **Local adapters**: `FakeSceneAgent` (deterministic, prompt-free),
  `RunnerSceneAgent` (real LLM via `@endless-story/runner`), `LocalRecall`
  (embed + cosine, real OpenAI embeddings or deterministic hash, JSON-backed),
  `FileArchive` (markdown per artifact), `LocalClock`.
- **Preset loader + CLI**: load a story preset, seed genesis memories, run N
  ticks, resumable.

Every port is **loud on failure** — an adapter that cannot do its job throws;
the loop never swallows a port error into a silent empty result.

## Port map

| Port | M0 adapter | M2 swap |
|---|---|---|
| `SceneAgentPort` (actBeat/judgeWantResolved + genesis/aftermath/ripples/weave/episode) | `FakeSceneAgent` · `RunnerSceneAgent` | — |
| `RecallPort` (remember/recall by kind+day+importance) | `LocalRecall` (JSON + embeddings) | MemWal adapter |
| `ArchivePort` (手卷 / 織回 / 日終 / POV) | `FileArchive` (markdown) | chain commitment + Walrus |
| `ClockPort` | `LocalClock` | — |
| EconomyLedger | *(deferred)* | economy slots |

`SceneAgentPort` extends the scene-loop's injectable `SceneAgent` with the
surrounding authorship the pipeline drives itself, so exactly two adapters cover
the whole LLM surface and the smoke runs with zero LLM.

## Run it

```bash
# default = FakeSceneAgent + deterministic embeddings (no creds needed)
pnpm --filter @endless-story/engine engine -- run --preset spring-snow --ticks 8 --out ./run

# real LLM (needs a text-provider key; real embeddings if OPENAI_API_KEY set)
pnpm --filter @endless-story/engine engine -- run --preset spring-snow --ticks 8 --out ./run --real-llm
```

A run is resumable: if `<out>/state/world.json` exists it is restored and
continued. Artifacts land in `<out>/archive/` (`d<day>-t<tick>-<kind>-…md`),
memory in `<out>/memory/recall.json`, the world in `<out>/state/world.json`.

```bash
pnpm --filter @endless-story/engine test          # unit + integration smoke
pnpm --filter @endless-story/engine type-check
```

## 宏觀節奏（macro rhythm）

微觀層（單場戲品質）過關之後壞掉的是**宏觀節奏**：飢餓變成同質化吸引子、願望只進
不出、月半結帳永遠在逼近卻不抵達、支出是機制而收入是台詞。這一層是那四件事的修法。
全部是引擎側；一律 opt-in，不給 deck／不給 `--track` 的卷與加這層之前逐位元相同。

```bash
# 掛牌組 + 只追兩個人
pnpm --filter @endless-story/engine engine -- run \
  --preset spring-snow --season spring-snow-market \
  --deck spring-snow --track 柳安春,方競西 --ticks 18 --out ./run

pnpm --filter @endless-story/engine engine -- deck-check --deck spring-snow
```

### 1. 事件卡 schema

牌組是**有限的、宣告式的** JSON（`packages/cli/scripts/decks/*.json`，或私有
`$ES_SCRIPTS_ROOT/decks`）。每張卡自帶觸發條件、作用對象與**確定性後果**；引擎結算，
導演不碰。整份牌組在**載入時**驗證（`deck-check`），不合格立刻報錯，絕不留到走拍中途。

```jsonc
{
  "id": "spring-snow",
  "maxCardsPerDay": 2,          // 一日至多打幾張（死線卡不受限）
  "maxSeasonalPlays": 2,        // 一卷至多幾張季級大牌
  "maxActsPerDay": 2,           // 一日至多幾件世情動作（見 §2.6）
  "acts": [ /* 見 §2.6 */ ],
  "secrets": [ /* 見 §5 */ ],
  "newcomers": [ /* cast-enter 只能從這裡取人 */ ],
  "cards": [{
    "id": "mid-month-reckoning",
    "label": "月半結帳",          // 卡面（導演可穿戲服改寫）
    "note": "……",                // 給導演的選牌依據
    "tier": "routine",           // routine | seasonal（人物進出＝季級）
    "mustLand": true,            // 死線卡：到日必打，導演無權不打
    "trigger": {
      "onDays": [3], "everyDays": 15, "anchorDay": 2,
      "atParts": [4],            // 時辰索引 0–5（清晨…深宵）
      "minDay": 1, "maxDay": 30,
      "maxPlays": 1, "cooldownDays": 3,
      "requires": [{ "kind": "account-runway-below", "days": 5 }]
    },
    "targeting": { "mode": "director-pick", "pickCount": 1, "from": "troupe" },
    "effects": [{ "kind": "reckoning", "label": "月半結帳" }]
  }]
}
```

**targeting.mode**：`none`／`all`／`troupe`／`named`（`names`）／`director-pick`
（`pickCount` ＋ `from: all|troupe|hottest|poorest|press`）。導演只能在引擎算出的
候選名單裡挑；名單外的 id 一律丟棄。

**trigger.requires**（有限、純狀態，不需模型即可判定）：
`account-runway-below`｜`account-below-yuan`｜`outstanding-debt-atleast-yuan`｜
`tension-peak-atleast`｜`live-wants-atleast`｜`cast-atleast`｜`secret-leaked`。
**條件只擋常規卡，永不擋死線卡**——會被條件否決的死線不是死線，那正是「月半結帳」
變成幻覺的原因。

**effects**（引擎確定性結算的全部後果）：
`percept`（世界事實，`costume` 蓋過 `text`）｜`wage-packet`（工錢）｜`dividend`
（分紅）｜`reckoning-notice`（結帳預告）｜`reckoning`（結帳當日的公開叫帳）｜
`patronage`（注資）｜`bill`（按期債；`fromAccountId` 可用 `"@target"` 指這張卡對準
的人）｜`want`（種一樁帶死線的心事）｜`renown`／`self-regard`｜`weather`
（`housePct` 直接折座）｜`object-state`｜`leak-secret`／`publish-secret`｜
`cast-exit`（離班＋孤兒資產強制重分配）｜`cast-enter`（只能取 `newcomers` 池裡的人）｜
`standing`（**人心轉向**：把一句 tone 寫進既有的 `edges` 圖，並以 `chillBond` 真的打掉
交情。`from: targets|witnesses|actor`、`toward: actor|targets`、`grievance`、`hearsay`）。

`standing` 是唯一會動關係的 effect，而它動的是**世界本來就有的那兩張圖**——這條引擎
沒有第二本口碑帳（見 `core/standing.ts`）。`hearsay: true` 標成街談，會隨著天天照面
而淡（`fadeHearsay`）；當事人的第一手怨氣不淡，得真有事發生才解。

> **語氣即機制。** `welcome()`（夜訪、`tabTrust` 賒帳、`socialStandingOf` 社會性死亡
> 全部走它）在非 strict-structured 下讀的是**語氣字串**，不是 `disposition`。所以
> `disposition: 'cold'` 但語氣不帶 `妒|怨|恨|冷|敵|競` 任一字的 edge，看起來是怨，
> 走起來是無事——關不上任何一扇門。第一版的世情動作六條語氣全是這樣寫的（「把我告到
> 巡捕房去了——這一筆我記著」），報官因此對當事人零代價。現在 `deck-check` 會當場擋
> 下這種牌（比對 `WARM_TONE`／`COLD_TONE`，與 `welcome()` 同一份 pattern）。

**分支後果（`onlyIf`）**：任何一個 effect 可以掛一個 `CardCondition`，條件不成立就
跳過這一條。這是「必到之日 × 兩種結果」的寫法——例如「首演之夜」到日必落，可是它
結算什麼，看新戲到底上沒上台：

```jsonc
{ "id": "premiere-night", "mustLand": true, "trigger": { "onDays": [5] },
  "effects": [
    { "kind": "percept", "text": "新戲真的上了台。",
      "onlyIf": { "kind": "production-premiered", "premiered": true } },
    { "kind": "bill", "id": "refund", "label": "訂金退回", "amountYuan": 33, "dueInDays": 3,
      "onlyIf": { "kind": "production-premiered", "premiered": false } }
  ] }
```

分支放在 **effect** 而不是 **card** 上是刻意的：把整張卡掛條件，死線就變成可被否決
的，那正是月半結帳當年退化成幻覺的原因。牌組作者負責讓分支窮盡。

### 2. 導演的輸入與輸出

導演是 `SceneAgentPort.pickEventCard`，職權**只有三件事**：選哪張卡、何時打（按牌
不打）、對準誰；外加把卡面**穿上戲服**。後果全由引擎結算，導演不碰任何數字。

| 方向 | 內容 |
|---|---|
| **輸入** | `day`／`clock`；`offered[]`（每張卡的 `cardId`／`label`／`note`／`forced`／**可對準的候選 id＋姓名**／`pickCount`）；`worldBrief`（**純散文世情**：燒得最旺的幾樁心事、班庫「緊得很／尚有餘裕」、街上賒著的帳、還沒發的事、已離班的人——**沒有任何數字**）；`forcedCardIds`；`mayPropose`（見 §2.5） |
| **輸出** | `{ cardId, targetIds?, costume?, rationale?, decline?, propose? }` |

引擎的驗收：`cardId` 不在牌面上 → 不採納並記 log；`targetIds` 不在該卡候選裡 → 丟棄；
`decline` 對死線卡無效。每次落牌寫入 `world.data.directorLog`，含**當時的牌面全集**
（`offeredCardIds`）——重放同一份 log ＋ 同一顆種子即重現整卷，模型不必在場。

### 2.5 導演自撰一張（`propose`）

牌組的天花板是：**作者沒寫的事就不會發生**。這是唯一一道穿過去的門，而它刻意開得很
窄——一個能憑空造後果的導演，就是悄悄拿回了世界狀態的寫入權，那正是牌組存在的理由。

所以「自撰」不是「讓模型描述一件事」，而是：**用作者用的同一套有限積木，在引擎執行
的量級上限內，對準真實存在的人，並限額**。自撰的牌能做的，一張作者寫的牌本來就做得
到；唯一新的東西是**沒有人得先想到它**。

| 項目 | 規則（`PROPOSAL_LIMITS`，引擎執行） |
|---|---|
| 可用後果 | `percept`／`want`／`renown`／`self-regard`／`object-state`／`weather`／`bill`／`leak-secret` |
| 一張至多 | 4 條後果 |
| 量級 | `renown`／`self-regard` ±0.08｜`bill` ≤5 圓、≤7 日｜`want` weight ≤0.8、≤7 日｜`weather` 60–120%｜`percept` ≤200 字 |
| 限額 | 一卷 3 張、一日 1 張 |
| 對象 | 只能是在班的人；`bill` 的 `fromAccountId` 只能是 `"@target"` |

**整類關死，各有其理**：`cast-enter`／`cast-exit`（造人、除人是全季最大的一張牌，走
作者宣告的 `newcomers` 池）；`wage-packet`／`dividend`／`patronage`（能造錢的導演能
把整季賴以成立的稀缺一次溶掉）；`reckoning`／`reckoning-notice`（那是有曆法的儀式，
不是興之所至）；`publish-secret`（見報屬於握著那個故事的角色）；`standing`（人心是
世界本身，不該由導演憑空鑄造怨氣）。

越界不會被悄悄修剪成別的東西——`validateProposal` 連同**每一條理由**駁回，寫進 tick
報告的 `proposalsRefused`，診斷報告裡看得見。通過的牌以 `chosenBy: 'director-proposed'`
落入同一本 log，並**逐字帶上 `proposedCard`**：那張牌不存在於任何牌組檔，log 不帶它
就重放不出來。

牌組今日一張牌都出不了時，導演座席**照樣**會被問（只要額度還在）——牌組見底的那一刻，
正是最需要作者沒想到的那件事的時候。

### 2.6 世情動作：角色自己造事件（`acts`）

牌組最初有一個形狀清楚的洞：**推世界的東西全在世界外面**。角色能想、能走、能說、能
花錢、能借錢，但真正把一生翻過去的那一類事——報官、退婚、當眾揭穿、罷演——不屬於任何
人。導演做不了（那不是導演的決定，是一個人的決定），班裡也沒有管道，於是它從不發生。

`acts` 補上這個洞，而且不重新打開牌組要關的那個洞：**世情動作在所有要緊的地方就是一
張牌**——作者寫的資料、宣告的門檻、同一套有限後果——差別只在誰能打。

```jsonc
{
  "id": "report-to-authorities",
  "label": "報官",
  "note": "……做了會怎樣（角色的選牌依據）",
  "invokableBy": { "roles": ["班主"], "names": ["方競西"] },  // 任一符合即可；都不給＝人人可做
  "minDay": 3,
  "requires": [{ "kind": "tension-peak-atleast", "value": 0.6 }],
  "needsTarget": true,             // 對人做的事
  "targetMustBeCoPresent": true,   // 預設 true：當面做
  "maxPlays": 2, "maxPlaysPerCharacter": 1, "cooldownDays": 6,
  "effects": [ /* 與事件卡同一套；另可用 "@actor" 與 on:"actor" */ ]
}
```

流程與導演選牌一模一樣，只是換了個座位：

1. `availableActsFor(world, deck, { characterId, day, coPresentIds })`——**純函數**，
   算出這個人此時此地真做得出來的事（行當／日子／狀態／對象在不在跟前／各種上限）。
2. beat prompt **只亮這幾張**（`ActBeatInput.acts`）。
3. beat 回 `{"act":{"id":"…","targetName":"…"}}`——角色決定**做不做、對誰做**。
4. tick 收集起來，在 7.85 用 `playAct` 結算：**再驗一次**（場上的人可能已經走了），
   通過才落地，並以 `chosenBy: 'character'` ＋ `actorId` 寫進同一本 log。

**世情動作專屬的兩個欄位**：`"@actor"`（帳落在做這件事的人頭上，如撂挑子的退票錢）與
`renown`／`self-regard` 的 `on: "actor"|"both"`（告官的人這條街也未必待見）。事件卡沒
有行為人，用了這兩個會在 `deck-check` 當場報錯。

**後果一律走既有機制**。報官不會產生一本新帳，它產生的是：對象頭上一筆真的罰銀
（`bill`）、被告的人一條**第一手**的冷 edge（不會淡）、街上其他人一條**聽說**的冷 edge
（照面多了會淡）、雙方交情被 `chillBond` 真的削掉、告官的人自己名頭掉一點。持續不還
錢會走到社會性死亡，是同一條鏈子——見 §4.5。

一日至多 `maxActsPerDay`（預設 2）件。這是**節奏**上限不是權限上限：任何一個人在他夠
格的日子都做得出那件事，但一條街消化不了一天五場公開決裂——五場之後每一場都不算數了。

### 2.7 攤子上的菜單（世情動作之外，另一個「都在做同一件事」的來源）

第一卷實跑「糖粥」出現 137 次，看起來像飢餓吸子，其實是**攤子上只有那一樣**：
`foodScenesOf` 把一個場景的吃食收斂成**一項**（最便宜的那樣），所以引擎從頭到尾只看得見
一碗粥。菜單多寫幾樣沒有用——它看不到。

- `mealsByScene()` 回**全部**（依價由賤到貴），`foodScenesOf()` 仍回最便宜那樣（「這裡吃
  得起嗎」問的是門檻）。
- `pickMealAt(world, sceneId, characterId, spendable, salt)` 決定**這個人此刻點哪一樣**：
  在買得起的範圍內按 (人, 日) 雜湊散開——同一攤十三個人不會點同一碗，同一個人也不會一季
  天天吃同一樣，而且確定性可重放。刻意**不**挑「買得起最貴的」：那聽起來像個性，實際上
  只是換一個有禮貌的吸子（有錢的天天蟹粉、沒錢的天天粢飯糰，菜單又剩兩樣）。
- `一日一餐` 跨整份菜單。逐項 `oncePerDay` 在賣兩樣時無害，賣十樣就等於一天可以吃十頓。

**買到的那一份是世上的東西**（`SeasonCatalogItem.spawnsObject`）：買一副生煎，世界裡就多
一個 portable 的 WorldObject 拿在買的人手上。這樣既有機制立刻全部適用——尤其是**贈物暖情**：
把它遞給別人，交情兩邊都升。「替她買了一副生煎」從此是發生過的事，不是一句敘述。

### 3. 追蹤開關（POV 與日記）

POV 散文是**呈現層**不是模擬層：機制需要的內心戲已經在每一拍的〔心下〕裡，全班照跑。
`--track 柳安春,方競西`（或 `world.data.trackedCharacterIds`）只把**最貴的那一步**
——每個見證者每場一次的 `povScene`——收窄到追蹤中的人；日記同理。

- **不給 `--track` ⇒ 全班都追**（與加這層之前逐位元相同）。
- 未追蹤者的台詞、心下、事件、手卷**照常完整記錄**，所以 POV 可事後補寫：
  `engine pov-backfill --out ./run --character 連翹 [--day 2]`。
- 下游依賴已改吃 beats：卷宗（`dossier-artifact`）在 POV 不足兩份時，用當事人**自己
  的台詞＋自己的心下**補出第二份視角，而不是不出卷宗。

### 4. 注資指令（觀眾注資）

錢必須走**世界內管道**進場：營運者永不直接改帳，而是打一個 channel，同時得到一筆真
帳、一個下一拍會被全班感知的世界事件、以及一份寫進世界狀態的花帳。

```bash
engine patron --out ./run --channel ticket --amount 6                       # 買票 → 班庫
engine patron --out ./run --channel flower --amount 2 --target 連翹          # 買花 → 殷阿婆的花攤，花到角色手裡
engine patron --out ./run --channel tip    --amount 4 --target 蘇映雪 \
       --patron "包廂裡一位闊客" --note "散戲後才遞上來"                      # 打賞 → 角色自己的荷包
```

`flowersByChar` 累在世界狀態上：某位領銜的花比同台的多出 `FLOWER_ENVY_GAP` 串時，
落後的那位得到**一樁妒火心事**（每對只生一次）——妒火的素材由此而來，不是憑空。
牌組也可以打同一條管道（`effects: [{"kind":"patronage", …}]`，如「堂會邀約」）。

### 4.5 月半結帳：引擎不碰任何人的錢

**設計更正。** 最初的版本到日會強制扣款。那是引擎伸手進別人的口袋，而且它讓
「打死不還」變成一個角色**演不出來**的選項——一個握不住的立場不是選擇，是佈景。

現在的結帳一分錢也不動。錢只有在角色自己用 `repay`（`season-economy.ts` 既有的動詞）
時才會離開口袋。到日抵達的是**叫帳**，後果是社會性的，而且**由債主決定**：

| 債主選 | 帳 | 名聲 | 門 |
|---|---|---|---|
| `forgive` 免了 | 一筆勾銷 | 街上記著他被放過（欠人情） | 照開 |
| `press` 當面催 | 還在 | 當面丟臉，話沒外傳 | 照開 |
| `broadcast` 傳出去 | 還在 | 滿街都知道，名頭重挫 | **這家的賒帳資格沒了** |

三件事讓它成立：

1. **預告**（`reckoning-notice`，結帳前兩日）：全街知道日子與摺子上的名字，每個欠帳
   的人拿到一樁帶死線的心事（`completion: bill-cleared`）——自己清了就 resolved，
   拖過去就 foreclosed。沒有這個窗口，「不還」與「沒機會還」分不出來。
2. **債主座席**（`SceneAgentPort.decideDebtStance`）：態度是債主的判斷，不是時鐘的。
   債主若真的不在意就免了——**那是他們的事**。座席不回話時退回確定性推定
   （`fallbackStance`）：真的還不出、債主又撐得住 ⇒ 免；手裡有錢卻沒還 ⇒ 先當面催、
   第二次就傳出去；催過 `PATIENCE_CALLS` 次 ⇒ 一律傳出去。**打死不還有軌跡，不是
   固定費率。**
3. **後果由既有機制承擔**（`core/standing.ts` —— 純推導，**不存任何欄位**）：
   `broadcast` 唯一做的事，是把**在場每個人對他的 edge 轉冷**（`setEdge` + `chillBond`
   + `bumpRenown`）。沒有獨立的口碑帳——街上怎麼看一個人，就住在既有的關係圖裡，
   否則同一件社會事實會有兩份會漂移的真相。

   然後**既有的門一扇一扇關上**，沒有一扇是為了這件事新開的：

   | 既有機制 | 讀什麼 | 關上時 |
   |---|---|---|
   | `welcome()` | edge tone／disposition | 夜裡沒人替他開門 |
   | `tabTrust()` | 同一個 `welcome()`（攤子有臉）或名頭（無臉） | 賒不到東西 |
   | `renownDrawPct` | 名頭 | 引不了座，不值得掛牌 |
   | `decideLend` | 冷關係 | 借不到錢 |

   **社會性死亡不是誰設的旗標**，是「一大半人轉冷＋沒有一張暖臉＋名頭見底」同時成立
   時的名字（`socialStandingOf`）。實跑四次結帳的軌跡：名頭 0.80 → 0.76 → 0.60 →
   0.32 → 0.00，冷 0 → 1 → 11，賒帳門在第一次就關了，第四次才真的死。

   **回得來，但不便宜。** 當事人的怨（第一手）帳清了就轉回中性；其餘人握的是**街談**
   （`聽說` 標記），只在**真的同場照面**的日子才淡（`fadeHearsay`，跟 `decayBonds`
   同一個夜間槽、同一個 `togetherToday` 訊號）。所以要洗刷，得還錢，還得在所有人都
   冷著你的時候繼續出現在人前。

   唯一新增的原語是 `chillBond`——`bumpBond` 只會加溫而且雙向，交惡需要**單向**降溫，
   而且要連 `peak` 一起蝕，否則「時間冷卻永不低於 floorOfPeak · peak」會讓任何人做的
   任何事都奪不走一段已經掙來的交情。

### 5. 秘密、心事生命週期、生理需求

- **秘密**（牌組 `secrets[]`）：`holderNames`／`aboutName`／`coveterNames`／
  `leakWhen`（`day-atleast`｜`holder-renown-below`｜`holder-broke-below`｜
  `coveter-copresent`）。洩漏不可逆；**記者知道任何秘密即自動長出一樁帶死線的
  「發不發」**——見報則 resolved，壓過死線則 foreclosed，兩條路都會離開願榜。
- **心事生命週期**：`dueDay`（到日 foreclose，本人收到一句）＋ `completion`
  （`bill-cleared`｜`flowers-caught`｜`purse-atleast`｜`secret-published`，成立即
  resolved，不需模型判決）。兩者皆缺 ⇒ 與過去完全相同。
- **`trigger.requires` 的完整清單**：`account-runway-below`｜`account-below-yuan`｜
  `outstanding-debt-atleast-yuan`｜`tension-peak-atleast`｜`live-wants-atleast`｜
  `cast-atleast`｜`secret-leaked`｜`production-premiered`。同一組條件也可以當作
  effect 的 `onlyIf`。
- **生理需求降級**：不具戲劇相關性的餓**離場結算**（扣錢＋一句帶過，不移動、不佔戲）。
  留在戲裡的只有四種人：已站在食擔前的（交給順路而食）、**付不出錢的**（稀缺不修）、
  餓到 `HUNGER_STARVING` 的、以及最餓的 `HUNGER_ONSTAGE_CAP`（＝2）位。八個人同奔一
  碗糖粥的收斂由此封頂。

### 6. 生命體徵（診斷卷宗）

每拍計算、寫進 `ticks.jsonl`，並在診斷導出（`/lab` header 的「診斷導出」）多出一節
「生命體徵（宏觀節奏）」：

| 指標 | 讀法 |
|---|---|
| **不可逆事件數** | 這一拍有幾件事再也回不去。全 0 的拍＝世界原地踏步。 |
| **want resolved 率** | 故事的心跳。resolved ÷ 已離開願榜的總數；0 ＝這個世界沒有任何事真的了結。 |
| **場景熵** | 1 ＝各在一方，0 ＝全擠一處；另附「最擠一場幾人」。 |
| **收斂／迴圈** | 同一拍多少人指向同一句（糖粥偵測器）；同一人連幾拍反覆同一句。 |

指標**只是診斷**：引擎沒有任何分支讀它們，所以噪音只會誤導讀者，永遠不會改動世界。

## Architecture rules

- May depend on `@endless-story/shared`, `@endless-story/llm`,
  `@endless-story/runner`. **Never** imports `packages/web`, Next.js, or
  `@mysten/sui`.
- The pure narrative modules live here now; `packages/web` imports them from
  `@endless-story/engine/core/*`.
- The main barrel is node-clean (no eager runner `.js` graph); `RunnerSceneAgent`
  lives at `@endless-story/engine/adapters/runner` and is loaded only by the CLI
  under `tsx`.

## Deferred

- **M1** — per-beat scene closure (resolve / leave / stall); night-window
  consolidation (sleep compression × relationship-evolve × self-reflect ×
  autobiographical L2 promotion, per CHARACTER_LIFECYCLE §3–4); centrality thread
  selection; first-person POV serial prose.
- **M2** — chain Archive adapter (commitment / event), MemWal Recall adapter,
  Seal, economy ledger, image pipeline.
- **M3** — death → distill → reincarnate; plasticity curve.
