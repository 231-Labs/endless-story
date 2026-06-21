# Endless Story · 內容鏈路（事件 → POV → 章回 → 公報 → 劇照 → 影片）

> **狀態**：canonical · 2026-06-10 起 · 內容產製層的**唯一方向文件**。
> 與敘事 agent 權責有關的看 [`NARRATIVE_AGENTS.md`](./NARRATIVE_AGENTS.md)；本檔只管
> 「一個事件如何被產製成可商業化的文字／圖片／影片」這條鏈路。
> 衝突時：agent 權責以 NARRATIVE_AGENTS 為準，產製形態以本檔為準。

---

## 0. 一句話

**事件是脊椎，其餘都是它的投影。** 一個鏈上事件 → N 個角色主觀 POV（原料）
→ 一篇多視角織成的「回」（商品）→ 公報（免費漏斗）→ 劇照（圖片橋／病毒單元）
→ 影片（劇照當 keyframe 動起來）。每一層都蓋同一個 `eventTx` 章、每一層都
condition on 上一層的 anchor —— 所以「真的發生過」「同一個人長一樣」「圖文影對得上」
三種一致性同時成立。

---

## 1. 三條軸 + 一根脊椎

所有內容 surface 落在三條軸上：

| 軸 | 一端 | 另一端 |
|---|---|---|
| **視角** | 客觀（導演／世界） | 主觀（角色） |
| **存取** | 公開（漏斗） | 私密（付費深度） |
| **粒度** | 瞬間 beat ↔ 事件 event ↔ 日 day ↔ 弧 arc | |

**脊椎 = 事件（Event）**。事件是鏈上客觀骨架（`event.move` BudgetEvent /
`director::StoryletOpened`，帶 `eventTx` 當證明）。其他所有產物都是它的投影：

```
                  公報 Gazette          客觀·公開·每日·導演聲口   ← 漏斗頂 / 發現層
                 /    |     \
            事件 Event Event Event        客觀骨架·鏈上·「真的發生過」的證明
           /   |   \
       POV   POV   POV                    主觀·gated·每角色一份（同事件 N 角度）= 原料 / 角色 PV 素材
        \    |    /
      事件合本「回」                        多視角織成的章回 ← 商業化主商品（gated）= 正式「章回」
        + 劇照 Still（瞬間定格）            ← 圖片橋 / 病毒漏斗 / 影片 keyframe
        + 視頻 Clip                        ← 最貴·最緊 gate
```

精確關係表：

| Surface | 視角 | 存取 | 粒度 | 聲口 | 錨 subject | 現況 |
|---|---|---|---|---|---|---|
| **公報 Gazette** | 客觀 | 公開 | 日 | 導演 | `saga_id` | ✅ `gazette-compiler` |
| **事件 Event** | 客觀 | 公開錨／詳情 gated | 事件 | 鏈 | event object | ✅ `event.move` |
| **POV（原料／＝角色回）** | 主觀 | owner+訂閱（**訂閱牆**：非訂閱者只見首段 teaser） | 事件×角色 | 角色 | `character_id` | ✅ `character-worker` |
| **事件合本「回」**（＝梨園回） | 多主觀織入 | **公開**（展示漏斗，2026-06-15 拍板） | 事件 | 敘述者／編 | **`event_id`** | ✅ `event-chapter-compiler` |
| **反思 Reflection** | 主觀 | owner | 弧 | 角色 | `character_id` | ✅ |
| **劇照 Still** | 客觀定格 | 低清公開／全清 gated | 瞬間 beat | 圖 | **`event_id`+beat** | ❌ 新建 `still-compiler`（slot 已在 `SceneGallery.moments`） |
| **視頻 Clip** | 混合 | 分級 | 事件／日 | 影 | `event_id`/`saga_id` | 🟡 `video-compiler` stub |
| **角色 PV**（未來） | 主觀剪輯 | 公開預告 | 角色×弧 | 角色 | `character_id` | ⏳ defer（看時間） |

**這張表就是脊椎。** 下面逐項展開。

---

## 2. 章回 = 事件合本（拍板）

> **決策（2026-06-10）：正式「章回」= 事件合本，不是單角色 POV。**
>
> **下一代設計 — 見 [`internal/docs/STORYTELLER_CHAPTER.md`](../internal/docs/STORYTELLER_CHAPTER.md)。** 本層的「每 resolve 一次性
> 重織」要被改成說書人 agent 化的累積 + 進展閘 + 多輪寫作。**已落地進 production（2026-06-19）的部分**：
> 每次織合本時讀 per-saga **故事總綱**（承先）→ 織 → cheap-LLM **折回**更新總綱（啟後），讓相鄰的回
> 承先啟後、像連續小說（`6f6d4fd`/`ac7a4bd`/`1bcfe18`），並移除「且看下回」收場套語。**仍未接線**＝決定
> 「何時」織的 **Phase A 進展閘**（章回目前仍在事件 resolve 時才織）。

- **POV（原料層）**：每角色每事件一篇第一人稱。**不再對外當「章回」**，它是
  - 「追我的角色」訂閱者的個人 feed（粉絲經濟單元）；
  - 未來**角色 PV 預告片**的素材來源（見 §7）。
  subject=`character_id`。產製：`character-worker`（已有）。

- **事件合本「回」（商品層）**：一個 compiler 吃掉**同一 `eventTx` 的所有 POV +
  客觀事件骨架**，織成一篇打磨過的章回（羅生門式：同一樁封箱，班主心裡是白蘭、
  唐桂蘭心裡是軍閥 —— `NARRATIVE_AGENTS §5` 的實測案例**正是本層的賣點**）。
  subject=`event_id`。產製：**新建 `event-chapter-compiler`**（gazette-compiler 的兄弟）。

**為什麼能織**：`ChapterProvenance{ eventTx, involvedIds, sceneId, day }`
（`shared/types/chapter.ts`）已經把 N 篇 POV 標記成「同一事件的 N 個角度」。
合本 compiler 只是 subject 換成 event、輸入換成「該事件全部 POV」。

**鐵律：全鏈路每個產物都蓋 event provenance 章。** 這是商業化最重要的工程紀律 ——
POV、劇照、影片 shot 只要都帶同一個 `eventTx`，就能事後自動組裝成合本／影片，也能讓
讀者在「公報頭條 → 劇照 → 事件 → 各角色 POV → 影片」之間無縫導航。**那條可導航的鏈
本身就是產品。**

### 合本 gate
- 該事件 **≥2 篇 POV**（即 ≥2 個有訂閱者的角色參與）才織 —— 只在有付費觀眾處花成本。
- 1 篇 POV 的事件：不織合本，POV 直接當該角色 feed 的一則。

---

## 3. 公報 = 免費漏斗 + 連載預告

公報定位：**梨園的報紙**（「菊部春秋」式）。現在 `gazette-compiler` 是 template-strict、
只平滑事件散文 —— 太乾，當不了商業漏斗。商業化要它做三件事：

1. **發現層**：公開、可分享、可 SEO —— 沒訂閱的人從這裡進來。
2. **頭條 = 事件**：每條頭條對應一個事件，配一張**劇照縮圖**（§5）+ 鉤子，
   CTA =「讀合本」「看 N 個視角」。
3. **連載預告**：把 gated 的合本／POV 當「下回分解」吊著，驅動訂閱。

導演／角色記憶的不對稱（`NARRATIVE_AGENTS §5` 鐵律）天然對齊存取模型：
**公報＝導演客觀＝公開；合本／POV＝角色主觀＝付費。** 公報只給客觀骨架 + teaser，
不洩私密。

---

## 4. text → image → video 一致性鏈路（核心教條）

一句話：**每一層都 condition on 上一層的 anchor，沒有任何一層從零生成。**

```
文字層（發生了什麼 · 可驗）:
  事件（鏈上骨架, eventTx）
    → 各角色 beat/intent（scene-lines, 暫存）
    → POV（anchored, 蓋 provenance 章）
    → 事件合本「回」（anchored, subject=event_id）

圖片層（靠 anchor 條件化保持身份）:
  角色 mint anchor 肖像（chain image_url, Walrus 永久） ─┐
  場景 anchor 板（SceneGallery.anchor）                ─┼→ 全部向前條件化
  physical_facts + 本色卡 persona                      ─┘
    → 肖像變體（evolve-portrait：戲妝/老年/日常）   [角色錨定]
    → 事件劇照（beat 錨定的合成圖）                  [場景+角色錨定]

影片層（靠劇照當 keyframe 保持連續）:
  事件劇照 = 影片的 first-frame / keyframe
    → image-to-video（Seedance/Kling）：劇照 → 一個 shot
    → shot-list = 該事件 beats 依序，每個 shot 從它那張 beat 劇照起手
    → 拼接 → 事件 clip（video-compiler multi_pov）/ 日 trailer / directors_cut
```

**三種一致性，各有對應解法**：

| 一致性類型 | 意思 | 解法 |
|---|---|---|
| **身份一致** | 同一個人長一樣 | anchor 條件化：臉／戲妝來自 mint anchor；影片用 image-to-video 不換臉（§11 鐵律） |
| **連續一致** | 圖＝文＝影對得上 | provenance 蓋章 + **劇照就是該 POV 那一刻的插圖、也就是影片那個 shot 的 first frame**（單一 beat 來源，不各生各的） |
| **正典一致** | 真的發生過 | 全部回溯到單一 `eventTx`。⚠️ POV 之間**主觀分歧不是 bug**（羅生門）；客觀事件骨架才是正典，POV 是角度 |

> 關鍵工程點：**影片用 image-to-video，不用 text-to-video。** 用劇照當 first frame，
> 影片模型只負責「讓這張定格動起來」—— 臉、戲妝、場景全部繼承自劇照，劇照又繼承自 anchor。
> 這是整條鏈路一致性閉合的地方。`video-compiler` 現註解寫「inputs: Walrus portraits」，
> 要再往前一步：**不直接餵肖像給影片，先合成劇照、再用劇照驅動影片**，連續性才穩。

---

## 5. 劇照截圖機制

劇照是文字↔影片之間的橋，也是最便宜的病毒／漏斗單元。

**① 何時截（trigger）—— 可配置（拍板）**
- 預設掛在 **judge 自動收尾（事件結算）**：但**不只截峰值**，而是截**所有越過張力門檻
  的 beat**。
- 配置（saga 級 or 全域 env）：
  - `STILL_TENSION_THRESHOLD`：beat 的 `SceneHeatProfile.cinnabar`（內在衝突／慾望）
    越過此值才截。
  - `STILL_MAX_PER_EVENT`：每事件上限（成本上限，避免一場長戲爆量）。
  - `STILL_ALWAYS_CLIMAX`：即使全程未越門檻，至少保證截結算瞬間 1 張。
- 每張劇照帶 `eventTx`+`sceneId`+`beatIndex`+`involvedIds`，可驗：
  「此圖描繪鏈上事件 0x…的第 N 拍」。

**② 怎麼組（一致性核心）—— 合成式 img2img，絕不從零生**
```
Still = f( 場景 anchor（SceneGallery.anchor）,
           [ 每位在場角色的 anchor 肖像（chain image_url）+ physical_facts ],
           beat 文字（該 tick intent / scene-lines）,
           heatProfile（cinnabar/jade/mute → 色溫·強度） )
```
- **臉／戲妝／身段** ← 角色 anchor 肖像條件化（多角色 = 多參考條件化，或逐角色 inpaint 到場景板）。
- **場景** ← `SceneGallery.anchor` 當底板。
- **姿態／情緒／光** ← beat 文字 + heat profile。

**③ 存哪**
- `SceneGallery.moments`（型別已有，就是為「每瞬間 img2img 變體」留的）。
- 上鏈：`commitment::commit(subject=event_id, hint="still:beat<i>")`。

**④ 怎麼分級（商業化）**
- **低清／浮水印劇照 = 公開 teaser**：進公報當頭條圖、可分享到社群 = 病毒漏斗。
- **全清劇照 + 它描繪的那一刻 POV = gated**。
- 一張圖同時是行銷素材和商品。

---

## 6. 成本 / 商業 gating

生成很貴（圖貴、影片更貴），每層用**戲劇張力 + 經濟**雙重 gate，沿用 subscriber-gate 教條。
**導演（唯一全知視角）當生成預算守門人**（對齊 `NARRATIVE_AGENTS §11`）。

| 產物 | Gate | 理由 |
|---|---|---|
| POV（原料） | `subscriber_count>0`（已有） | 沒人讀不生 |
| 事件合本 | 該事件 ≥2 篇 POV | 只在有付費觀眾處織 |
| 劇照 | 事件結算 + 越張力門檻 beat（可配上限） | 數量有界、ROI 高（公開 teaser） |
| 影片 | 高 importance 結算事件 **或** owner 付費 **或** trailer 週期 | 最貴 → 最緊 |
| 角色 PV | defer | 看時間（§7） |

---

## 7. 角色 PV（預告片）— defer，看時間

> **決策（2026-06-10）：想做，但排最後、看時間。**

- **是什麼**：以「追一個角色」為主軸的短預告 —— 把該角色跨多事件的 POV / 劇照 / clip
  剪成一支 15–30s 人物 PV，當**拉新訂閱**的鉤子（「認識這個花旦 →訂閱」）。
- **為什麼能做**：素材天然就位 —— 該角色的 POV 原料（§2）+ 帶該角色 `involvedIds` 的
  劇照（§5）+ clip。subject=`character_id`。
- **產製**：`video-compiler` 加一個 `character_pv` mode（沿用 image-to-video 一致性鏈路）。
- **不在本輪做**；本輪先把 事件合本 + 劇照 MVP 跑通。

---

## 8. IA 重排（章回頁 + 人物詳情章回頁）

> 現況是 **single-POV-centric**；拍板後翻成 **event-centric**。
>
> **兩本書模型（2026-06-15 redesign 落地，commit `efaf03b`）**：閱讀面收斂成三種「回」——
> **梨園回**（event_cut，多 POV 織入、**公開**）· **角色回**（per-char POV 第一人稱、**訂閱限定**，
> 非訂閱者只見 server 端萃取的首段 teaser + 漸層遮罩 + `SubscribeButton`，全文永不送出）· **公報**（gazette，公開）。
> 「餘波」併入角色回。所有章回文案集中在 `lib/copy/chapters.ts`（`CHAPTER_COPY`）。

### 8.1 章回頁 `/feed`（現 `app/(site)/feed/page.tsx`）

現有 mode：`全部 / 公報 / 文字連載 / 影像與畫冊`，列的是單 POV chapter（`{pov} 視角`）。

**新 IA：**

| mode | 內容 | 說明 |
|---|---|---|
| **公報** | 每日公報（導演客觀） | 免費漏斗頂；頭條 = 事件 + 劇照縮圖 + CTA |
| **章回** | **事件合本「回」** | 正式章回 = 主閱讀面；每則一個事件，列 involved 角色 chips + 劇照 cover |
| **影像** | 劇照畫冊 + clip（+未來角色 PV） | 視覺漏斗 |

- 單 POV **不再出現在 `/feed` 頂層**；它退到角色 dossier（§8.2）與合本內的「視角切換」。
- 合本卡片：標題 = 事件名、cover = 該事件峰值劇照、meta = involved 角色 + DAY + `eventTx` 可驗。
- 事件頁（新 `/feed/event/[id]` 或復用 chapter 頁）：客觀骨架 + 劇照 + 合本（gated）
  + 各角色 POV 切換（gated）+ clip。= 漏斗轉化頁。

### 8.2 人物詳情章回頁（現 `ChaptersTab.tsx`）

現有三段：`ChainPovSection（鏈上 POV）` / `{角色}視角（mock）` / `同場群像`。

**落地 IA（`efaf03b`，角色第一人稱書為主）：**

| 段（順序） | 內容 | 對應 |
|---|---|---|
| **1. 角色回 · 鏈上 POV**（領銜） | 該角色的第一人稱本傳＝其主文，故置頂；訂閱牆 gated 不變 | `ChainPovSection` |
| **2. 梨園回**（其下） | 該角色出場的**公開事件合本**（多 POV 織入的群像回） | `Section` → 連到合本／cut 頁 |

- 角色回（第一人稱深讀）**領銜**，下接其出場的公開梨園回；「同場群像」併入梨園回（同場 = 同事件 = 合本）。
- 文案走 `CHAPTER_COPY.pov.*` / `CHAPTER_COPY.cut.*`（集中於 `lib/copy/chapters.ts`）。
- dossier 變成「角色 → 切進事件」，feed 變成「事件 → 展開角色」，兩邊互補。

---

## 9. 落地清單（對應檔案）

| 動作 | 落點 | 風險 | 狀態 |
|---|---|---|---|
| 本檔（canonical） | `docs/CONTENT_PIPELINE.md` | — | ✅ |
| shared 型別接縫：`ChapterKind`/`EventCutChapter`/`EventStill` | `shared/types/` | 低（additive） | ✅ |
| **合本 compiler（runOnce + 純 weave + 單元測試）** | `runner/services/event-chapter-compiler/` | 低 | ✅ |
| **合本接進 tick loop**（POV anchored ≥2 → tick body inline 序列織回） | `web/lib/actions/tick-loop.ts` | 中 | ✅ |
| **合本 server action + admin 面板（手動補織/預覽）** | `web/.../compile-event-chapter.ts` · `EventCutPanel` | 低 | ✅ |
| **合本鏈上讀 + facade + `/feed` 章回 mode** | `cut-read.ts` · `api/cuts.ts` · `CutList` · feed | 中（前端） | ✅ |
| `/feed` IA 四 mode（全部/公報/章回/影像） | `app/(site)/feed/page.tsx` | 中（前端） | ✅ |
| dossier 章回 IA（角色回領銜 → 梨園回） | `components/dossier/tabs/ChaptersTab.tsx` | 低（前端） | ✅ |
| **訂閱牆**（角色回 POV：非訂閱者只見首段 teaser + 漸層 + CTA，全文不送出） | `ChainPovSection.tsx` · `chain/pov-read.ts`（`withTeaser`/`firstParagraphPlainText`） | 中（前端） | ✅（`efaf03b`） |
| **章回文案集中化**（`CHAPTER_COPY`） | `lib/copy/chapters.ts` | 低 | ✅（`efaf03b`） |
| 全鏈路蓋 POV provenance（eventTx/involvedIds） | tick-loop（`anchorPovChaptersBatch`+`embedProvenance`） | — | ✅（既有） |
| 事件級劇照（多角色 anchor 條件化、kind=4、eventTx metadata） | `web/.../generate-event-moment.ts`（tick body inline，timeout-bounded） | — | ✅（既有） |
| `still-compiler` 型殼（beat 級 + teaser/full 分級的演進） | `runner/services/still-compiler/` | 低 | ✅（型殼） |
| beat 級劇照（越張力門檻可配置截 + 分級） | `still-compiler` runOnce | 中 | TODO |
| 公報漏斗化（本日頭條 hook + 連載預告 CTA → `/feed?mode=chapter`） | `gazette-compiler/prompt.ts` | 低（純 prompt） | ✅ |
| 公報頭條嵌劇照縮圖（threading 事件 still URL） | `gazette-compiler` snapshot | 中 | TODO |
| tick inline 簽名序列化（moment→cut 同一序列、`runJobWithTimeout` 包 timeout，避免 owned cap 撞版本；改 inline 因自架 VPS 上 `after()` 不觸發，`f0e209f`/PR #45） | `tick-loop.ts` | — | ✅ |
| 影片改 image-to-video（劇照當 first frame） | `video-compiler`（R6 stub） | 高 | TODO |
| 角色 PV mode | `video-compiler` `character_pv` | — | defer |

**合本可見性（2026-06-15 拍板，已落地）**：跨角色付費 gate 規則未定，故**梨園回（event_cut）＝公開**
（展示漏斗主秀、可分享），付費牆改架在**角色回（per-char POV）**——非訂閱者只見 server 端萃取的首段
teaser，全文永不送達。原「premium 全文 gate 待跨角色規則」改為：跨角色合本維持公開，營收 gate 走角色回訂閱。

**已完成的順序**：型別接縫 → 合本 compiler（+測試）→ tick 接線 → server action/admin →
鏈上讀/facade/feed → dossier IA。**剩**：beat 級劇照 compiler → 公報漏斗化 → 影片 → 角色 PV。

---

_本檔是活文件；每落地一項，更新 §9 狀態。_
