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
（分紅）｜`reckoning`（月半清算）｜`patronage`（注資）｜`bill`（按期債；
`fromAccountId` 可用 `"@target"` 指這張卡對準的人）｜`want`（種一樁帶死線的心事）｜
`renown`／`self-regard`｜`weather`（`housePct` 直接折座）｜`object-state`｜
`leak-secret`／`publish-secret`｜`cast-exit`（離班＋孤兒資產強制重分配）｜
`cast-enter`（只能取 `newcomers` 池裡的人）。

### 2. 導演的輸入與輸出

導演是 `SceneAgentPort.pickEventCard`，職權**只有三件事**：選哪張卡、何時打（按牌
不打）、對準誰；外加把卡面**穿上戲服**。後果全由引擎結算，導演不碰任何數字。

| 方向 | 內容 |
|---|---|
| **輸入** | `day`／`clock`；`offered[]`（每張卡的 `cardId`／`label`／`note`／`forced`／**可對準的候選 id＋姓名**／`pickCount`）；`worldBrief`（**純散文世情**：燒得最旺的幾樁心事、班庫「緊得很／尚有餘裕」、街上賒著的帳、還沒發的事、已離班的人——**沒有任何數字**）；`forcedCardIds` |
| **輸出** | `{ cardId, targetIds?, costume?, rationale?, decline? }` |

引擎的驗收：`cardId` 不在牌面上 → 不採納並記 log；`targetIds` 不在該卡候選裡 → 丟棄；
`decline` 對死線卡無效。每次落牌寫入 `world.data.directorLog`，含**當時的牌面全集**
（`offeredCardIds`）——重放同一份 log ＋ 同一顆種子即重現整卷，模型不必在場。

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

### 5. 秘密、心事生命週期、生理需求

- **秘密**（牌組 `secrets[]`）：`holderNames`／`aboutName`／`coveterNames`／
  `leakWhen`（`day-atleast`｜`holder-renown-below`｜`holder-broke-below`｜
  `coveter-copresent`）。洩漏不可逆；**記者知道任何秘密即自動長出一樁帶死線的
  「發不發」**——見報則 resolved，壓過死線則 foreclosed，兩條路都會離開願榜。
- **心事生命週期**：`dueDay`（到日 foreclose，本人收到一句）＋ `completion`
  （`bill-cleared`｜`flowers-caught`｜`purse-atleast`｜`secret-published`，成立即
  resolved，不需模型判決）。兩者皆缺 ⇒ 與過去完全相同。
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
