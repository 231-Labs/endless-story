# 解耦 tick 模擬器（sim/）

用**真 LLM**跑幾個 tick，確認「把重設計方法融進機制後，自治產生的材料能不能讓模型寫得跟手稿一樣好」。
**完全不碰鏈 / sdk / memwal / pnpm workspace**——純 Node，零依賴（用 Node 內建 `fetch`）。

## 怎麼跑

需要 Node ≥ 18（你環境是 23.7，OK）。設好**你現有的** LLM key 之一即可（跟 prod 同一套）：

```bash
# 用 Poe（跟線上同一個端點與預設模型 GLM-5.1-FW / GLM-4.7-N）
AI_PROVIDER=poe POE_API_KEY=你的key \
  node experiments/novel-lab/sim/run.mjs --ticks 3

# 或 Z.AI / Anthropic
AI_PROVIDER=zai ZAI_API_KEY=...      node experiments/novel-lab/sim/run.mjs --ticks 3
AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... node experiments/novel-lab/sim/run.mjs --ticks 3

# 想先看「機制接線 + 組好的 prompt」而不燒 token：
node experiments/novel-lab/sim/run.mjs --ticks 2 --dry
```

### 一鍵完整跑（無人值守，跑完一次貼回來）

```bash
AI_PROVIDER=poe POE_API_KEY=你的key \
  node experiments/novel-lab/sim/run.mjs --ticks 6 --with-tender --book all --seed 7
```

一條指令涵蓋：6 tick 競爭（POV＋合本＋餘波＋班主介入＋showrunner 弧線）→ 柳蘇感情戲 →
最後把每個角色的「角色版連載」整本順印 + 梨園版合本。約 70–90 次 LLM 呼叫，可去做別的事。
（嫌久或省 token：降 `--ticks 4` 或加 `--no-sequel`。）

想換模型（例如用 Claude 寫章回看品質上限）：

```bash
AI_PROVIDER=poe POE_API_KEY=... POE_MODEL_PRIMARY=Claude-Sonnet-4.6 \
  node experiments/novel-lab/sim/run.mjs --ticks 3
```

## 旗標

| 旗標 | 預設 | 說明 |
|---|---|---|
| `--ticks N` | 3 | 跑幾個 tick |
| `--compare` | off | 每角色同材料出 A 現況 / B 重設計兩篇盲評 |
| `--tender` | off | **感情戲模式**：只跑柳生春×蘇映雪同一刻兩視角，測 LLM 抓不抓得到「愛而不得」 |
| `--with-tender` | off | 跑完競爭迴圈後，**附加**一場柳蘇感情戲（一條指令把全部跑完） |
| `--book [名\|all]` | off | 跑完把每個角色的章回**按時間順序整本輸出**（角色版縱切），外加梨園版合本（橫切）。`--book all` 全印 |
| `--hand N` | 3 | 每人發幾張手牌（從 catalog 抽，不見得有強牌） |
| `--seed N` | 7 | 發牌亂數種子（同 seed 可重現整局） |
| `--dry` | off | 不呼叫 LLM；卡牌取手牌最強，POV/合本只印組好的 prompt（驗接線用） |
| `--no-sequel` | off | 不生餘波回（省 token） |
| `--showrunner-every N` | 1 | 每 N tick 更新一次弧線計畫 |
| `--out PATH` | logs/sim-<時間>.log | log 輸出位置 |

### 出牌模型（忠實對齊代碼）

不是石頭剪刀布式克制。每樁事件**發 N 張手牌**（catalog：斬/攻/守/誘/亮/觀/讓），角色**從手牌選一張**
（不見得抽到強牌）；判決＝**intent 底分 + 角色屬性加權**最高者勝（對齊 `card_weight_rules`）。
所以「最狠的人」不會每輪都贏——要抽到強牌、又要屬性吃得上。**克制不在你現有代碼裡**；要的話可另加一層。

### 班主介入（破壟斷 + 護搭檔）

一人同時攬下 ≥2 標的時，班主沈雪笙自動出手（隔 ≥2 tick 一次）：生成她的 POV（懷錶舊事私帳），
並**鎖住「柳生春的固定搭檔位」歸柳蘇**（不再被爭）＋**令壟斷者下一輪輪空**，把機會勻給連翹/江聞鶴。

### 卡司（已擴充）

柳生春(坤生)、蘇映雪(花旦)、江聞鶴(乾生)、沈雪笙(班主)、方競西(記者)、何阿喜(丑)、
**唐桂蘭(衣箱·新)**、**連翹(刀馬旦·新，爭頭牌)**。柳蘇人設已改為**相親相愛**（去嫉妒、加「愛而不得」）。

## 它跑的就是「世界自己走」

每個 tick：`PLAN(角色自更新打算) → DRAMA(張力排序) → SPINE(開最熱標的的事件) →
ACT(各自出牌·這步決定走向) → RESOLVE(決定性判決·誰的牌最強誰奪標的) →
POV(每人一章) → 合本(梨園版) → 餘波回(輸家的安靜戲) → SHOWRUNNER(更新弧線)`。

**走向不是寫死的**：判決由各角色出的牌（cheap LLM 依人設＋secret 自選）決定，資源易手後
下一 tick 的張力自動重排。三條接線都接上並會印在 log：
1. **結構化代價**（輸家失去的標的 ↔ 他 plan 裡所求）
2. **定向私帳召回**（每章調出該角一條 secret 記憶，輪替）
3. **arcPlan 接到筆上 + 回數**（showrunner 的弧線座標餵進寫作 prompt）

另有兩道品質防線（2026-06-13 加）：
- **翻譯層**：機制 token（卡牌〔斬/攻〕、資源原始標籤 `recording:…`）一律先翻成敘事表面
  （「把話說死、半分餘地不留」「春雪社第一張唱片的灌錄權」）才進寫作 prompt——正文不再漏出機制符號。
  （`【RESOLVE】` debug 行仍印卡符，那是機制 log，不影響 prose。）
- **自檢步驟**：每篇生成後跑 `auditProse` lint（行當↔性別↔道具↔戲碼↔代詞↔token 一致性），
  例如「坤生/乾生是小生俊扮，不掛髯口」「定軍山是老生戲」「蘇映雪是女性應用她」。
  B 路徑抓到硬傷會**指出並改寫一次**；A 路徑（現況基準）只標記不改寫，讓你看見現行 prod 會犯的錯。
  log 裡每篇都有 `【自檢】✓/✗`。

## token 用量（粗估）

每 tick ≈ `PLAN(3 cheap) + ACT(2–3 cheap) + POV(2–3 primary) + 合本(1 primary) +
餘波(1 primary) + showrunner(1 cheap)`。3 tick 約 25–35 次呼叫。先 `--dry` 驗接線、
再小量真跑。

## 跑完

log 會存到 `sim/logs/`。**把整份貼回給 Claude**，比對「機制決策 + 私帳召回 + 弧線承接 +
實際文風」是否跟手稿（`../outputs/run-*.md`）一致。一致 → 正式實作進 tick-loop + 部署。
