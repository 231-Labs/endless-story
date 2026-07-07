# 記憶與儲存

角色要長久存在，需要兩種延續：一份任何人都能驗證的公開紀錄，以及一套會影響未來決策的私密記憶。無盡敘界讓 Sui、Walrus、Seal 與 MemWal 分別負責不同部分。

## 各層保存什麼

| 層 | 保存內容 |
|---|---|
| **Sui** | 物件狀態、權限、事件、訂閱與內容錨點。 |
| **Walrus** | 加密記憶，以及肖像、章回、公報、預告等大型素材。 |
| **Seal** | 決定哪一種 capability 持有者能解開角色記憶的加密政策。 |
| **MemWal** | 記憶寫入、搜尋、召回，以及排序所需的 metadata。 |

公開章回與公報不必解開角色的私密記憶就能閱讀。記憶系統與出版系統使用同一種儲存基礎，但存取規則不同。

## 逐角色加密

私密記憶在送到 Walrus 之前就已加密。Seal identity 會包含 character id，因此一個角色的 capability 無法解開另一個角色的記憶空間。

目前有兩條存取路徑：

- `OwnerCap` 持有者可以檢視該角色的完整記憶；
- Saga 透過 `ControlCap` 讀寫，control epoch 被撤銷後便無法繼續存取。

Relayer 保存密文、向量與不含秘密的排序 metadata；搜尋時不需要看到記憶原文。

## 記憶召回

召回時會綜合三個訊號：

<div class="formula">score = importance × recency × relevance</div>

- **重要性**在記憶寫入時決定；
- **近時性**依敘事時間衰減，不使用現實牆鐘；
- **相關性**衡量當前處境與記憶內容的語意距離。

計畫、創世記憶與整理後的反思可以固定保留，不會因相關性門檻而消失。舊觀察不會被硬刪除；角色睡眠時會把零碎經驗整理成密度更高的反思，讓真正重要的內容更容易再次被想起。

## 儲存不是無限期免費

Walrus 以 epoch 計租。只有在租期有效時 blob 才能持續讀取，而延長租期需要控制對應的 Sui Blob object。

因此，專案把長期公開資產與高頻角色記憶分開管理：

- asset service 追蹤公開素材、到期時間、續租與 publisher wallet；
- MemWal 管理記憶的高頻寫入，避免人工續租工具與記憶生命週期彼此衝突。

角色經濟之所以計入記憶成本，也是因為長期保存確實會持續消耗儲存資源。

---

實作位於 [`packages/memwal`](https://github.com/231-Labs/endless-story/tree/main/packages/memwal)、[`packages/relayer`](https://github.com/231-Labs/endless-story/tree/main/packages/relayer)，以及 Web App 的 owner-side 解密流程。
