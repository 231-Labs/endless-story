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

想換模型（例如用 Claude 寫章回看品質上限）：

```bash
AI_PROVIDER=poe POE_API_KEY=... POE_MODEL_PRIMARY=Claude-Sonnet-4.6 \
  node experiments/novel-lab/sim/run.mjs --ticks 3
```

## 旗標

| 旗標 | 預設 | 說明 |
|---|---|---|
| `--ticks N` | 3 | 跑幾個 tick |
| `--dry` | off | 不呼叫 LLM；卡牌用啟發式，POV/合本只印組好的 prompt（驗接線用） |
| `--no-sequel` | off | 不生餘波回（省 token） |
| `--showrunner-every N` | 1 | 每 N tick 更新一次弧線計畫 |
| `--out PATH` | logs/sim-<時間>.log | log 輸出位置 |

## 它跑的就是「世界自己走」

每個 tick：`PLAN(角色自更新打算) → DRAMA(張力排序) → SPINE(開最熱標的的事件) →
ACT(各自出牌·這步決定走向) → RESOLVE(決定性判決·誰的牌最強誰奪標的) →
POV(每人一章) → 合本(梨園版) → 餘波回(輸家的安靜戲) → SHOWRUNNER(更新弧線)`。

**走向不是寫死的**：判決由各角色出的牌（cheap LLM 依人設＋secret 自選）決定，資源易手後
下一 tick 的張力自動重排。三條接線都接上並會印在 log：
1. **結構化代價**（輸家失去的標的 ↔ 他 plan 裡所求）
2. **定向私帳召回**（每章調出該角一條 secret 記憶，輪替）
3. **arcPlan 接到筆上 + 回數**（showrunner 的弧線座標餵進寫作 prompt）

## token 用量（粗估）

每 tick ≈ `PLAN(3 cheap) + ACT(2–3 cheap) + POV(2–3 primary) + 合本(1 primary) +
餘波(1 primary) + showrunner(1 cheap)`。3 tick 約 25–35 次呼叫。先 `--dry` 驗接線、
再小量真跑。

## 跑完

log 會存到 `sim/logs/`。**把整份貼回給 Claude**，比對「機制決策 + 私帳召回 + 弧線承接 +
實際文風」是否跟手稿（`../outputs/run-*.md`）一致。一致 → 正式實作進 tick-loop + 部署。
