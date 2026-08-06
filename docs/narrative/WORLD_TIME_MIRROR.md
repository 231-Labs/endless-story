# 鏡像時間 — 春雪社的改曆

> 春雪社世界的時間，自此與現實**同刻而行，早整整一百年**。
> 現實的 2026 年 8 月 5 日下午,就是民國十五年八月五日的晡時。
> 世界不再靠 tick 計時；tick 降級為「演繹的心跳」。

## 一、法則（The Law）

**敘事時刻 = 真實時刻在世界民用時區（UTC+8，中原標準時，無夏令時）下的牆鐘時間，年份減一百。**

- 減的是**曆法年**，不是固定毫秒差。同月同日同時刻——現實立秋，戲班也立秋；
  現實過年，法租界也過年。固定毫秒差每百年會對曆法漂移約 25 天，季節錯位，故不取。
- 星期由**故事日期本身**推得（1926-08-05 是星期四，就說星期四）——戲班活在自己的
  曆裡，不看現實的星期。
- 閏日邊界：真實 2 月 29 日而故事年非閏年時，日期鉗到 2 月 28 日。在 offset=100
  之下，下一次真正觸發要到西元 2400 年（1900/2000 世紀例外已過），純屬防禦分支。
- 紀年顯示以**民國紀年**為主（民國 Y = 西元 − 1911）、西曆為輔：
  「民國十五年八月五日 · 晡時」（1926-08-05）。新曆月日，符合民國官方用曆。

`year_offset` 是 preset 層的世界觀常數（春雪社 = 100），不是寫死的全域數字。
時區同理（`tz_offset_minutes` = 480）。

## 二、時間權威反轉

舊制：`current_tick` 是時間本身——day 與時辰由 tick 數推導，世界一停機，時間就凍結。

新制（mirror 模式）：**牆鐘是時間之源**；tick 是**演繹的心跳（heartbeat）**——
世界的角色獲准行動的那一刻，而非時間的流逝本身。

由此得出本設計最重要的語義：

> **故事時間永不暫停。** runner 停機一週，世界就靜靜活過了無事的一週——
> 時間照走，只是無人搬演。復機後不補打 42 拍假 tick，直接在「今天」接續。
> 過了 `dueDay` 的心事自然作廢（foreclosed）——世界往前走了，這是對的。

這才是「persistent on-chain world」該有的意思：世界的時間不因伺服器停擺而暫停。

時間連續了，行動仍是打拍制——角色只在心跳被搬演。讓角色在拍與拍之間
「持續在場」（事件驅動的折子演繹）是下一層樓，見
[`AGENT_WAKE_LAYER.md`](./AGENT_WAKE_LAYER.md)（設計稿）。

## 三、六時辰 → 真實時刻表

六時段名字不變，變成 UTC+8 的固定民用時段（各 4 小時，一日仍 6 拍——
引擎的 `ticksPerDay === 6` 節律完整保留）：

| 時辰 | 真實時刻（UTC+8） | bucket index |
|------|-------------------|--------------|
| 清晨 | 05:00 – 09:00 | 0 |
| 日午 | 09:00 – 13:00 | 1 |
| 晡時 | 13:00 – 17:00 | 2 |
| 黃昏 | 17:00 – 21:00 | 3 |
| 入夜 | 21:00 – 01:00 | 4 |
| 深宵 | 01:00 – 05:00 | 5 |

**敘事日界 = 清晨 05:00**。入夜與深宵跨民用午夜仍屬前一敘事日——
凌晨兩點的戲文，記在「昨夜」的深宵。故事日的**日期標籤**取該日清晨時刻的民用日期
（實作上：民用時刻減 5 小時後取日期）。夜段（入夜／深宵）仍是睡眠／REFLECT 窗。

`isNight`、`isDayEnd`、`SHOW_ONSTAGE_PARTS = [3,4]`（黃昏開鑼、入夜散戲）等
既有 bucket 語義全部原封不動——**保留六拍，只換權威**。

## 四、tick 的新身分

- 鏈上 `WorldState.current_tick` 不動：單調心跳計數器，事件與記憶的 provenance 錨。
- `WorldTimeConfig` 不改欄位。mirror 世界 seed 為 `(days_per_tick_bp: 1670,
  tick_interval_ms: 14_400_000)`——「一日六拍、每拍四小時」在 mirror 之下
  **字面為真**（舊制的 120000ms 從未被排程器讀過）。
- 排程：一日六拍，打在時辰邊界（UTC+8 的 05/09/13/17/21/01 時）。冷啟動時
  當前時辰若未演繹，補打**至多一拍**——絕不補歷史積壓。同一時辰偶然多打一拍無害
  （只是那個下午比較忙）。
- 日界邊緣偵測（day-start / day-end 的觸發）：從**上一拍**的 `TickAdvanced.advanced_at_ms`
  （queryEvents 倒序取一筆，或 indexer 同形讀）推得上一拍的故事日位置，與此刻比較得
  `crossings = { dayStart, dayEnd, skippedBuckets }`。查不到事件時退化為
  「bucket 0 的心跳做 day-start」（正常排程下等價）。停機跨日後的第一拍，
  `skippedBuckets` 順便成為世情事實（「班子歇了兩日」可入 percept，選配）。

## 五、鏈上策略：改曆不改約

**本次不動 Move 合約。** 理由：

1. 鏈上早已記錄完整真實時間戳——`WorldState.created_at_ms`、每筆
   `TickAdvanced.advanced_at_ms`。**mirror 模式下這些真實毫秒「就是」故事時刻**
   （減一百年是透鏡，不是狀態）。改曆是一次無損的「正史重編年」：歷史每一拍都能
   回溯定出民國日期。
2. `year_offset` / `tz` 是世界觀常數，與「民國上海」的 prose 同層，由 preset 攜帶。
3. 動 struct = 重生 SDK bindings + 全網重部署，血本換兩個常數，不值。

未來若要把映射法則上鏈（世界自述其曆），加欄位於 `WorldTimeConfig` 即可，
歷史資料因 (1) 而完全可遷移。

## 六、分層落點

```
packages/shared/src/lib/world-clock.ts     ← 法則唯一居所（純函數、零依賴）
        ↑                ↑                ↑
   engine adapter    runner reader     web actions + UI
   (MirrorClock,     (world-time.ts    (world-time.ts snapshot、
    選配；Local       改為薄轉發)        tick-loop dayLabel、
    Clock 不動)                          TimePanel、讀者站)
```

- **shared `world-clock.ts`**：`WorldTimeMode = 'tick' | 'mirror'`；
  `storyNow(realMs, cfg) → StoryMoment`（西元/民國年、月、日、時分、bucket、
  partOfDay、isNight、storyDayIndex、標籤格式化）；`nextBoundaryMs`（排程用）；
  `PARTS_OF_DAY` 唯一定義；tick 模式的 bp→day 推導也收攏於此
  （順帶終結三份 `PARTS_OF_DAY` 複製與四份 bp 數學，並修掉引擎
  `floor(tick/6)+1` 對鏈上 `floor(tick·1670/10000)+1` 的日序漂移）。
- **engine**：`ports.ts` 的 `WorldClock`/`PARTS_OF_DAY` 改自 shared 取用（公開 API 不變）。
  `LocalClock`（tick 模式）原樣保留——lab 與 CLI season 的確定性不受影響。
  新增選配 `MirrorClock` adapter：以真實毫秒取樣 `storyNow`，`advance` = 重取樣。
- **web**：`getWorldTimeSnapshot` 依 world 的 time mode 分歧——mirror 之下
  day/partOfDay/tickOfDay 全部由牆鐘推導（`tickOfDay := bucket index`），
  快照形狀不變，tick-loop 的 day-start / day-end / 疲勞曲線 / gazette 閘門
  **一行不用改語義**。`dayLabel` 由「第 N 日 · 時辰」改為
  「民國十五年八月五日 · 晡時」。
- **讀者站的第二套詞彙**（`DayPart: morning|noon|dusk|night` 與「卯時初刻」式
  標籤，`world-read.ts`）：mirror 之下由牆鐘投影——六時辰照舊收攏成四分
  （清晨→morning、日午/晡時→noon、黃昏→dusk、入夜/深宵→night），而
  時辰刻標籤**升級成真的**：真實民用時刻直推十二地支（卯時 05–07…）加
  初刻/一刻/二刻/三刻（半時辰一刻），不再從 tick 比例擬造。`world-read.ts`
  原 docblock 反對 wall-clock 的理由（「假裝時間前進是說謊」）在鏡像下自動
  瓦解——tick 不再定義時間，世界真的活在真實時間裡；docblock 隨之改寫。
- **`day` 整數索引保留為資料鍵**：分組（`GroupedCutList`）、排序、blob header、
  事件 id `d{day}:t{tick}` 全部繼續用整數 `storyDayIndex`；
  「民國十五年八月五日」是 dayIndex 的**顯示層投影**
  （`storyDateOfDayIndex(dayIndex, epochMs)`），新舊資料不斷鏈。
- **排程（`packages/cli/scripts/world-loop.ts`）**：mirror 之下改為
  睡到下一個時辰邊界再打拍（`nextBoundaryMs`），legacy `--interval` 保留。
- **lab / cinema-lab**：off-chain 實驗台，維持 tick 模式（確定性重於擬真）。

## 七、日序與「Day N」的去留

mirror 之下 `storyDayIndex` = 自世界創世（`created_at_ms` 的故事日期）起算的
故事日序（1-indexed）——「第 N 日」仍可推導、仍來自鏈，但讀者向顯示一律改用
**日期**。改曆瞬間日序會重編（testnet 世界，可接受）；正史因 advanced_at_ms
完全可回溯定日，不失一拍。

## 八、已知張力（明示不迴避）

- 世界聖經錨在「民國十七年（1928）前後」；offset=100 使今日落在民國**十五**年，
  在「前後」容差內，且世界將於現實 2028 年自然走到民國十七年。若主人堅持
  今日即民國十七年，`year_offset: 98` 是 preset 一行之改。
- 舊曆（農曆）節慶是戲班世界的靈魂，但需農曆對照表，另案處理
  （見 `WANTS_WITHOUT_MECHANISM.md` 的曆法暫緩條目）。
- 雙重紀年並存：檔案表面（公報 `committedAtMs`、章回 `createdAt` 等）顯示
  真實時戳，與敘事日期恰差一百年。這是特性不是缺陷——鏈上時戳是 provenance，
  敘事日期是小說；顯示準則為「活時鐘用日期、檔案卷宗用日序／真實時戳」。
  若某表面兩者並列造成混淆，補「西曆／民國」標註即可。
