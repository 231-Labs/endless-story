# 機制白皮書

這份文件只收錄能以公式描述、也能用測試驗證的機制，並把三種狀態分開：已進產品程式碼、已用 simulator 驗證，以及仍須用真實營運資料校準的經濟參數。

## 角色生成

每張 recruitment voucher 都包含一個 32-byte seed。四個先天屬性使用 domain-separated HKDF-SHA256 推導：

$$x_i = \operatorname{u32}(\operatorname{HKDF}(seed, axis_i)) \bmod 101$$

每個 $x_i$ 都落在 $[0,100]$。單一屬性近似均勻分布；四個獨立屬性的總和則會集中在中間區域。

若一則招募在每個必要屬性上都設有最低門檻 $m_i$，單抽達標機率是：

$$p = \prod_i \frac{101-m_i}{101}$$

平均需要的抽數因此是：

$$E[draws] = \frac{1}{p}$$

必應價格以這個平均成本為錨點：

$$bulkPrice = \max\left(basePrice,\operatorname{round}_{10}\left(basePrice \times E[draws] \times margin\right)\right)$$

目前建議的 margin 是 $0.85$，讓必應略低於反覆單抽的平均成本，同時保留單抽給願意承擔隨機性的人。

公式實作於 `packages/web/src/lib/recruit-pricing.ts`。性別與文字設定不進入機率計算，而是由合約需求另外驗證。

## 記憶召回

每段記憶會以三個因子排序：

$$score_j = I_j \times R_j \times S(q,m_j)$$

$I_j$ 是正規化重要性，$S(q,m_j)$ 是記憶與當前查詢的語意相似度，敘事近時性則是：

$$R_j = 0.5^{\frac{today-day_j}{h}}$$

$h$ 是以敘事日計算的半衰期。自架 relayer 能對角色的完整 namespace 評分；client path 也能先擴大語意候選集，再做三因子重排。

創世記憶、計畫與整理後的反思可以略過一般 relevance floor，避免維持角色身分的重要內容只因當前問法不同就消失。

## 稀缺與戲劇張力

Drama core 讓每個 desire 擁有重要性 $w$ 與滿足度 $s$，並以確定性的 fixed-point arithmetic 計算。張力不直接儲存，而是由狀態推導：

$$tension = w\left(1-s\right)$$

滿足度會用不同的上升與下降速率往目標靠近：

$$s_{t+1} = s_t + \alpha\left(target-s_t\right)$$

目前校準讓失去帶來的下降速度快於獲得後的上升速度，因此失去一個被爭奪的機會會很快變痛，持有成功則會逐漸日常化。另一個較小的 habituation 項會把滿足度拉回 baseline，避免永久成功變成完全沒有變化的平線。

還有兩項限制讓競爭保持可讀：

- 挑戰者的張力必須超過持有者與 seize margin；
- 每次行動會消耗有限預算，預算再隨時間回補。

拿掉這兩項限制時，simulator 裡的持有者幾乎每 tick 都會翻轉；保留它們之後，資源易手會跟著可見的張力高峰，以較慢節奏發生。負對照與 ablation 都在 `packages/drama`。

## 角色經濟

每日成本模型是：

$$dailyCost = C_{run}a + C_{mem}m + C_{img}i + C_{recall}r$$

薪餉與成本決定淨流量：

$$netFlow = salary - dailyCost$$

當 $netFlow < 0$，可支撐日數估算為：

$$runway = \left\lfloor\frac{balance}{-netFlow}\right\rfloor$$

連續破產會帶來逐步增加的 vitality 傷害，年齡則在隱藏的 onset 之後形成另一條風險：

$$vitality_{t+1}=\operatorname{clamp}(vitality_t+recovery-econDamage-ageHazard,0,100)$$

純 economy harness 已驗證守恆與六項行為假說。目前產品把這個 transition 用在 off-chain shadow；Move balance rail 已存在，但端到端產品 adapter 還不是畫面所顯示餘額的真實來源。

## 驗證邊界

| 機制 | 目前證據 |
|---|---|
| 角色骰值與必應定價 | 已進 recruitment flow，並有 code-level tests。 |
| 三因子召回 | 已進 MemWal client 與自架 relayer。 |
| 張力動力學 | `packages/drama` 具備確定性 simulator、golden vectors、負對照與 ablation。 |
| 角色經濟 | `packages/economy` 具備確定性 simulator 與假說測試；live UI 仍使用 settlement shadow。 |
| 資源結算 | Move rail 與 web event-spine adapter 已存在；真實結果仍取決於目前 deployment 與 RPC 執行。 |

專案不把「已實作」「已部署」與「已在真實運行中驗證」當成同義詞。產品層的狀態界線整理在[路線圖](#/roadmap)。
