# 敘事方法 QA 清單

> 重新部署合約後，驗證「敘事方法產品化」整套（章回三態 / 創世序章 / 關係戲 / 養關係 / 厚度召回 / 自檢）。
> 設計與待議項見 [NARRATIVE_AGENTS.md §8b](./NARRATIVE_AGENTS.md)。分支 `claude/pear-garden-narrative-pov-5uges4`。

## 合約端先說明（重要）

**這套敘事功能零合約改動** —— 只用既有 `commitment::commit`（錨章回）＋讀取（`CommitmentCreated` / `RelationshipSeeded` 事件）＋ `director::relationship_seed`（養關係，合約早就有）。所以：

- 不需要為敘事功能改 Move、改 SDK codegen。`.move` 沒有改動，ABI 不變。
- 「持有者黏性 / 行使即退場」那些待議機制，合約面**早就有**（`resource.move` 的 `retire`/`instantiate`/`release_holder`），缺的是 TS 接線；而且全部 **flag-gated 預設關閉**（`TICK_DIRECTOR_RESOURCES` / `TICK_EVENT_SPINE`），預設一輪 tick 不會踏進，**runner 不會對新部署的合約報錯**。
- 重部署只是部署衛生：fresh deploy → 跑 codegen 刷新 package/object id → 跑 QA。

---

## 0. 部署前

- [ ] `pnpm install && pnpm -r build`（或 `pnpm -r type-check`）—— **第一道關，先確認型別全綠**（本開發容器無 `node_modules`，無法 build，必須在此補跑）
- [ ] `sui move test`（合約綠）＋ move-auditor gate
- [ ] 重新部署合約 → 跑 codegen → 確認 `shared/src/contract-ids.ts` 的 sagaId / storytellerCapId / packageId 已更新
- [ ] `.env.local` 的 `POE_API_KEY` / `OPENAI_API_KEY` / `SUI_ADMIN_PRIVATE_KEY` / MemWal 憑證齊（無 MemWal 則厚度召回為 no-op）

## 1. 種子 + 創世序章（自治）

- [ ] 鑄一個新角色 → 跑 `reconcileCharacterAction`（或走 redeem after() 流程）
- [ ] `steps` 依序出現 `memory: ok / seeded N` 後接 `prologue: ok / anchored N chars`
- [ ] 鏈上該角色 subject 有**第一篇章回**，內容是「入世序章」：具體當下場面、**無承上**、帶童年/家世/初戀等**非工作**厚度、結尾輕帶將至引線（不爭、不輸贏）
- [ ] 角色**不會**在正文自報「俊扮無鬚 / 坤生 / 乾生」（行當卡是隱形守門，不該被唸出來）
- [ ] reconcile `steps` 也出現 `skills: ok / seeded 6`（每角色六項行當技能上鏈）
- [ ] **冪等**：再跑一次 reconcile → `prologue: skip（N existing）`，不重鑄（skills 是 upsert，會重寫同值，正常）

### 1b. 行當技能 → 出牌加權（唱做）

- [ ] 創世卡司／reconcile 後，鏈上每角色有六項 saga 技能（唱腔/身段/台緣/武場/文墨/交際），值符合行當（連翹武場+身段高、蘇映雪唱腔+台緣高、方競西文墨高、衣箱/記者表演技能低）
- [ ] 事件發牌時，武行當較常拿到「攻」（武打＝武場+身段加權）、文行當較常拿到「敘」（唱念＝交際+唱腔加權）——台上比拼看得出唱做本工，而非均勻亂發

## 2. 自檢（換新行當/新角色不該失效）

- [ ] 一篇含「小生 + 鬍鬚/髯口」的稿 → 被攔截並改寫；「老生 + 三髯」放行
- [ ] 「不掛髯口 / 連半根鬍鬚都沒有」這類**否定**提及 → 放行（不誤殺）
- [ ] 女小生被他人稱「他」→ 放行；女角被誤稱「師兄/師哥」→ 攔截（應師姐/師妹）
- [ ] 隨手加一個**全新行當**（例如「賬房」）→ 寬容放行，不誤殺
- [ ] 簡體段落出庫前被正規化成繁體（簡→繁轉換層）

## 3. 一個 tick（自治，真跑非 dry-run）

> dry-run 不上鏈、不寫記憶；以下要真跑才驗得到。建議讓角色 survival 有貧富差（部分角色給訂閱/拉開記憶年齡成本），才會觸發 GIVE → 才會養關係。

- [ ] log 出現 `②⁺ 養關係：N 對因接濟加深公開羈絆`；console 有 `[tick-loop] bond strengthen: seeded=N`
- [ ] log 出現 `④· 關係戲：A ⇄ B（tone・牽連 N）✓ (M 字)`
- [ ] 連跑兩 tick、同一對 → 第二次出現 `④· 關係戲略過（冷卻…同對連 tick）`
- [ ] 關係戲章回是**兩人、潛台詞、不分輸贏、結尾輕移一寸**（共做一件瑣事，不直白點破）
- [ ] 連載 POV 仍有**承上/推進/啟下**，且讀得到一點人生厚度（非全是工作）
- [ ] 同事件無新拍子的角色 → POV 略過（不重複改寫同一場景）

## 4. 關係圖會長（跨多 tick）

- [ ] 多跑幾 tick 後，常互相接濟的一對其 `RelationshipSeeded` `count` 增加（鏈上事件可查）
- [ ] `count` 較高的深化對子，會被 `pickEncounterPair` 優先選為當 tick 的關係戲

## 5. Provider 比對（可選）

- [ ] 同一 tick 各用 Poe（GLM-5.1-FW，長章免費 200 點/呼叫）與 z.ai（per-token）跑一次，比品質與點數，定 demo 用哪家

## 6. 不在本輪 QA 路徑（確認預設關閉、不會誤觸）

- [ ] `TICK_DIRECTOR_RESOURCES` / `TICK_EVENT_SPINE` 維持關閉（持有者黏性 / 退場線屬下一輪工程）
- [ ] 導演 in-loop 主動經營關係（LLM 牽線）本輪刻意未做

---

**通過標準**：第 1–4 全綠＝敘事方法在自治世界裡能自己跑出創世序章、連載 POV、關係戲，且關係圖會隨角色行為成長；自檢對新行當/新角色不失效。
