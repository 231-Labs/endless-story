# 無盡敘界

無盡敘界是一套持續運行故事世界的引擎。角色會記得、會建立關係，也會自己決定如何回應眼前的事。

Sui 保存共同歷史與權限，Walrus 存放記憶與出版素材，Seal 保護每個角色的私密記憶；世界迴圈把這些部分接在一起，讓故事持續往前走。

**春雪社**是這套引擎上的第一個 Saga，也是目前 Live Demo 展示的世界。

[▶ 線上 Demo](https://spring-snow.231labs.xyz) · [English Pitch](./pitch/endless-story-pitch-light-en.html) · [中文簡報](./pitch/endless-story-pitch-light.html)

---

## 這是一個世界，不是一個聊天機器人

無盡敘界從三種熟悉的形式出發，各自改掉一條規則：

| 熟悉的形式 | 保留什麼 | 改變什麼 |
|---|---|---|
| **角色遊戲** | 你仍能發現、追隨與支持角色。 | 角色不是玩家化身。你可以影響他，但如何回應由角色自己決定。 |
| **數位持有** | 角色有可轉移的持有者。 | 持有權與代為運作分開：owner 保管 `OwnerCap`，Saga 只取得可撤銷的運作權。 |
| **連載敘事** | 世界會產出章回、公報、劇照與戲折。 | 沒有單一作者決定每一拍；共同事件由多個 character agent 親自經歷，再各自說出來。 |

Director 可以製造壓力、開啟事件或改變環境，但不能指定角色的台詞、行動與私密理解。這條界線是整套系統的核心。

## 目前系統已經做到什麼

- 兩次簽署的招募流程，能把用戶 voucher 轉成 shared Character，同時把持有權交回原始付款者。
- 預設 world tick 會感知處境、更新計畫、移動角色、處理社交與經濟選擇、結算事件、出版 POV，並整理記憶。
- 角色記憶由 Seal 加密、存入 Walrus，再依重要性、敘事近時性與語意相關性召回。
- Showrunner 心跳能巡檢世界、修補角色缺漏、調整故事壓力或安排排戲，但不會接管角色決策。
- 讀者看到的章回會從鏈上 commitment 與 Walrus blob 重建。
- 資產工具已能上傳、檢查並手動續租公開 Walrus 素材。

有些 rail 已存在於合約或 SDK，卻還不是 live product 的真實讀取來源。角色餘額目前仍使用 off-chain settlement shadow；Kiosk 交易依賴 deployment 設定；藏閣佈局也尚未完成鏈上保存。[路線圖](#/roadmap)會把這些界線清楚列出。

## 公開設計文件

- **[架構](#/architecture)**：用三層說明整套系統。
- **[鏈上協議](#/protocol)**：物件、持有權、授權與招募流程。
- **[記憶與儲存](#/memory)**：Walrus、Seal、MemWal、召回與續租。
- **[敘事引擎](#/narrative)**：一個 tick 如何從感知走到出版。
- **[角色經濟](#/economy)**：區分已驗證模型與目前 settlement shadow。
- **[機制白皮書](#/whitepaper)**：整理公式與對應證據。

---

<sub>由 231 Labs 為 Sui Overflow 2026 · Walrus 賽道打造。</sub>
