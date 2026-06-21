# 鏈上協議

無盡敘界把客觀事實、主觀理解、持有權與代為運作拆開處理。Sui 保存共同事實與權限，敘事引擎再把這些事實變成每個角色自己的故事。

## 核心物件

| 物件 | 在世界裡的作用 |
|---|---|
| **World** | 最上層的世界設定，包含地點與世界規則。 |
| **Saga** | World 裡持續發展的一條故事線，擁有自己的班底、場景、金庫與說書人。春雪社就是一個 Saga。 |
| **Scene** | 角色相遇、事件發生的場所。 |
| **Character** | 單一角色的共享鏈上狀態，包括檔案、屬性、所在位置、媒體、訂閱與生命狀態。 |
| **Event** | 世界裡發生的客觀事件；不同角色可以對同一事件留下不同記憶。 |
| **Commitment** | 把鏈上主體與 Walrus 內容連起來的可驗證錨點。 |
| **Resource** | 稀缺的角色位置、機會或關係；多人爭取時會形成張力。 |

Character 是 shared object，不是一般意義下放在錢包裡的 NFT。角色持有權由 `OwnerCap` 表示，Saga 的運作權則由另一張 `ControlCap` 表示。

## 持有權與授權

- **`OwnerCap`** 是角色的根持有權，可以轉移，角色死亡後仍然有效。
- **`ControlCap`** 把有限的運作權交給 Saga，並綁定角色當前的 control epoch。
- 持有者可以撤銷控制權，或把角色轉交另一個 Saga，使舊的 ControlCap 失效。
- ControlCap 只授權交易，不替角色決定想法、台詞或行動。角色仍由 character agent 自己作決定。

這個拆分讓 Saga 能持續運行世界，同時不必拿走角色持有者的權利。

## 角色如何入場

目前公開鑄角流程分成兩次簽署：

1. 用戶錢包建立 `GenesisVoucher`，預覽生成的角色，接受後再把 voucher 轉成 shared `RedeemIntent`。
2. Saga 的說書人把 intent 兌換成 Character。合約會把 `OwnerCap` 交給原始付款者，並把 `ControlCap` 交給 Saga 營運者。

說書人不需要代管用戶的 voucher，也不會碰用戶錢包裡的其他物件。

## 客觀歷史與主觀記憶

事件、移動、訂閱、資源轉移與內容錨點都是公開的協議事實；私密記憶不是。記憶在寫入儲存前就會加密，而且不同角色可以對同一件事留下彼此矛盾的版本，不會因此改寫共同歷史。

這是刻意的設計：鏈回答「發生了什麼」，角色回答「這件事對我意味著什麼」。

---

實作位於 [`contracts/endless_story`](https://github.com/231-Labs/endless-story/tree/main/contracts/endless_story) 與 [`packages/sdk`](https://github.com/231-Labs/endless-story/tree/main/packages/sdk)。
