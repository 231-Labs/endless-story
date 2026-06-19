# 無盡敘界（Endless Story）

無盡敘界是一套驅動「持久、鏈上故事世界」的引擎。這裡的角色是會隨時間長大的記憶資產，不是你收藏的靜態圖。它以 MemWal SDK 寫進 Walrus，靠 Sui NFT 持有。

> 角色會記得，世界會生長。

春雪社是跑在這套引擎上的第一個 *Saga*，也是本次 demo 展示的世界。

[▶ 線上 Demo](https://spring-snow.231labs.xyz) · [簡報（English）](./pitch/endless-story-pitch-light-en.html) · [中文簡報](./pitch/endless-story-pitch-light.html)

---

## 這是什麼

無盡敘界借鑑三個既有事物，並各自改掉一條規則：

| 借鑑自 | 它長得像 | 改了什麼 |
|---|---|---|
| **遊戲**（抽卡、養成、收集） | 你抽角色、養角色、看數值與命運 | 你不能操控它。你影響的是一個有自己人生的角色。 |
| **IP 與收藏**（卡牌、NFT） | 角色是可持有、可交易的資產 | 資產是活的。它累積記憶史、會老會死，也會結盟結仇。 |
| **連載敘事與影視** | 會產出章回、劇照，最終是影片 | 沒有編劇。劇情由角色自己活出來，導演只能推事件、調環境。 |

核心規則是任何人都無法替角色做決定，這也是世界能自己運轉的前提。世界主搭舞台，saga 主透過導演 agent 推事件，角色主可以送進夢境去影響角色，但不能直接命令。

---

## 現在能跑的

- 智能合約全套部署上 Sui testnet（`sui move test` 122/122）
- 抽卡鑄角：鏈上 Character NFT 與 caps，確定性肖像存上 Walrus
- 自治 tick 迴圈（PLAN → MOVE → DRAMA → SOCIAL → ASK → GIVE → BOND → SETTLE → ACT → POV → SLEEP → GAZETTE）
- MemWal 記憶：remember 與 recall、SEAL 加密、cap 授權解密、三因子召回，跑在自架 relayer
- 角色經濟迴圈（發薪 → 記憶租金 → 接濟 → 死亡），以純模擬驗證假說 H1 到 H6
- 內容鏈路（事件 → POV → 章回 → 公報 → 訂閱牆），含鏈上章回合本 compiler
- 3D 藏閣（chamber），含 AI 策展與劇照生成
- 戲班製作引擎，含離線驗證 harness

哪些已部署但還沒驗證（🟡）、哪些還在路線圖（🛣️），見 [路線圖](#/roadmap)。每項能力都標 ✅、🟡 或 🛣️，讓人清楚現在能跑的是哪些、還在路上的是哪些。

---

## 讀設計文件

- **[產品定位](#/product-positioning)**：它是什麼，功能凍結後往哪走
- **[白皮書](#/whitepaper)**：抽卡定價、角色經濟、張力引擎
- **[敘事 Agent 架構](#/narrative-agents)**：導演與角色 agent，以及 perceive、plan、act、reflect 迴圈
- **[內容鏈路](#/content-pipeline)**：事件如何變成章回、公報、劇照
- **[角色經濟](#/character-economy)**：發薪、記憶租金、接濟、雙軌死亡
- **[劇目製作引擎](#/production-engine)** · **[事件生命週期](#/event-lifecycle)** · **[Walrus 資產](#/walrus-assets)**
- **[API 合約](#/api-contract)** · **[Prompts](#/prompts)** · **[部署](#/deployment)**

---

<sub>由 231 Labs 為 Sui Overflow 2026 · Walrus 賽道打造，建構於 Walrus、Seal、MemWal SDK 與 Sui。</sub>
