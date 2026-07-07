# 路線圖

這個 repository 同時包含已部署合約、live product path、feature-gated 實驗與離線研究 harness。這一頁會把它們分開，不再混成一張全部打勾的清單。

Repo 內的 deployment snapshot 指向 Sui testnet，最後寫入時間是 2026 年 6 月 16 日。這次檢查沒有直接查詢 live network，因此下文的「已部署」指 repo snapshot 有記錄，不代表本輪已重新用 RPC 確認。

## 目前產品路徑已接通

| 能力 | Repository 內的證據 |
|---|---|
| 角色招募 | Voucher 預覽、shared `RedeemIntent`、說書人兌換、交給原付款者的 `OwnerCap`，以及 Saga 持有的 `ControlCap`。 |
| 預設自治 tick | Web tick loop 已串起感知、計畫、移動、張力、社交、求助、給予、結算、行動、POV、反思與公報。 |
| 事件 spine | 一般 real tick 預設會開啟、延續、結算並出版單一 spine event；失敗時可退回不轉移資源的 plain resolution。 |
| Director 建立稀缺資源 | 除非明確關閉，預設路徑會允許 Director 建立新的戲劇標的。 |
| Showrunner 心跳 | 已有世界巡檢、有界修補、持久弧線計畫、Director tool registry、後台介面與 headless API。 |
| 私密角色記憶 | Seal 加密、逐角色 capability 檢查、owner-side 解密、三因子召回與自架 relayer 實作。 |
| Chain-first 出版讀取 | Feed 與人物頁會從鏈上 commitment 與 Walrus blob 重建章回。 |
| 公開素材營運 | Asset service、後台上傳、狀態檢查、手動續租與 publisher wallet 檢查。 |
| 戲班排戲 | Production pipeline 可由 Director tool 呼叫，也有獨立的離線 harness 驗證創作步驟。 |

這些項目表示程式路徑存在，不保證此刻每一個外部服務都在線。

## 已實作但仍有條件

| 能力 | 已經有什麼 | 為什麼還不能無條件宣稱完成 |
|---|---|---|
| 鏈上角色經濟 | Move module 與 generated SDK bindings 已包含 balance、owner 挹注、角色轉帳與結算。 | 產品 UI 仍讀程序內結算影子；GIVE 的接濟會在同 tick 的 SETTLE 寫入 shadow，但鏈上 `transfer_between_characters` 尚未執行。 |
| Kiosk 劇照交易 | 已有 mint、上架、購入、撤架、領款 helper，以及 buyer 與 admin UI path。 | 需要 active package、TransferPolicy、StillRegistry、Kiosk ids、錢包資金，並完成一次 live transaction 驗證。 |
| 個人藏閣 | PersonalVault 建立與查找已接通。 | 佈置仍存在 local state，UI 尚未接上 `decorate` 鏈上寫入。 |
| Walrus 自動續租 | Asset 已有 `autoRenew` metadata，也能透過 asset service 延長租期。 | 目前沒有 scheduler 消費這個 flag，續租仍靠人工操作。 |
| 並行事件模擬 | Parallel events、attention coupling 與 rival gravity 已有控制項與純測試。 | 它們不是預設 tick 路徑，仍需長時間 live-world 驗證。 |
| LLM 事件框題 | 有 sanitize 與 deterministic fallback。 | 仍為 opt-in，因為它改變的是語言品質、成本與延遲，不是協議正確性。 |

## 接下來的里程碑

1. 完整執行並驗證一次發薪、扣成本、owner 挹注與接濟，再把產品讀取來源切到鏈上 economy balance。
2. 完成 PersonalVault 佈局寫入，並用 connected wallet 驗證 Kiosk 全流程。
3. 為標記 `autoRenew` 的素材加入真正的續租 scheduler。
4. 長時間實跑 parallel events、attention coupling、rival gravity 與節奏控制。
5. 把最好的章回與戲折整理成可重複執行的影片管線。
6. 設計 Saga 易主與長期封存，同時清楚區分角色持有權與 Walrus Blob object 的 ownership。

## 狀態用語

公開文件統一使用以下定義：

- **已實作**：這個 repository 裡存在對應程式路徑。
- **已部署**：repo 內的 deployment snapshot 記錄了 live object。
- **已驗證**：相關測試或留下紀錄的 run 確實走過該行為。
- **預設開啟**：一般產品路徑不需要 opt-in flag 就會使用。

四個詞彼此不能互相推導。
