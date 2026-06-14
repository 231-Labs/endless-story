# 自治機制對照：我 mock 的東西，世界自己走時拿不拿得到？

> 你的提醒對：重點是**測方法、不是測控制**。我前面 event-02/03 用「班主拍板」「我手寫 stakes/代價」
> 是為了把方法講清楚，但真正要回答的是——**這些料，自治 loop 能不能自己長出來，不靠我選走向？**
> 我讀了實際程式碼（tick-loop.ts / genesis-memory / showrunner.ts / act 判決），逐項誠實標註。

---

## 結論先講

**我 mock 的料，大部分你機制裡已經有來源、且是自治產生的**——所以方法成立，不是只能靠手動編。
但有 **3 個真缺口**讓這些料現在「到不了寫章回的那一刻」。修的是「**接線**」，不是「加控制」。

---

## 逐項對照（mock 元素 → 自治來源 → 狀態）

| 我 mock 的料 | 世界自己走時的來源 | 狀態 |
|---|---|---|
| **誰贏/結局** | **不是班主拍板**。`act.ts deriveVerdict` 從角色**自己出的牌**＋intent 排序**決定性**派生；event-spine resolve 把稀缺資源轉給贏家 | ✅ **完全自治**。我 run-D 的「三走向」＝三種角色可能打出的牌的結果，不是我選的 |
| **賭注 stakes** | `dramaHint`＝角色當下渴望的 DramaResource（`爭得「partnership:柳生春」`），自治算出 | ✅ 有，但**薄**：只點名資源，沒說「贏/輸各代表什麼」 |
| **轉折 turn** | 本 tick 的牌＋verdict，注入 triggerNarrative（tick-loop.ts:876-885） | ✅ 自治 |
| **結算 outcome** | event-spine `resolve_event` + 資源易手（`eventSpine` flag，待真鏈驗） | ✅ 有（flag-gated） |
| **代價 cost** | verdict 那句已要求「得了什麼**失了什麼**、下一步打算」(tick-loop.ts:884) | 🟡 **有提示、無結構**：輸家失去資源是事實，但「這對他**意味著**什麼」沒被框出來 |
| **私帳 private ledger** | ⭐ `genesis-memory` 把 `candidate.secret` 當 `privateBackstory` 蒸餾成**私密記憶**存進 MemWal（index.ts:46-48） | 🟡 **種子已在**，但 POV 靠 `memoryContext.recent(id,trigger,4)` **相關度召回**，**不保證**在關鍵戲掀到那條 secret |
| **書級脈絡（回數/承上/主問）** | ⭐ **Showrunner 真的有**：`arcPlan` 持久化「主題/張力線/已埋伏筆/干預」(showrunner.ts:79) | ❌ **arcPlan 只餵 Showrunner 自己決定開哪條張力線；沒有注入 POV/合本的寫作 prompt**——弧線塑造的是「發生什麼事」，不是「章回文字怎麼承上啟下」 |
| **餘波/溫情（日常）** | SOCIAL/GIVE/PLAN phase 每 tick 自治在跑、寫 relationship memory | ❌ 沒被織成「餘波回/溫情回」；只當經濟/關係訊號，沒進章回 |

---

## 三個真缺口（要建的是接線，不是控制）

### 缺口 1 — 代價沒有「結構化」
verdict 只丟一句「失了什麼」給 LLM 自由發揮。**自治可做的修法**：event-spine resolve 已經知道
「誰失去哪個資源、那資源對他 plan 多重要」——把這個**派生成一句結構化 cost**（如「你失去的
`partnership:柳生春` 正是你 plan 裡『穩住搭檔位』的命脈」），注入 trigger。料是鏈上+plan 自動算的，不是我編的。

### 缺口 2 — 私帳召回沒「在戲劇點上瞄準」
secret 已是私密記憶，但召回是泛相關度。**自治可做的修法**：在「本角是事件參與者且事件結算」這種
戲劇高點，POV 召回**多撈一條 kind=secret/genesis 的高 importance 記憶**（定向召回），讓「原來如此」
那一層有機會浮出。仍是角色自己的記憶，不是外部編劇。

### 缺口 3 — Showrunner 的 arcPlan 沒接到「筆」上（最重要）
這是「湊不成一本書」的根因。Showrunner 已經在維護弧線、埋伏筆，但**寫章回的 prompt 看不到它**。
**自治可做的修法**：POV/合本 prompt 加一個 `arcContext`，餵入 arcPlan 裡跟本事件相關的
「主題一句／這條線上一個節點／本回在弧線的位置」。Showrunner 仍**不寫台詞、不選角色怎麼演**
（它的鐵則沒破），它只給「這一回在整本書的哪裡」這個**書級座標**——剩下角色自治發揮。
＋ 回數 N：用 Showrunner 已知的「這條張力線第幾個結算事件」當回數，自動編號。

---

## 對你那句「事件沒關閉所以寫不出結局」的最終回答

**不是事件設計關不掉，是兩件事**：
1. **事件層**：storylet 預設不結算（鬼打牆）→ 開 `eventSpine` 就會「逼出決定＋資源易手」＝自動有結局。
   （run-D 的三走向證明：只要 resolve 發生，結局自己會落定，落在哪由角色的牌決定，不需我選。）
2. **章回層**：就算事件結算了，現況 prompt（怕捏造→禁劇情）會把「結局的後座力」寫成觀察。
   → 換 prompt-B 取向 + 補上面三條接線，自治世界就能寫出「有結局、有後座力、湊得成書」的章回。

**全部不需要我決定走向。** 我要做的實驗下一步＝把這三條接線做成**能在你 tick-loop 裡跑的真改動**
（而非 mock），然後在有 LLM key 的環境跑 `world-loop` 真比對 A/B。
