# 敘事研究線規則（AI 接班必讀）

> 你若正要在這個 repo 做敘事實驗或改敘事引擎，先讀完這一頁再動手。
> 這條線的完整脈絡在 `internal/research/narrative-emergence.md`（gitignored，
> 在 main checkout 與 research worktree 的 `internal/` 裡；新 worktree 沒有，去那兩處讀）。
> 引擎設計定稿在 `internal/docs/RUNNER_V2.md`。

---

## 分支紀律（違反這條就是這份文件存在的原因）

- **R1 · research 分支只准改三種東西**：本目錄（`full-tick-harness/**` 的實驗
  /preset/harness）、`internal/**`、以及這類研究記錄檔。**生產檔一律禁改**
  （其餘 `packages/**` 都算生產檔，包括 tick-loop、chain/、runner services）。
- **R2 · 要動生產代碼 → 開 `feat/*` 分支對 dev 發 PR**。解耦驗證完的機制要接回
  runner 時也一樣：從 research cherry-pick 到 feat/*，不要直接落在 research 上。
  （2026-07 前直接落在 research 上的那批 port 已由 [PR #76](https://github.com/231-Labs/endless-story/pull/76) 分四簇清償對 dev；別再增加新的。）
- **R3 · 常駐分支只有三條**：main（凍結交付）/ dev（重構專線）/ research（研究）。
  `claude/*` session 分支用完即丟。

## 實驗紀律

- **E1 · 先解耦，不跑 loop**。每個機制抽成純函數或單點決策，寫一支
  `*-selfdrive.ts` 餵控制變數。解耦測試比整輪 loop 快兩個數量級。
- **E2 · 一定有對照臂**，一次只變一軸。沒有對照的結果不寫進台帳。
- **E3 · 判讀以機械 counter 為準，LLM 評審只當質地參考**。評審假陽性、假陰性
  都有實錄在案（台帳 §2.33 鐵律③、§2.51）。counter 抓不到的，去讀原文。
- **E4 · 不導演**。prompt 不寫答案（forcing 只抽掉拖延、不指示做什麼）；壓力來自
  湧現事件不是 fiat；參數從世界事實推導不是憑空旋鈕。自己搶話塞進情境的設定，
  要在台帳留「誠實記號」。
- **E5 · 跑完必記帳**：台帳 §2 新條目（問題→機制→測試→結果）＋ §4.0 狀態表，
  commit 訊息格式 `research(narrative): <一句話>（§2.x）`。
- **E6 · 證據保全**：HTML 報告與 log 別留在 `/tmp`（重開機就沒了），收進
  `internal/research/artifacts/<日期>-<主題>/`。
- **E7 · 接回 runner 前查台帳 §4.0b 互動矩陣**，共用狀態的機制先驗「不互相干擾」
  再接線。

## 生產接線紀律（feat/* PR 裡遵守）

- **P1 · 新機制＝純函數模組＋單測**。純核心不 import sdk、不用 `@/` alias、
  相對 import 要帶 `.ts` 副檔名，否則 `pnpm test`（node --test）載不動
  （前例：relationship-core.ts 的抽取）。
- **P2 · flag-gated 預設 off**（`TICK_*` 環境旗標）、failure-isolated，
  合併後預設行為零變化。
- **P3 · 選擇與結算分離**：steering overlay（fatigue、attention、centrality 這類）
  只准影響「誰被搬上台」，**絕不碰確定性結算**（誰贏稀缺槽＝經濟公平，台帳 §2.35）。
- **P4 · 感知邊界**：任何新資訊通道（注夢、狀態、關係）都要問一句
  「別的角色讀得到嗎」；私有的東西只能透過公開行動外洩。

## 環境坑（跑實驗前）

台帳 §6 有完整版。最常踩的：provider 是 auto→zai（別寫死 Poe bot id）、
node23 跑法 `TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> <script>`
（cwd＝packages/web）、多 call 腳本一律包 chatRetry、長跑接電源別闔蓋。
