# PROSE_REGEX_INVENTORY — 自然語言語意耦合盤點

> Phase 0 snapshot · 2026-07-26 · base `origin/dev@212a146`
>
> 範圍：`packages/engine/src`、`packages/web/src/lib/chain`、
> `packages/economy/src`、`packages/troupe/src`、`packages/runner/src`。
> 行號是本次盤點快照；後續以 symbol 名為準。

## 1. 判準與結論

本表把「站點」定義為一個**語意決策邊界**，不是每一個 `.test()` 呼叫。
同一 predicate 被一個機制重用時合併成一站；同一段 prose 觸發不同拒絕理由時分站。
JSON 擷取、ID 格式、檔名、Markdown/provenance 解析不算語意站點，但集中列在 ⚪，
避免日後重掃時誤報。

共 **44** 站：

| 類別 | 站點數 | 結論 |
|---|---:|---|
| 🔴 LLM 散文 → 改狀態／授權／擋提案 | **5** | 4 站在 `physical-canon`，1 站是 `scene-loop` 的稱呼 prose gate |
| 🟠 LLM 結構化自由文字 → 改狀態 | **18** | 最大宗不是 `desc`，而是名義上「analytics only」但實際負責 routing/auth 的 `Want.layer` |
| 🟡 人類 preset／舊快照字串 → 語意耦合 | **11** | 場景、角色、tone、物件 state 都有領域字串耦合 |
| ⚪ 只影響散文／prompt／log／report | **10** | 保留，不納入狀態入口退役 |

最重要的現況矛盾：`Want.layer` 的型別註解仍寫著「analytics only, never a gate」
（`core/want-core.ts:16-18`），但它其實決定夜間 routing、親密／清算 scene、
邀約、相許、授權、撤銷、情分淡去與 felt edge。這不是局部 regex 問題，
而是缺少一組有限、可驗證的 **want semantic tags**。

## 2. 🔴 LLM 散文 → 狀態或閘門（5）

| ID | 路徑／行 | 比對內容原文 | 輸入與副作用 | 已有／所需結構欄位 |
|---|---|---|---|---|
| R1 | `packages/engine/src/core/physical-canon.ts:42-51,96-108` `mentionedAlias` / `leaksHiddenIdentity` | `text.indexOf(alias)`；客觀敘述提到 hidden object alias | **LLM beat prose → 擋提案**：若 witness 不知該物且沒有 visibility effect 就 throw | 已有 `objectEffects[].visibility`；STRICT 只認它。舊 alias 比對只做 shadow `hidden-identity` divergence |
| R2 | `packages/engine/src/core/physical-canon.ts:19-20,60-64,109-113` `PHYSICAL_REFERENCE` | `看向/指向/摸/握/拿起/…`，物名前後 ±20 字 | **LLM beat prose → 擋提案**：散文像在碰不可及物件就 throw | 已有 object id + accessibility ledger；STRICT 不從散文推「碰過」。如要表示觸碰但不 mutation，需另有 optional structured observation/action，不能拿 prose 當 gate |
| R3 | `packages/engine/src/core/physical-canon.ts:13-17,53-58,114-118` `DURABLE_MUTATION` | `拿走/放進/打開/撕/燒/(?<![已既])簽/…`，物名前後 ±32 字 | **LLM beat prose → 擋提案**：命中但無 `objectEffects` 就 throw | 已有 `objectEffects`；STRICT 缺席即「無物理變動」，regex 只記 `prose-mutation-without-effect` |
| R4 | `packages/engine/src/core/physical-canon.ts:21,66-70,119-123` `HANDOFF` | `交給/遞給/塞給/交到…手/…接過` | **LLM beat prose → 擋提案**：命中但無 `carrierName` 就 throw | 已有 `objectEffects[].carrierName` / `carried`；STRICT 只認結構欄位，regex 只記雙向 divergence |
| R5 | `packages/engine/src/core/scene-loop.ts:436-461` `openingVocative` | `new RegExp([引號] + 人名 + [，：])`，再和 `addressed` 對照 | **LLM beat prose → 擋提案／三改／跳拍**：稱呼和 structured addressee 不一致就 replan | 已有 `addressed`，且 `scene-perception` 已 fail-closed；STRICT 應以 `addressed` 為唯一感知依據，把 opening-vocative 檢查降為 shadow |

## 3. 🟠 LLM 結構化欄位仍是自由文字（18）

| ID | 路徑／行 | 比對內容原文 | 副作用 | 結構化替代 |
|---|---|---|---|---|
| O1 | `packages/engine/src/tick.ts:388-421` `INVITE_LAYER` | `/愛\|情\|虧欠\|愧\|償/.test(want.layer)` | 挑出可向目標發邀約的 want；成功即 `grantAccess(...,'oneTime')` | `Want.semanticTags`（至少 `affection` / `reckoning`）+ canonical target id |
| O2 | `packages/engine/src/tick.ts:1158-1183` `LOVE_WANT` | `/愛\|情/.test(wnt.layer)` | 舊世界第一次立鑰時，單戀者取得 one-time pass | `semanticTags: ['affection']`；STRICT 不從 layer fallback |
| O3 | `packages/engine/src/core/want-core.ts:141-381` `LOVE_LAYER` / `RECKON_LAYER` / `JEALOUS_LAYER` | `愛/情`、`虧欠/愧/償/怨`、`妒/怨` | 夜赴、撞破、幽會、了結、傾訴排除、hostile trust gate；最後改變 movement/scene composition | 同一組有限 `Want.semanticTags`；predicate 改查 tag，STRICT 才關閉 layer fallback |
| O4 | `packages/engine/src/core/scene-loop.ts:211,325,601-604` `isBondLayer` / `/愛\|情/` | `Want.layer` | 降低私場 resistance、開親密 gate、同場加 heat（直接改 want） | `semanticTags`；數學常數不動 |
| O5 | `packages/engine/src/tick.ts:1833-1858` `loveWantBetween` | `/愛\|情/.test(wnt.layer)` | 觸發 `judgeEstablished`；true 後寫 established pair、bond、雙向 standing keys | `semanticTags: ['affection']` + target id；judge 回覆仍是結構 bool |
| O6 | `packages/engine/src/tick.ts:2440-2464` `HOSTILE` | `/妒\|怨\|恨\|仇/.test(wnt.layer)` | **撤銷 standing key**，租客時並終止 lease | `semanticTags: ['hostility']` + target id；這是 Phase 1 首要路徑 |
| O7 | `packages/engine/src/tick.ts:2593-2631` `LOVE_LAYER` | `/愛\|情\|戀\|眷\|慾/.test(wnt.layer)` | `heartsCanFade` 下累計 `starveDays`、降 weight、retire want | `semanticTags: ['affection']`；動力學常數不動 |
| O8 | `packages/engine/src/core/want-rewrite.ts:129,221-244` `ROMANTIC_HOSTILE` / cast-name substring | desc/layer 命中 `愛情戀慕恨妒怨敵仇虧愧償`，且 desc 包含角色名 | 新 want 的 target 與 resistance 由自由文字反推，直接入帳 | `RewriteSpawn.target` + `semanticTags` 由專門座席宣告；rewrite `desc` 不得改 tags/target |
| O9 | `packages/engine/src/tick.ts:2187-2196` foreclosure `aboutIt` | `want.desc.includes(contract label)` 或 `/搭檔\|聯名\|署名\|填…名\|簽/` | 合約逾期時 retire 被認為「關於此約」的 want | 新增 stable `Want.subjectRef`（如 `{kind:'contract', id, aspect?}`） |
| O10 | `packages/engine/src/tick.ts:488-495`、`core/stakes-brief.ts:194-202` | `!/淡了\|過去了/.test(want.resolvedNote)` | 決定祈願能否 fulfilled／還願 | 新增 `resolutionCause: 'fulfilled'|'faded'|'foreclosed'|…`；note 只敘事 |
| O11 | `packages/engine/src/core/season-economy.ts:1647-1653` | `pending.demand.includes(needle)` 對 `acceptDemandsMatching[]` | fake/no-seat condition counter 的接受與否，改契約狀態／期限 | `conditionCode` / typed amendment clause；STRICT 缺碼時 fail closed，不比 prose。不得改錢算術 |
| O12 | `packages/runner/src/services/character-agent/want-ripple.ts:65-79` | `/^(省略\|無\|沒有\|不新增\|none\|null\|n\/?a)$/` on `newThread` | 決定是否建立 ripple want | schema 直接用 optional/null `newThread`；STRICT 不把 sentinel prose 當 null。此輪依規格只記錄，不改 runner |
| O13 | `packages/runner/src/services/character-agent/parse.ts:238-289` `hasAuthorityDrift` | `掌控全班/自立門戶/當上…班主/…` on structured plan strings | 替換整份 plan；`tick.ts` 之後持久化到 `CastMember.plan` | 專門 plan seat 回 `authorityIntent` enum 或 policy verdict；屬 subjective plan，不是客觀 canon。本輪只記錄 |
| O14 | `packages/runner/src/services/induction/{index,batch,prompt}.ts`、`genesis-memory/prompt.ts` | structured gender 若 `includes('男'/'女'/'中性')` | LLM induction 結果被 coercion 成持久角色 identity | 嚴格 enum `male/female/neutral`；本輪只記錄 runner |
| O15 | `packages/web/src/lib/chain/arc-convergence.ts:57` `deriveArc` | `who.includes(castName) || castName.includes(who)` | LLM structured `who` 決定哪個角色成為 durable arc 中心 | 回 canonical character id；web 舊機制依 `ENGINE_CORE` 只盤點，不在本輪加新實作 |
| O16 | `packages/web/src/lib/chain/event-planner.ts:24-109` | statement 的 `頭牌/唱片/搭戲/傾心` substring 與 `「kind:display」` regex | 決定 event `templateId`，該 id 又成為 settlement key | `TensionRow.resourceKind/resourceId`；statement 只顯示 |
| O17 | `packages/web/src/lib/chain/spine-core.ts:349-409` | resource label 與 `TensionView.statement` 的 `startsWith/includes` | orphan event 選資源、選 winner，最後規劃 resource transfer | tension 直接帶 `resourceId`；winner 對同一 id 比 tension |
| O18 | `packages/engine/src/world-state.ts:566-574` 舊快照 migration；`core/physical-canon.ts:149-153` | container 含角色名且命中 `/懷\|袖\|手中\|身上\|兜\|袋/` | 舊物件反推 `carriedBy`，或拒絕 effect | 已有 `WorldObject.carriedBy` 與 effect `carried/carrierName`；STRICT 禁文字 fallback，舊 snapshot migration 需顯式版本／warning |

## 4. 🟡 人類 preset／種子字串（11）

| ID | 路徑／行 | 比對內容原文 | 副作用 | 宣告式替代 |
|---|---|---|---|---|
| Y1 | `packages/engine/src/tick.ts:1112-1142` bond underlay | relationship view / edge tone 命中 `INTIMATE`、`YEARNING`、`KNOWN` | 懶種 bond 數值與 established pair | preset 明列 `bonds[]` / `establishedPairs[]`；STRICT 不懶猜，缺席 warning |
| Y2 | `packages/engine/src/world-state.ts:724-731` `welcome` | edge tone 命中 `戀慕愛親暖友` 或 `妒怨恨冷敵競` | 夜間 welcome gate，並間接影響一次性／standing access seed | edge 加有限 `disposition` 或 preset 直接宣告 `welcome`；STRICT 不讀 tone |
| Y3 | `packages/engine/src/core/skills.ts:31-36` `isStageScene` | scene name `/戲[台臺]\|舞[台臺]\|台上\|登台\|開鑼/` | 決定 stage skill 注入、演出 skill boost | `SceneInfo.capabilities: ['stage']` |
| Y4 | `packages/engine/src/core/temple-prayer.ts:22-32` `TEMPLE_NAME_RE` | `廟/寺/庵/城隍/觀音/神壇/神龕/教堂/禮拜堂` | 決定祈願、還願、香火、廟 PULL 是否存在 | `SceneInfo.capabilities: ['temple']` |
| Y5 | `packages/engine/src/core/season-economy.ts:1403-1408` performance boost | `object.state.includes(boost.stateIncludes)` | preset 文字條件決定票房 pct | 物件 `stateTags[]` + boost `requiredStateTag`；不改 pct 算術 |
| Y6 | `packages/economy/src/derive.ts:52-69` `ROLE_BASE_FLOOR_GROUPS` | `role.includes(keyword)` | 角色 base-floor salary，進 bigint 經濟狀態 | preset / character config 明列 salary class 或 base floor；本任務禁止改 economy arithmetic |
| Y7 | `packages/troupe/src/hangdang.ts:50-62` `castingFromRole` | role substring/regex 推 `hangdang` / `yinggong` | production casting slot 與 fit | roster/preset 明列 `hangdang`、`yinggong[]` |
| Y8 | `packages/web/src/lib/chain/drama-core.ts:117-263` role/resource semantics | role substring、backstage regex、名字 `/生\|柳/` fallback | legacy drama demand eligibility / weight | typed role taxonomy + resource kind/id；web 舊機制只盤點 |
| Y9 | `packages/web/src/lib/chain/saga-skills-core.ts:49-121` | role substring → skill/craft profile | 寫入角色 skill 數值，影響 contest/production | preset 明列 skill profile 或 typed occupation id |
| Y10 | `packages/engine/src/core/renown.ts:20-56` `ROLE_RENOWN` | exact free-text role table | 種 `renown` / `selfRegard`，之後會被票房改動 | preset 已可用 name-keyed override；STRICT 要求顯式值或 neutral default，不讀 role |
| Y11 | `packages/engine/src/core/acquaintance.ts:31-54` `PUBLIC_ROLES` | exact role in `花婆/小販/記者/歌女/班主` | 懶種 acquaintance `acquainted` | member/preset 明列 `publiclyRecognizable` 或 occupation capability |

## 5. ⚪ 只影響敘事／輸出／監測（10；不要動）

| ID | 路徑／行 | 用途 | 為何不改 |
|---|---|---|---|
| W1 | `packages/engine/src/editorial-artifact.ts:12-46` `LEGACY_DURABLE_MUTATION` | dossier/object audit report | 只報告，不改世界；正是 regex 適合留下的 monitor 類用途 |
| W2 | `packages/engine/src/core/temple-prayer.ts:37-60` | gender → 信士/信女、廟名 → deity hint | 只組 prompt／散文，沒有狀態權威 |
| W3 | `packages/runner/src/services/character-agent/move-guard.ts`、`services/narrative-audit/index.ts` | 代詞、行當稱謂、機制 token、重複字樣的 prose 修整 | destination/actors/order/ledger 不變；只換 reason/正文 |
| W4 | `packages/engine/src/core/scene-perception.ts:21-55` 及 addressed name resolution | 結構化 `audience/addressed` 的 fail-closed 感知 | 已是本 repo 最乾淨的結構化資產；依任務規格禁止放寬 |
| W5 | runner/web 的 JSON brace 擷取、ID/hash、URL、檔名、Markdown、provenance regex | transport/format parsing | 不解讀領域語意，不改世界決策 |
| W6 | `packages/web/src/lib/chain/plan-intent-store.ts:55-80` | 從固定 `[長期目標]` / `[眼下打算]` 格式投影 dossier UI | public read projection；不是 engine/canon authority |
| W7 | `packages/web/src/lib/chain/relationship-felt.ts:21-78` | want layer → read-only felt edge projection | 函式明確不寫 store/chain；應最終改讀 tags，但不是世界狀態入口 |
| W8 | `packages/engine/src/tick.ts:1369-1385` `relationFor` | view/tone regex 轉成 `AidPeer.relation` | 只餵 `decideAid` prompt；真正轉帳仍由 structured reply + economy validator |
| W9 | `packages/engine/src/adapters/local/fake-scene-agent.ts` 與 `**/*.test.ts` 的 regex | deterministic fixture/test assertion | 測試與假座席可繼續用文字產生固定行為；不得誤算成 production authority |
| W10 | `packages/engine/src/core/scene-loop.ts` recurring imagery／對白片段比對，runner narrative formatters | 文筆避重、段落切割、顯示 | 只影響 rendering/prompt，不碰 state |

## 6. 已知起點與 repo 現況差異

1. `physical-canon` 的三組 regex 與負向後顧仍在，二手盤點正確；另外還有未點名的
   hidden alias gate（R1）與 scene-loop opening-vocative gate（R5）。
2. 日終換鎖仍由 `Want.layer` 的 `妒/怨/恨/仇` 決定，二手盤點正確；但不是唯一授權 regex。
   邀約、初次立鑰、相許後雙向 standing keys 也都讀 `Want.layer`（O1/O2/O5）。
3. bond 底圖懶種與私處鑰匙懶種仍在（Y1、O2），二手盤點正確。
4. 廟／戲台仍從 scene name 推（Y3/Y4）。
5. **食肆名稱推斷已不存在。** 現行 `foodScenesOf`
   （`packages/engine/src/core/season-economy.ts:950-968`）只把
   `kind:'meal'` 且帶 explicit `sceneName` 的 catalog item 建成 scene-id map。
   這已是結構化 anchor，不應為了對齊舊盤點而退回 regex。

## 7. 真正的 schema 缺口

下列站點找不到現成結構欄位，不能只「換一個 if」：

1. **Want semantic tags**：至少需要有限集合
   `affection / reckoning / jealousy / hostility`。它們屬 engine-owned
   mechanism metadata；一般 `want-rewrite` 只能改 `desc`，不得順手改 tags。
   genesis / ripple / aftermath / regenerate / 專門語意更新座席必須明示。
2. **Want subject reference + resolution cause**：契約逾期不能再從 `desc` 猜
   「這條心事是不是關於這份約」；祈願也不能從 `resolvedNote` 猜是實現、淡忘或作廢。
3. **Typed condition counter**：`pending.demand` 仍需 prose 顯示，但接受政策要比
   stable `conditionCode`，不是 `includes`。
4. **Scene capabilities**：`stage` / `temple`（未來可有 `workplace` 等）需由 preset 宣告。
5. **Typed authored semantics**：bond/established、public recognizability、
   occupation/skills/salary class、object state tags。這些是內容包的 schema，
   不應由研究 core 維護中文詞表。

Phase 1–3 先處理會直接污染授權、物件守恆與場景能力的部分；
其餘缺口必須在 STRICT profile 下關掉 fallback 或明確標示仍未退役，
不能在最終文件宣稱「所有自由文字狀態耦合已清零」。
