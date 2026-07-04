# Narrative Profile — prompt 與引擎的分層

> 一句話：**引擎機制住在代碼裡，敘事內容住在資料裡。** 同一套引擎跑任何世界
> （梨園、鬼物種世界、武俠），差別全在 profile 資料。

## 三層

| 層 | 住哪 | 內容 | 誰能改 |
|---|---|---|---|
| **ENGINE 機制** | 代碼（`packages/llm/src/prompts/`、runner prompt builders） | 敘事鐵則、決策 JSON schema、forcing 語言、感知邊界 | 引擎版本控管＋測試 |
| **WORLD 世界** | story preset `world.narrative` ＋ `world_rules` | genre_base 文體、species、屬性表、貨幣 | 世界創建者 |
| **SAGA 敘事域** | story preset `saga.narrative` ＋ 鏈上 `Saga.description` | tone_register / emotional_stance、contention framing 措辭、features（event_image / stills / video） | saga 經營者 |

解析順序：saga 覆蓋 → world 覆蓋 → 引擎預設。任何欄位缺席＝引擎預設，
行為與未配置時逐字節相同。

## 資料流

```
packages/cli/scripts/stories/<preset>.json
        │  NARRATIVE_STORY_PRESET env（預設 spring-snow）
        ▼
web chain/narrative-profile.ts  ── tick 開始時 installNarrativeProfile()
        │
        ├─ soul（genreBase / toneRegister / stance）→ pov-core → runner buildSystemPrompt
        ├─ framings → event-planner setFramingCatalog（label 換、templateId 不動＝結算鍵不變）
        └─ features → 內容管線閘（event moment 圖、劇照、影片）
```

觀察台的 `saga-soul-override` 永遠優先於 profile（實驗自由度不受影響）。

## 為什麼這樣切

- **多 world / 多 saga**：鬼物種 world＝換 `world_rules.species`＋genre_base；
  鄰接的霞飛路市井 saga＝同 world、換 saga.narrative（市井 framing、自己的
  tone）；遠方峨眉分支＝另一個 world profile。引擎零改動（§2.49 已驗
  content-agnostic）。
- **用戶經營 saga**：narrative 區塊就是將來 saga 經營後台的存檔形狀——文風、
  分級（emotional_stance 上限）、要不要出圖出影片，都是 per-saga 商業決策。
- **經濟公平**：framing 只能換 label，templateId 與結算邏輯引擎持有，
  經營者改不了誰贏稀缺槽。

## Phase 2（未做）

- runner 決策模組（confess / governance / proposal…）的 prompt 遷入
  `packages/llm/src/prompts/` registry（build/parse 模式），內容行吃 profile。
- storyteller / gazette / 章回編織 prompt 同樣分層。
- profile 存儲從 preset json 升級到鏈上（saga 經營者簽名更新）＋後台編輯 UI。
