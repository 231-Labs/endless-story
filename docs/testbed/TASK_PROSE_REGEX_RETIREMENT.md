# 任務：散文正則退役（Prose-Regex Retirement）

> 這份文件是給執行 agent 的工作規格。讀完直接開工，分階段分開 commit。
> **以下引用的路徑與行號來自二手盤點，可能已過時。一律以 repo 現況為準；若與本文不符，以現況為準，並在最終報告中列出差異。**

---

## 0. 一句話目標

**讓「LLM 產出改變世界狀態」只能經由結構化欄位；散文降為純敘事層。**

## 1. 為什麼（不要跳過，這決定了怎麼做取捨）

`docs/testbed/RESEARCH_DESIGN.md` §9 把「結構化行動唯一入口、廢散文正則」列為 8/8 前的必做項；`docs/testbed/MECHANISM_AUDIT.md` 自曝的三個確定性威脅裡有兩個是這件事（#2 物件守恆依賴中文動詞正則、#3 場景語意靠名稱正則）。

要害在於：**這個 testbed 的研究主張是「密碼學授權擋不住社會工程」。如果行動的合法性有一部分是由 regex 比對中文散文決定的，那實驗裡觀察到的「攻擊」可能只是 regex 規避，不是社會工程。** 這會直接摧毀 construct validity，而且審查者一定會問。

推論出三個取捨原則：

- **授權路徑（grant / revoke / canEnter）的正則優先級最高**，比物件守恆更高，因為它直接是被測量的對象。
- 只影響散文、prompt、log、report 的比對**不要動**。那些不改狀態，不是威脅。
- 人類 preset 寫死的字串（scene.name、role、container 種子）風險低，但仍要處理，因為它讓「換一個領域」變成改正則。

## 2. 三個不可協商的設計決策

執行時不要自行改動這三條。若你認為其中哪條有問題，**停下來寫進報告，不要逕自換方案。**

### 2.1 用 flag，不是刪除

新增 profile `STRICT_STRUCTURED`（命名依 repo 現有旗標慣例，先去看現況怎麼命名的再定）。

- **預設 off。** off 時必須與改動前 **byte-identical**——repo 已有這個驗法（`world-converge-allflags`、`world-longrun` 一類的逐拍決定論測試），沿用它，不要發明新的。
- on = 研究臂（對應 `docs/testbed/TESTBED_BOUNDARY.md` 的 research-minimal profile）。
- 理由：`docs/narrative/ENGINE_CORE.md` §5 鐵律「實驗不 fork core，對照組用同一份 core + 不同 flag」。而且這個 flag 本身就是論文 ablation 章節的一行。

### 2.2 正則降級為 shadow monitor，**不是刪掉**

這是本任務最重要的一條，也最容易做錯。

現況（以 `physical-canon.ts` 為例）：正則命中 → `throw` → 進 `scene-loop` 的三改迴圈 → 三次不過就 `[跳拍]`。也就是說正則是一個**閘門**。

STRICT 模式下要改成：

- 世界狀態**只由 `objectEffects` 定義**。散文怎麼寫都不解析、不擋。
- 舊的正則**繼續跑**，但只做比對並**記錄一筆 divergence 事件**（散文描述了 mutation 但沒有對應 `objectEffects`，或反之），不 throw、不 replan、不影響任何狀態。
- divergence 逐拍累計，成為一個可報告的指標：**prose/state divergence rate**。

為什麼不刪：刪掉就永久失去這個數據。降級之後，它從一個脆弱的閘門變成一個乾淨的量測儀——而且正好對上 `RESEARCH_DESIGN.md` §5 的 Monitor / Enforce 雙模設計（Monitor 模式：違規可發生、只裁判記帳；Enforce 模式：硬性擋下）。同一個開關，兩篇論文都住得下。

**同時要明確記錄不變量的改變**：從「散文與狀態必須一致」變成「**狀態僅由結構化指令定義，散文是一個 rendering**」。這句話要寫進 docs，不能默默改。

### 2.3 分階段、分開 commit

每個 phase 一個 commit，可獨立 revert、可 bisect。不要一個大 commit。

---

## 3. 全域不變量（任一條紅就回退，不要「大致上綠」）

1. `pnpm -r type-check` 全綠。
2. `node --test` 零憑證跑完 engine core 全部機制測試（`ENGINE_CORE.md` §5 鐵律：engine core 永遠 node-clean）。
3. **flag off 時逐位元組相同**——用 repo 既有的決定論測試驗，不是用肉眼看。
4. `FakeSceneAgent`（零 LLM 對照臂）在 flag on / off 兩種狀態下都必須跑得完且決定論。
5. **不要碰經濟算術**。`@endless-story/economy` 的 `production.ts` / `contract.ts` 已經是乾淨的結構化路徑，`auditSeasonEconomy` 的守恆不變式不得被影響。
6. **不要碰 `core/scene-perception.ts` 的 fail-closed 語意**。那裡已經是純結構化欄位判定（`audience` / `addressed`），是全 repo 最乾淨的一塊，是資產不是債務。
7. 不新增 `web/lib/chain` 對 engine 的依賴，不把 engine core 弄髒。

---

## 4. 執行階段

### Phase 0 — 窮盡盤點（先做完，產出文件，再動任何程式碼）

掃 `packages/engine/src` 全部，加上 `packages/web/src/lib/chain`、`packages/economy/src`、`packages/troupe/src`、`packages/runner/src`。找出所有「用正則或子字串比對讀自然語言，並據此決定狀態或閘門」的站點。

每個站點記錄：路徑行號 / 比對內容原文 / **輸入是 LLM 生成還是人類 preset 寫死** / 副作用分類（改狀態 vs 擋提案 vs 決定授權 vs 只影響散文）/ 是否已有結構化欄位可取代（有就指出欄位名，沒有就指出要新增什麼）。

分四類標記：

- 🔴 LLM 散文 → 改世界狀態或授權（**必須處理**）
- 🟠 LLM 結構化欄位但仍是自由文字（want desc、layer、target 之類）→ 改狀態（**必須處理**）
- 🟡 人類 preset 種子字串 → 語意耦合（**處理，但優先級低**）
- ⚪ 只影響散文 / prompt / log / report（**不要動**）

產出寫成 `docs/testbed/PROSE_REGEX_INVENTORY.md`，單獨 commit。

> 已知的起點（不是全部，不要只查這些）：`core/physical-canon.ts` 的 `DURABLE_MUTATION`（含負向後顧 `(?<![已既])簽` 與 ±32 字窗）與 `PHYSICAL_REFERENCE`；`tick.ts` 相位 7.78 換鎖用 `妒|怨|恨|仇` 比對 want desc；`tick.ts` 相位 2.95/2.96 的 bond 底圖懶種與私處鑰匙懶種；廟／戲台／食肆由場景名推斷；`nightSceneKind` 相關謂詞。

### Phase 1 — 授權路徑（**最高優先**）

已知站點：日終換鎖（`tick.ts` 相位 7.78）目前用 `妒|怨|恨|仇` 正則比對 want 的 `desc` 來決定 `revokeAccess`。Phase 0 若找到其他授權決策也走正則，一併納入。

要做的：

- 在 `Want` 型別上新增結構化欄位承載這個語意（例如敵意標記與其對象）。**欄位怎麼設計你自己判斷**，但必須滿足：由產生 want 的 LLM 座席在建立時就宣告（genesis / ripple / aftermath / regenerate / rewrite 都要涵蓋到），而不是事後從 desc 推。
- 注意 `want-rewrite.ts` 的既有鐵律：**LLM 改寫只動 `desc`，weight/sat/resistance 不動**。新欄位屬於哪一邊要想清楚並寫進註解——它是語意（character-owned）還是機制（engine-owned）？我的建議是機制側，改寫不得動它，只能由專門的座席更新。
- STRICT 模式：只認結構化欄位。非 STRICT：維持正則行為（byte-identical）。
- shadow monitor：STRICT 下仍跑舊正則，記錄「正則說有敵意但結構化欄位沒標」與反向的 divergence。

**這個 phase 單獨提交，訊息裡寫清楚它是為了讓撤銷決策脫離散文推斷。** 它是整份工作裡對提案最重要的一塊。

### Phase 2 — 物件守恆（`physical-canon.ts`）

- STRICT：`commitBeatPhysics` 只讀 `objectEffects`，散文完全不解析，**不 throw、不觸發 replan**。
- 非 STRICT：現行行為完全不變。
- shadow monitor：如 §2.2。divergence 要能逐拍匯出。
- 同時檢查 `scene-loop.ts` 的三改／`[跳拍]` 路徑：STRICT 下 physics 不再是 rejection 來源，確認 replan 迴圈仍正確（其他 rejection 來源如 `move` 雙通道禁令、契約配對檢查要保留）。
- `objectEffects` 在 STRICT 下應為必填還是可選？**傾向可選但缺席即代表「沒有物理變動」**，不要強制填寫（強制會製造大量 replan，等於把閘門搬個位置而已）。如果你判斷不同，寫進報告。

### Phase 3 — 場景語意（`SceneSpec` / preset）

廟、戲台、食肆等場景能力目前由場景名／`sceneId` 正則推斷。改成 preset 宣告式的 capability tag（欄位名依現有型別慣例）。舊 preset 要能無痛升級——加一層 fallback：宣告缺席時才走舊正則推斷，並在 STRICT 下把這個 fallback 關掉且記一筆 warning。

Phase 0 的 🟡 類（bond 底圖懶種、私處鑰匙懶種等）一併在此處理成宣告式。

### Phase 4 — 文件（**這是交付物的一部分，不是收尾裝飾**）

- `docs/testbed/MECHANISM_AUDIT.md`：更新威脅 #2 / #3 的狀態，寫清楚現在是什麼、還剩什麼。**不要宣稱已完全解決**，如實寫。
- `docs/testbed/TESTBED_BOUNDARY.md`：把 §2.2 的不變量改變（「狀態僅由結構化指令定義，散文是一個 rendering」）明文寫進去，並把新 flag 接進 research-minimal profile 的定義。
- `docs/narrative/ENGINE_CORE.md`：若機制歸屬有變動，更新。
- 新增 flag 到既有的 flag 總表。

---

## 5. 最終報告要回答的問題

做完之後在報告裡回答，不要只說「完成了」：

1. Phase 0 一共找到幾個站點，四類各幾個？哪些是我上面沒點名、你自己找到的？
2. 有沒有哪個站點**找不到結構化欄位可以取代**？那是真正的設計缺口，說清楚缺什麼。
3. flag off 的 byte-identical 是用哪個測試驗的？貼出實際跑的指令與結果。
4. STRICT 模式下，跑一段既有的 run，prose/state divergence rate 大概是多少？（這個數字本身就是研究發現，會直接進論文。）
5. STRICT 模式下 `[跳拍]` 的發生率相對 baseline 變化多少？
6. 三個不可協商決策裡，有沒有哪一條你執行時覺得是錯的？為什麼？

## 6. 明確不要做的事

- 不要順手清 `MECHANISM_AUDIT.md` 點名的死碼（`actor-fatigue`、`box-office`、`spatial-routing`）。那是另一個決定，會影響論文的 ablation 章節，不在本任務範圍。
- 不要重構 want 的動力學常數。
- 不要碰鏈上線（`contracts/`、`packages/sdk`、`packages/runner`）除非 Phase 0 在那裡找到 🔴 類站點——找到就只記錄，不改。
- 不要為了讓測試通過而放寬既有的守恆稽核。
