# novel-lab · 章回「沒有小說感」診斷實驗

解耦於主代碼（不在 pnpm workspace），用來定位「為什麼生成的章回像觀察、可有可無」。

- **`REPORT.md`** ← 從這裡開始讀。診斷結論 + 雙書分類 + IA 重設計 + 落地建議。
- **`DAILY_LIFE.md`** ← 非事件日常戲/溫情戲/鋪陳怎麼寫（Sequel 模板 + 四選一 delta + 四種非競爭章回）。
- `materials/`
  - `cast-genesis.md` — **真實創世卡司**速查（secret 欄＝現成私帳）⭐
  - `cast.md` — 早期杜撰卡司（孟/顧，僅供結構對照）
  - `event-01-thin.md`(現況) / `event-01-rich.md`(增補) / `event-02-rich.md`(唱片事件範例)
  - `event-03-trio-branches.md` — **真卡司三人組事件 × 三種劇走向** ⭐
  - `daily-01-rich.md` — 溫情日常材料（Sequel 模板）
- `variants/` — `prompt-A-current.md`(現況) / `prompt-B-redesigned.md`(重設計)
- `outputs/` — 樣本（每篇附自評）
  - `run-A1/A2/B1/B2`、`run-C_cut`(梨園版合本) — 2×2 消融
  - `run-D_event03_三走向_柳生春` — 同開場三結局 ⭐
  - `run-E_溫情_柳生春` — 安靜但不空的溫情回 ⭐

一句話結論：**材料層（事件無結算/無戲劇結構/無私帳）+ prompt 層（為防捏造而禁掉劇情）
+ 連續性層（無書級結構/回數沒接線）三者同時缺，且互相掩蓋。只改一個都不夠。**
