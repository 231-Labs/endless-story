# 路線圖

一條貫穿 pitch／demo／白皮書的鐵律：**每一項能力都標明 ✅ 已實現、🟡 已部署待驗證、或 🛣️ 路線圖。** 評審與玩家最在意「哪些今天真的會跑、哪些是願景」。混講＝失分，分清楚＝可信。

## ✅ 已實現——可現場 demo

鏈上 + runner + web 皆已落地，非 placeholder。

| 能力 | 證據 |
|---|---|
| 合約全套（currency／world／saga／scene／character／recruit／event／commitment） | `sui move test` 122/122，已部署 testnet |
| 抽卡鑄角全流程（voucher → preview → 肖像 → redeem → 鏈上 Character + caps） | 首頁 wizard；HKDF 確定性骰；肖像存 Walrus |
| admin 經營後台（導演 agent 對話、資產管理、測試工具、招募職缺） | `(admin)` route group |
| 自治 tick 迴圈（PLAN→MOVE→DRAMA→SOCIAL→ASK→GIVE→BOND→SETTLE→ACT→POV→SLEEP→GAZETTE） | runner v1，world-loop 跑通 |
| 不可操控：角色自決，導演只推事件／調環境 | 事件客觀／敘事主觀分離 |
| MemWal 記憶（remember／recall、SEAL 加密、cap 授權解密、三因子召回） | `packages/memwal`，自架 relayer |
| 角色經濟迴圈（發薪 → 記憶租金 → 接濟 → 老死／餓死；off-chain 影子） | GIVE／ASK／SETTLE 進 tick 迴圈；H1–H6 驗證 |
| 內容鏈路（事件 → POV → 章回 → 公報 → 訂閱牆；鏈上章回合本 compiler） | `/feed` + dossier |
| 3D 藏閣（佈展、AI 策展、劇照生成、紀念品店） | `packages/chamber-3d` |
| 戲班製作引擎 | `packages/troupe` 離線 harness |

## 🟡 已部署、但尚未端到端驗證

合約已上鏈，但 web 端仍需接線＋真跑一輪才算數。**我們不會把這些當 ✅ 講。**

| 項目 | 狀態 | 翻 ✅ 的條件 |
|---|---|---|
| `economy.move`——真鏈上 Balance（發薪／接濟／結算／挹注） | 合約已上鏈（`sui move test` 122/122） | codegen SDK 綁定 + adapter 把 off-chain 影子接成真 Balance，並真跑一輪驗證 |
| 藏閣 Kiosk 交易（`still.move` TransferPolicy） | 合約已上鏈 | TS 接線 + 真實上架／購入／撤架跑通 |
| 鏈上佈局保存（`chamber` PersonalVault） | 合約已上鏈 | `chamber::decorate` server action +「鏈上保存」按鈕接通 |
| 兩段式鑄角（`recruit` RedeemIntent） | 合約已上鏈 | 走真錢包 redeem 一次、確認 sender 檢查 |

> **redeploy ≠ 可用。** 合約上鏈後，web 端仍需 codegen + adapter 接線，新能力才會真的被用到。

## 🛣️ 路線圖

已設計或部分接線，但今天的 demo 不會跑。

| 項目 | 現況 | 缺什麼 |
|---|---|---|
| 導演退場 → 說書人 | 概念＋零散條目 | 退場訊號量化、分級實作 |
| 角色封存＝傳奇 | NFT＋記憶死後本就留存；owner 挹注／Walrus 續費已設計 | 「死後續費保存記憶」接線 |
| Saga 易主 | 全新 | 從設計專檔開始 |
| 付費訂閱分潤 | `RevenueConfig` 欄位就位 | gate-after，待認可另起 |
| perceive 感知步驟（權威處境層） | 已設計 | 待實作 |
| 影視化（Phase 3） | 願景 | 內容漏斗收尾後 |

---

<sub>機制真相全在設計文件——見 **[白皮書](#/whitepaper)**、**[角色經濟](#/character-economy)**、**[敘事 Agent 架構](#/narrative-agents)**。</sub>
