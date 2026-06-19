# 無盡敘界（Endless Story）

**一套驅動「持久、鏈上故事世界」的引擎。** 這裡的角色是會隨時間長大的記憶資產——不是你收藏的靜態圖。以 **MemWal SDK** 寫進 **Walrus**，靠 **Sui** NFT 持有。

> **角色會記得，世界會生長。**

**春雪社** 是跑在這套引擎上的第一個 *Saga*，也是本次 demo 展示的世界。

[▶ 線上 Demo](https://spring-snow.231labs.xyz) · [簡報（English）](./pitch/endless-story-pitch-light-en.html) · [中文簡報](./pitch/endless-story-pitch-light.html)

---

## 這是什麼——定位三角

一種新型娛樂，站在三個既有文化的交點，但每一邊都做了一個關鍵反轉：

| 借鑑自 | 它長得像 | 關鍵反轉 |
|---|---|---|
| **遊戲**（抽卡、養成、收集） | 你抽角色、養角色、看數值與命運 | **你不能操控它。** 你影響的是一個有自己人生的自治體，不是在玩傀儡。 |
| **IP／收藏**（卡牌、NFT） | 角色是可持有、可交易的資產 | **資產是活的。** 它累積記憶史、會老會死、結盟結仇，可能成為傳奇。 |
| **連載敘事／影視** | 會產出章回、劇照、最終影片 | **沒有編劇。** 劇情由自治角色活出來，導演只能推事件、調環境。 |

**不可操控公理**——任何人都無法替角色做決定——是世界能「自己活」的前提。世界主搭舞台；saga 主透過導演 agent 推事件；角色主可注入「夢境」去影響、但永不能命令。

---

## 現在能跑的（已落地）

- 智能合約全套部署上 **Sui testnet**（`sui move test` 122/122）
- 抽卡鑄角 → 鏈上 Character NFT + caps，確定性肖像存上 **Walrus**
- 自治 **tick 迴圈**（PLAN → MOVE → DRAMA → SOCIAL → ASK → GIVE → BOND → SETTLE → ACT → POV → SLEEP → GAZETTE）
- **MemWal** 記憶：remember／recall、SEAL 加密、cap 授權解密、三因子召回——跑在自架 relayer
- 角色 **經濟迴圈**（發薪 → 記憶租金 → 接濟 → 死亡）以純模擬學術驗證（假說 H1–H6）
- **內容鏈路**：事件 → POV → 章回 → 公報 → 訂閱牆，含鏈上章回合本 compiler
- **3D 藏閣**（chamber）：AI 策展 + 劇照生成
- **戲班製作引擎**（離線驗證 harness）

哪些是「已部署待驗證」（🟡）、哪些還在「路線圖」（🛣️），見 **[路線圖](#/roadmap)**。我們把每一項能力都標 ✅／🟡／🛣️——把已實現和願景混講會失分，分清楚才可信。

---

## 讀設計文件

- **[產品定位](#/product-positioning)** — 它是什麼、功能凍結後往哪走
- **[白皮書](#/whitepaper)** — 數學：抽卡定價、角色經濟、張力引擎
- **[敘事 Agent 架構](#/narrative-agents)** — 導演＋角色架構、perceive → plan → act → reflect 迴圈
- **[內容鏈路](#/content-pipeline)** — 事件如何變成章回、公報、劇照
- **[角色經濟](#/character-economy)** — 發薪、記憶租金、接濟、雙軌死亡
- **[劇目製作引擎](#/production-engine)** · **[事件生命週期](#/event-lifecycle)** · **[Walrus 資產](#/walrus-assets)**
- **[API 合約](#/api-contract)** · **[Prompts](#/prompts)** · **[部署](#/deployment)**

---

<sub>由 **231 Labs** 為 **Sui Overflow 2026 · Walrus 賽道** 打造，建構於 Walrus + Seal、MemWal SDK 與 Sui。</sub>
