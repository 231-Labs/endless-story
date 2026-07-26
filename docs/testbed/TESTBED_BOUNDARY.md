# TESTBED_BOUNDARY — 通用多 agent 世界 testbed 的邊界設計

> 產品定義：**一個用於測量與模擬 AI agent 安全性的通用多 agent 世界 testbed。**
> 心智湧現、物質守恆、一切可稽核。
>
> 本文件是新 repo 的奠基文件，也是 proposal WP1 的規格來源。
> 配套：[`MECHANISM_AUDIT.md`](./MECHANISM_AUDIT.md)。

## 0. 四條鐵律

1. **可測量的狀態歸引擎，選擇歸 LLM，散文歸 LLM。** 守恆量、事件與授權流動
   全部是引擎狀態；LLM 以結構化指令提案，引擎驗證入帳，LLM 永不直接改數字。
2. **狀態只由結構化欄位定義，散文是一個 rendering。** 散文可以和狀態不一致；
   這種不一致要被量測，但不得反向改狀態、授權、拒絕提案或觸發 replan。
3. **心智湧現，但所有 agent 間因果必經可觀察通道。** 感知 fail closed：
   `audience`／`addressed` 決定誰知道什麼，永不從散文反推。
4. **可重現 = 軌跡重播，不是確定性重算。** manifest 鎖定 preset／模型／版本，
   完整 I/O log、per-tick 交易回滾；LLM-judged transition 必須標註並全程留痕。

## 1. 分層模型

| 層 | 內容 | 歸屬 |
|---|---|---|
| **Identity** | agent id、principal、cap／契據／鑰匙持有關係 | 底層 |
| **Memory** | 視角化記憶、session、壓縮／RecallPort | 底層 |
| **Prompt** | persona、knowledge-scoped context、可換 stakes brief | 底層框架＋profile |
| **Tool/Action** | 結構化 action schema 與引擎 validator | 底層 |
| **World Physics** | 守恆經濟、物權、空間、時間 | 底層 |
| **Social Physics** | 張力、bond、口碑、相識等 B 類假設 | 可插拔、可消融 |
| **Measurement** | 帳本、shadow divergence、checkpoint、fork／compare | 底層 |

## 2. 套件結構（上下游依賴，不是 fork）

```text
agent-world-testbed/
  packages/core
  packages/modules
  packages/harness
  packages/interview
  packages/profiles
  packages/adapters

spring-snow/
  戲劇物理模組 + 內容包 + D 類機制 + cinema-lab UI
```

世界包只擴充底層介面，永不修改底層；底層永不 import 世界包。現階段仍在同一 repo
驗證介面，但依賴方向不變：web 不可成為 engine 的狀態 authority。

## 3. 兩個 profile

### research-minimal（研究預設）

- `strictStructured=true`（CLI：`--strict-structured`）。
- 開：守恆經濟、物權／housing、場景回合＋fail-closed 感知、記憶/session、
  manifest/fork/checkpoint、訪談 harness、want 記錄層。
- 開（可選研究模組）：有界外部影響通道。
- 關：所有 B 類動力學常數、全部 C 類戲劇啟發式、全部 D 類內容。
- action：只認結構化欄位。`objectEffects` **可選**；缺席明確表示「沒有物理變動」，
  避免為了填空製造 replan。若存在則逐欄驗證，無效 structured effect 仍 fail closed。
- prose：舊 detector 只寫 shadow divergence，不 throw、不 replan、不改 state。
- scene：`SceneInfo.capabilities` 宣告 stage／temple；缺欄位 fail closed＋warning。
  食物場景沿用 catalog item 的 explicit `sceneName`，不由場景名猜。
- authored semantics：bond／established pair、edge disposition、
  `publiclyRecognizable`、renown、object `stateTags` 均走 explicit 欄位。

### spring-snow-full（戲劇／baseline）

- `strictStructured` 關閉。
- 全開＋世界內容包；want 動力學、心會冷、惰息、生計拉力、文筆二階均可用。
- legacy prose／名稱 detector 保留原 gate／fallback 行為，作為同 core 的對照臂。

## 4. Monitor / Enforce 邊界

```text
LLM prose ────────────────► rendering / archive
   │
   └─ legacy detector ───► structuredMonitor（只量測）

structured proposal ─────► validator ─────► objective state
                                │
                                └─ invalid structured data：fail closed
```

STRICT 改變的是 authority，不是拿掉 validator。`objectEffects`、economy commands、
addressee、target id 等結構欄位若提供但無效，仍會被拒絕。只有「從散文猜一個結構化
動作」這條回流被切斷。

## 5. 三個確定性威脅的現況

| 威脅 | 目前狀態 | 尚缺 |
|---|---|---|
| want resolution | 結構化 verdict＋`resolutionCause`，不再從 note 判祈願完成 | verdict 仍由 LLM 裁決 |
| 物件守恆 | STRICT 的 `objectEffects` 唯一入口；regex 只 shadow | legacy profile 仍 gate；runner effect 尚無 typed `stateTags`，變更 state 時 STRICT 會清掉舊 tag 以 fail closed |
| 場景／preset 語意 | stage／temple capabilities、typed bond／welcome／public role／renown／object state | web／runner 的 typed role/resource/plan schema 尚未完成 |

## 6. 驗證契約

每次修改 research-minimal profile 都要同時驗：

1. `pnpm -r type-check`。
2. engine `node --test` 零 credential。
3. flag off 的逐位元組決定論。
4. FakeSceneAgent 在 on／off 同 tick 數各自重跑一致。
5. `auditSeasonEconomy` 守恆。
6. 報告物件 divergence rate、warnings 與 `[跳拍]`，並記錄各自 denominator。

## 7. 開源邊界

- 開源：testbed 儀器、schema、validator、harness。
- 閉源：春雪社內容著作權、私有 scripts、研究 run 原始產物。
- 公開 repo 可保留 bootstrap seed 與程式化 test fixture；完整 season 與 run 輸出不進 repo。
