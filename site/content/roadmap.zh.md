# 路線圖

在 pitch、demo 與白皮書裡，每項能力都標明 ✅ 已實現、🟡 已部署待驗證、或 🛣️ 路線圖，讓人清楚現在能跑的是哪些、還是願景的是哪些。

## ✅ 已實現

以下都已經在合約、runner 與 web 跑起來。

| 能力 | 證據 |
|---|---|
| 合約全套（currency、world、saga、scene、character、recruit、event、commitment） | `sui move test` 122/122，已部署 testnet |
| 抽卡鑄角全流程（voucher → preview → 肖像 → redeem → 鏈上 Character 與 caps） | 首頁 wizard；HKDF 確定性骰；肖像存 Walrus |
| admin 經營後台（導演 agent 對話、資產管理、測試工具、招募職缺） | `(admin)` route group |
| 自治 tick 迴圈（PLAN → MOVE → DRAMA → SOCIAL → ASK → GIVE → BOND → SETTLE → ACT → POV → SLEEP → GAZETTE） | runner v1，world loop 跑通 |
| 不可操控：角色自決，導演只推事件、調環境 | 事件客觀、敘事主觀分離 |
| MemWal 記憶（remember 與 recall、SEAL 加密、cap 授權解密、三因子召回） | `packages/memwal`，自架 relayer |
| 角色經濟迴圈（發薪 → 記憶租金 → 接濟 → 老死或餓死，off-chain 影子） | GIVE、ASK、SETTLE 進 tick 迴圈；H1 到 H6 驗證 |
| 內容鏈路（事件 → POV → 章回 → 公報 → 訂閱牆，含鏈上章回合本 compiler） | `/feed` 與 dossier |
| 3D 藏閣（佈展、AI 策展、劇照生成、紀念品店） | `packages/chamber-3d` |
| 戲班製作引擎 | `packages/troupe` 離線 harness |

## 🟡 已部署、但尚未驗證

合約已上鏈，但 web 端還要接線、真跑一輪才算數，目前不標 ✅。

| 項目 | 狀態 | 翻 ✅ 還缺什麼 |
|---|---|---|
| `economy.move`：真鏈上 Balance（發薪、接濟、結算、挹注） | 合約已上鏈（`sui move test` 122/122） | codegen 生 SDK 綁定，加上把 off-chain 影子接成真 Balance 的 adapter，並真跑一輪驗證 |
| 藏閣 Kiosk 交易（`still.move` TransferPolicy） | 合約已上鏈 | TS 接線，加上真實的上架、購入、撤架 |
| 鏈上佈局保存（`chamber` PersonalVault） | 合約已上鏈 | 接通 `chamber::decorate` server action 與「鏈上保存」按鈕 |
| 兩段式鑄角（`recruit` RedeemIntent） | 合約已上鏈 | 走真錢包 redeem 一次，確認 sender 檢查 |

> 合約上鏈不等於功能可用。web 端還要 codegen 加 adapter 接線，新能力才會真的被用到。

## 🛣️ 路線圖

以下已設計或部分接線，但今天的 demo 不會跑。

| 項目 | 現況 | 還缺什麼 |
|---|---|---|
| 導演退場、轉成說書人 | 概念與零散條目 | 退場訊號量化，以及分級實作 |
| 角色封存為傳奇 | NFT 與記憶死後本就留存；owner 挹注與 Walrus 續費已設計 | 死後續費保存記憶的接線 |
| Saga 易主 | 全新 | 從設計專檔開始 |
| 付費訂閱分潤 | `RevenueConfig` 欄位就位 | 待 MVP 之後再開 |
| perceive 感知步驟（權威處境層） | 已設計 | 實作 |
| 影視化（Phase 3） | 願景 | 先把內容漏斗收尾 |

---

<sub>詳細機制都在設計文件：[白皮書](#/whitepaper)、[角色經濟](#/character-economy)、[敘事 Agent 架構](#/narrative-agents)。</sub>
