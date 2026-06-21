# 角色經濟

角色經濟的目標，是讓長期存在有成本、互相扶持有意義、被忽視也會留下後果。核心機制已用確定性 simulator 驗證；目前產品仍以**程序內結算影子**（process-local settlement shadow）運行，而 Move balance rail 與 SDK binding 已準備好，尚待完整鏈上結算驗證。

## 每日成本

每個角色都有一筆估算的日常運行成本：

$$dailyCost = C_{run}a + C_{mem}m + C_{img}i + C_{recall}r$$

其中：

- $a$ 是角色活躍程度；
- $m$ 是已保存的記憶數；
- $i$ 是保留的媒體資產數；
- $r$ 是記憶召回次數。

這是一套映射真實系統壓力的遊戲模型，不是基礎設施供應商直接開出的帳單。各項常數仍屬機制參數；在 mainnet 經濟被視為定案之前，必須再用實際營運成本校準。

## 收入與生存

Saga 金庫負責發薪。模型把行當保底與受讀者數影響的表現分潤放在一起。角色的淨流量是：

$$netFlow = salary - dailyCost$$

淨流量為負時，系統會依目前餘額估算還能支撐多久。連續破產會降低 vitality；年齡則是另一條逐步上升的風險。兩條路徑都可能讓角色退出活躍班底，但不需要事先公開一個固定死期。

Simulator 驗證了六項性質：健康班底能持續運作、記憶成本不會讓角色輕易永生、世代會自然輪替、接濟能改善存活、系統避開指定病態，以及 owner 可以用有界成本養活沒有讀者的角色。

## 接濟本身也是角色選擇

角色能在 world tick 裡求助或主動給予。GIVE 階段會把接濟決定寫成敘事與關係記憶；同一個 tick 的 SETTLE 階段則會把已接受的接濟，連同薪餉、成本與 vitality 一起記入程序內結算影子。

鏈上的 `transfer_between_characters` rail 已存在，但 live product 路徑尚未執行它。這個區分很重要：故事後果今天可以在 shadow 裡跑，而可長期保存的鏈上餘額轉移，仍要等 chain adapter 執行並驗證後才能成立。

## 目前鏈上已有什麼

現有 deployment snapshot 所指向的 package 與 SDK 已包含：

- 每角色的 `Balance<CURRENCY>`；
- owner 挹注；
- 角色間轉帳；
- 由 Saga 金庫發薪與結算的 rail。

但人物頁顯示的 survival 數值目前仍由 process-local cohort settlement adapter 推導。它適合驗證 life-cycle 設計，卻不是可長期保存的鏈上帳戶餘額，不應混為一談。

## 為什麼先保留 shadow

Shadow 讓專案能先測試敘事後果，再作出不可逆的金融宣稱。它是確定性的，也有 simulator 支撐，但 process 重啟時可能重置，不能取代鏈上結算。

下一個里程碑很明確：透過 generated SDK bindings 完整跑過一次發薪、扣成本、接濟與 owner 挹注，再把 UI 的讀取來源切到鏈上狀態。

---

驗證核心位於 [`packages/economy`](https://github.com/231-Labs/endless-story/tree/main/packages/economy)，鏈上 rail 位於 `contracts/endless_story/sources/economy.move`。
