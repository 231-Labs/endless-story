# 敘事引擎

無盡敘界不會把「從頭寫完一部小說」整包交給單一模型，而是讓世界以一個個可觀察、可驗證的小步驟往前走。Director 負責安排條件，Character agent 負責決定如何回應。

## 兩種不同的主動性

| Director | Character |
|---|---|
| 觀察整個 Saga | 只看得到該角色當下能感知的處境 |
| 開啟或收掉戲劇機會 | 規劃、移動、說話、求助、給予、拒絕與出牌 |
| 調整節奏與稀缺資源 | 透過私密記憶與關係理解事件 |
| 出版客觀公報 | 寫出主觀的角色視角章回 |

兩者的界線很簡單：Director 可以安排一個難題，但不能替角色決定他在難題裡怎麼想、怎麼做。

## 世界如何走完一個 tick

一般 tick 依序執行：

1. **推進時間**，讓敘事日與時段往前走。
2. **感知處境**，讀取所在場景、同場角色、進行中的事件、最近結果與公開訊號。
3. **更新計畫**，把當下處境與召回的記憶放在一起思考。
4. **移動**，走向與計畫有關的人或地方。
5. **社交**，可能是觀察、交談，也可能刻意沉默。
6. **求助與給予**，讓經濟壓力與關係真的影響角色選擇。
7. **行動**，從事件允許的動作中自行選擇。
8. **結算**，處理薪餉、成本、接濟與目前 economy adapter 裡的生存狀態。
9. **出版**，產出角色 POV 與 Saga 的客觀公報。
10. **反思**，把近期零碎經驗整理成更耐久的記憶。

目前預設 tick 已開啟感知、事件 spine 與 Director 建立新稀缺資源；並行事件、注意力耦合、LLM 框題與 rival-gravity 移動仍是可選控制項。

## 事件必須真的結束

事件 spine 讓一場衝突擁有可以跨 tick 延續的身分：

$$開場 \rightarrow 行動 \rightarrow 餘波 \rightarrow 結算 \rightarrow 出版$$

角色先完成一輪鏈上行動，反應與 POV 素材可以繼續累積。收尾時，引擎可轉移被爭奪的 Resource、關閉事件，並把多個角色的聲音織成一回章節。

即使資源轉移失敗，事件仍能以不轉移資源的方式關閉。這層 failure isolation 避免單一錯誤提案或 RPC 問題把整個世界卡死。

## Showrunner 心跳

Showrunner 是較慢的 Director 心跳。它會讀班底、近期公報、當前張力與精簡的弧線計畫，再決定是否補角色缺漏、開啟或收掉一條張力線、送出一個公開節拍，或安排一場完整排戲。

它有明確的工具與模型呼叫預算。當故事需要留白時，什麼都不做也是合法選擇。

## 事件如何變成作品

- **角色 POV**屬於單一角色，是主觀版本。
- **事件章回**把同一事件裡多個角色的 POV 織在一起。
- **公報**由 Director 側整理 Saga 的公開歷史。
- **劇照與戲折**重用角色檔案、關係與記憶，讓後續媒體延續同一個世界。

出版內容會在鏈上留下錨點，正文與媒體存入 Walrus。讀者看到的 feed 以 commitment 與 blob 重建內容，不再把 mock data 當成主要來源。

---

實作位於 [`packages/web`](https://github.com/231-Labs/endless-story/tree/main/packages/web) 的 tick loop、[`packages/runner`](https://github.com/231-Labs/endless-story/tree/main/packages/runner) 的角色服務，以及 [`packages/troupe`](https://github.com/231-Labs/endless-story/tree/main/packages/troupe) 的劇目管線。
