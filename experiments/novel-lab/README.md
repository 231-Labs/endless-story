# novel-lab · 章回「沒有小說感」診斷實驗

解耦於主代碼（不在 pnpm workspace），用來定位「為什麼生成的章回像觀察、可有可無」。

- **`REPORT.md`** ← 從這裡開始讀。診斷結論 + 雙書分類 + IA 重設計 + 落地建議。
- `materials/` — 餵 POV 的材料：`cast.md`、`event-01-thin.md`(現況) / `event-01-rich.md`(增補)
- `variants/` — `prompt-A-current.md`(現況) / `prompt-B-redesigned.md`(重設計)
- `outputs/` — 2×2 消融樣本（A1/A2/B1/B2/C），每篇附自評

一句話結論：**材料層（事件無結算/無戲劇結構/無私帳）+ prompt 層（為防捏造而禁掉劇情）
+ 連續性層（無書級結構/回數沒接線）三者同時缺，且互相掩蓋。只改一個都不夠。**
