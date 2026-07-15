# @endless-story/season

鏈解耦的**個體化記憶驗證 harness**。用一個小劇情季《嫌隙》跑柳生春／金鳳／蘇映雪，證明一件事：

> 一段共同經歷，如何在不同角色身上留下**不同的**改變，並在未來造成**可觀察的行為差異**。

定位等同 `packages/economy` 之於經濟層、`packages/troupe` 之於製作層：先在純 package 裡把機制驗證過，**上鏈／接 MemWal 是 gate-after**。設計理路見 [`WRITEUP.md`](./WRITEUP.md)；對應的敘事鐵則見 [`docs/narrative/NARRATIVE_AGENTS.md`](../../docs/narrative/NARRATIVE_AGENTS.md) §5（主觀記憶 / 不強制 canon）。

## 跑

**零依賴、零安裝**（LLM client 是 harness 自帶 fetch 版，不 import `@endless-story/llm`）。只需 **node ≥ 22.18**（原生跑 TS）。

```bash
# 無金鑰，deterministic 本機模型（結構、五層記憶、六項指標全部照跑，可重現）
node packages/season/driver/report.ts          # PASS/FAIL 閘門（純文字）
node packages/season/driver/run.ts --mock       # 落 out/ 全套產物

# 有金鑰，真 LLM（注意力／五層蒸餾／台詞由模型長出來）
AI_PROVIDER=poe POE_API_KEY=你的key node packages/season/driver/run.ts

# 測試（不變量 + 六項假設，全 mock、可重現）
node --test "packages/season/test/**/*.test.ts"
```

傳 key：讀 `ZAI_API_KEY` / `POE_API_KEY` / `ANTHROPIC_API_KEY`（`AI_PROVIDER` 可指定），行內或放 `packages/season/.env.local`（`pnpm --filter @endless-story/season run` 會自動載 `.env.local` 與 `../web/.env.local`）。沒有 key → 自動 deterministic。

## 它輸出什麼（`out/`）

| 檔 | 內容 |
|---|---|
| `00_report.md` | 六項評估 + 不變量的 PASS/FAIL |
| `01_divergence.md` | **一場談話 → 三份私人現實**；匿名行動 → 認得出是誰；有無往事金鳳選擇就不同 |
| `10_<id>_<名>.md` | 每個角色的**五層私人記憶流** + 季末自優化後的傾向／關係／帳本 |
| `result.json` | 完整 `SeasonResult` 狀態快照 |

## 模型（`src/`）

一場戲，對每個在場角色跑（她**只**讀自己的既有狀態，看不到別人的私密記憶）：

```
(enacted) ENACT  依累積的記憶行動 → 產生這場的台詞
PERCEIVE         人格先決定：她注意哪句、把它讀成體貼／敷衍／試探／羞辱…
DISTILL          蒸餾成五層私人記憶
INTEGRATE        夾限地折回她的狀態（人格緩慢改變，不因一場戲翻轉）
```

五層（只有第一層近乎事實，其餘允許偏見、誤解、合理化）：
**1 經歷** ｜ **2 解釋** ｜ **3 關係更新** ｜ **4 自我敘事** ｜ **5 行為傾向** ＋ 可兌現的 **承諾／怨懟／疑問／風險**。

- `types.ts` 五層記憶模型 · `perceive.ts` 注意力 · `distill.ts` 蒸餾 · `integrate.ts` 自優化（夾限） · `enact.ts` 差異化行動 · `engine.ts` 季迴圈 · `metrics.ts` 六項評估。
- `fixtures/chunxue.ts` 三個角色（柳生春／**金鳳**（新增）／蘇映雪）· `fixtures/season.ts` 劇情季《嫌隙》。

## 驗了什麼（deterministic，全綠）

| | 評估準則 | 對應設計問題 |
|---|---|---|
| **M1** | 同一事件形成彼此不一致的記憶 | 「同一事件是否形成角色特有、彼此不完全一致的記憶」 |
| **M2** | 從匿名行動辨認是哪個角色 | 「幾輪之後能否從匿名行動辨認是哪個角色」 |
| **M3** | 抽掉關鍵一場戲，後續選擇就不同（因果） | 「過去經驗是否真正改變後續選擇，而不只被台詞提及」 |
| **M4** | 誤解與認知落差被保留、不被和解 | 「角色之間是否保留誤解、秘密與認知落差」 |
| **M5** | 人格漸變，不因一場對話突然翻轉 | 「人格能漸變，但不因一場對話突然翻轉」 |
| **M6** | 留下日後可兌現的承諾／怨懟／疑問／風險 | 「對話是否產生了日後可兌現的承諾、怨懟、疑問或風險」 |
| **INV** | 私密記憶不跨角色滲漏、無全知、夾限恆成立 | 隱私界線 = 敘事引擎（§5 鐵則） |

## 不在這裡（gate-after）

把五層記憶接上真 MemWal 的 kind（observation / reflection / relationship / genesis / plan）、把「行為傾向」接進導演的意圖推導（NARRATIVE_AGENTS §8c「記憶調變的慾望」）、把季迴圈接進真實 tick loop。先用這個 harness 驗「個體化記憶站得住」，再逐層搬。詳見 [`WRITEUP.md`](./WRITEUP.md) §Port path。
