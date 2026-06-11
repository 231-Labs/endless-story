# Endless Story · AGENTS.md

> 給下一個 session 的接班備忘（**唯一維護檔**）。Repo: [231-Labs/endless-story](https://github.com/231-Labs/endless-story)
> 比賽：Sui Overflow 2026 · Walrus 賽道，提交 deadline **2026-06-21**
> 舊 repo `/Users/harperdelaviga/Endless-Story`（**只讀對照，不要動**）

---

## 一句話

「住在 Walrus 上的梨園 — 角色不是 JPG、是活著的記憶資產」。
用 MemWal SDK 把角色記憶、章回、衍生作品永久上鏈 Walrus、Sui NFT 持有 IP。

---

## 開發

```bash
cd /Users/harperdelaviga/endless-story-new
nvm use                                       # .nvmrc 鎖 23.7.0 (codegen 需 ≥ 20.11)
pnpm --filter @endless-story/web dev          # http://localhost:3000
pnpm -r type-check                            # 全 repo 綠燈確認
```

**Preview tools 可用** — `.claude/launch.json` 配好 `web` server，`preview_start("web")` 即可。

---

## 敘事引擎方向（唯一真相）

> **[docs/NARRATIVE_AGENTS.md](./docs/NARRATIVE_AGENTS.md)** = 敘事層唯一設計文件。
> 兩個自治 agent（Director 導演 / Character 角色）、目標 C 級全自治、chain-first +
> MemWal-native 重建（不抄舊實作）。所有敘事開發參照它;§8 有缺口 + 建置順序(N1-N6)。
>
> **[docs/CHARACTER_ECONOMY.md](./docs/CHARACTER_ECONOMY.md)** = 角色經濟 life cycle 設計
> （NARRATIVE_AGENTS §7 經濟層的展開）。dailyCost / saga 混合發薪 / 真實持幣+角色間轉帳 /
> 雙軌死亡(經濟+隱藏年齡 hazard) / 世代交替。機制已用純模擬 `packages/economy` 學術驗證通過
> (12/12 測試、6 假說成立)；產品化 Part D 為 gate-after。分支 `feat/character-economy`。
>
> **[docs/WALRUS_ASSETS.md](./docs/WALRUS_ASSETS.md)** = Walrus 資產管理 + 續費(設計與規格)。
> 後台統一管 hero 影片/角色圖/章回等長存資產的上傳·上下架·到期追蹤·續租。決策鎖定:通用面板
> ＋ Hybrid 續費。自架 publisher+aggregator+relayer 上 Contabo(Tier A/B 可現在先上,前端定案只動
> 一個 env＋一行 CORS)。relayer 加 asset service(零依賴,Walrus 寫入 shell out `walrus` CLI)。**待動工。**

---

## 目前進度（2026-06-10）

**一句話狀態**：合約 / runner / web 已經不是 Phase 2 placeholder；目前進入「demo 穩定化 + 部署 + 影片素材」階段。

### 已經落地

- **合約 1.6 / 1.7 已有**：`event.move`、`commitment.move` 在 repo 內，runner 章回 / 公報 / drama beat 都走 Walrus + `commitment::commit` anchor。
- **Runner 自治 tick v1 已接通**：`runTickLoopAction` 順序為 `PLAN → MOVE → DRAMA → SOCIAL → ACT → POV → SLEEP → GAZETTE`。
- **角色認知 v1 已接通**：
  - mint 後 `redeemVoucher → seedGenesisMemoryAction` 會 seed self genesis、主觀 relationship memories、最多 3 位既有角色的 reciprocal observation。
  - 每輪 tick 建 saga roster snapshot：`id/name/role/gender/age/brief/currentScene`。
  - `role` 來源：chain `role:*` tag → recruitment specialty → chain profile description 行當詞 fallback → `—`。
  - roster 會注入 `PLAN / MOVE / SOCIAL / ACT / POV`，讓角色知道誰是花旦、小生、同場人物。
  - relationship hint 是雙源：先讀角色自己的 MemWal `relationship` memory，再合併 on-chain `RelationshipSeeded`（標明「自己的人物印象」vs「導演公開牽起」）。
- **輕量 SOCIAL phase 已接通**：
  - 只跑不在 open event 的角色。
  - 輸出 `observe | talk | idle`；`talk` 目標必須同 scene。
  - 成功互動會寫 speaker observation、target `[聽見：角色名]` observation、必要時寫 speaker relationship memory，並更新 `scene-lines` 供前端手卷顯示。
  - 已修正：MOVE 後本輪 in-memory scene snapshot 會更新，避免 SOCIAL 用移動前位置造成跨 scene 對話。
- **Runner 穩定化第一輪已做**：
  - `MEMWAL_RECALL_CONCURRENCY` code default 改成 1（demo 優先穩定）。
  - MemWal recall 遇到 429 會 retry + jitter backoff，並把 memory warning 帶回 tick result。
  - tick loop 有 per-tick memory context，MOVE / SOCIAL / ACT / POV 共用 plan / relationship / recent recall，降低同輪重複 SEAL decrypt。
  - Admin SchedulerPanel 會顯示 DRAMA / SOCIAL / memory degraded，方便前端直接驗 runner 是否工作；MOVE/SOCIAL 即使因 open event 忙碌而跳過也會回 idle/stay reason，不再看起來像沒跑。
  - PLAN / POV prompt 已加「舞台中心不是管理權力」防線；非班主角色的舊 plan 若含「老板/當家/掌事」等身份漂移會被丟棄，生成後若仍出現管理權力漂移會回退成行當目標。
- **Drama 整合已驗證方向正確**：用孟雲屏 / 顧驚鴻 / 柳生春 dry-run 時，`與孟雲屏搭戲` 張力落在顧 / 柳身上，孟雲屏本人不會被當作搶搭檔位的人。
- **MemWal 三因子 metadata / 自架 relayer 方向已開**：
  - `packages/relayer` 已有自架 relayer skeleton。
  - MemWal remember 會把 kind / importance / day metadata 送進 relayer，支援真三因子召回。
  - 人物頁 memory count 已能走 relayer `/api/count`，不再只是 placeholder。
- **角色本色 persona anchor 已接上**：
  - `redeemVoucher` 成功後會用 `after()` 背景跑 `generatePersonaAction`，從公開 profile 蒸餾「軸/腔/界」，上傳 Walrus 並用 `commitment::commit` anchor；失敗不擋 mint。
  - `/dossier` 的 persona 讀取已改成 chain-first：Sui object id 讀 `personaSubject(characterId)` 的最新 commitment，沒有才隱藏本色區；demo slug 仍 fallback mock。
- **角色經濟驗證已完成**：`packages/economy` 純模擬 12/12 綠，角色頁 survival 已接 off-chain shadow；產品化 tick settle / give phase 還沒進主 loop。
- **接濟「金流合理性」已驗證（2026-06-10，Part D D8 純決策核心）**：擔心 LLM 亂給錢→金流變假。處理原則＝**錢不由 LLM 決定**：新增 `src/aid.ts` `decideAid`（需求接地的純決策：自己快死/沒餘額就不給；沒人真的缺就不給＝anti-「太假」守衛；有缺才救最需要的人，金額 = min(自身 surplus, 補到 target runway)，仇家不資助）＋ `decideAccept`（受方可拒：仇家拒、高傲者沒到瀕死也拒）。LLM 層（runner，待接）只供「要不要出手＋措辭＋關係 tone」，且被這些守衛 + `applyTransfer`（不可負/不可給死人/仇家）夾死。`test/aid.test.ts` 8 綠，含 living-world 整合：**無接濟 150 日死 3/4、開接濟死 0/4（413 筆轉帳）、逐日守恆**——透過決策核心重現 H4，非寫死 `runPatronage`。`pnpm --filter @endless-story/economy test` 35 綠、type-check 綠。（註：此 `decideAid` 後改為**確定性 fallback/baseline**，正式 give/no-give 改交 LLM——見下條。）
- **接濟拍板改「LLM 判斷版」（2026-06-10）**：owner 要的是**角色自己判斷要不要給，不要寫死規則**。故 runner `character-agent/aid.ts` `decideAidAction`（鏡像 `decideSocialAction`：cheap LLM＋prompt 給足經濟＋關係信號）負責 give/no-give/給誰/給多少。**確定性層只剩硬守衛**（`parse.ts` `parseAid`/`clampAidAmount`：收款人須在 peer 名單、金額 clamp 到 ≤餘額＝no-overdraft，對齊 `applyTransfer`）——不再決定該不該給。eval harness `__eval__/aid-{scenarios,eval}.ts`（6 情境＝3 hard 必過＋3 judgment 觀察；`--print` 出 prompt、有 key 對真 cheap 模型自動評分）。`test/character-agent-aid.test.ts` 7 綠（守衛層；`pnpm --filter @endless-story/runner test` 34 綠）。**已用 Claude 自當模型把 6 情境跑過：hard 3/3、judgment 3 例皆有理**（富裕救瀕死盟友、無人缺不散財、自己拮据只小額還情、瀕死仇家講理拒、雙缺先救命懸一線者、想要非急需不傾囊）；**待補 Poe key 對 cheap-tier 實跑**（這容器無金鑰＋出站受限）。runner type-check 在本容器因未 build sdk 報 `../sdk/*` 既有錯，與本次新檔無關。
- **GIVE phase 已接進 tick-loop（2026-06-11，分支 `claude/give-phase-aid`）**：`web/lib/actions/tick-phases/give.ts` `runGivePhase`（鏡像 `runSocialPhase`，排在 SOCIAL 之後、ACT 之前 = 2.9 GIVE）。同場、不在 open event、survival level healthy/stable 的角色為 giver；同場有 survival low/critical 或 vitality strained/failing 的人才觸發；家底數字餵自 `Character.survival`（off-chain shadow），relation 由 relationship hints 粗分 ally/neutral/rival。判斷走 `characterAgent.decideAidAction`（LLM）。**金流的「移動」刻意 deferred**：目前無鏈上 balance（D1）也無持久化 settle shadow（D5），故只落 narrative＋relationship-tone（giver 寫 relationship memory、受方寫 `[受贈]` observation、scene line），`gifts` 是 intent、`deferred:true`；UI 在 SchedulerPanel result-views 有「接濟」區。GLM-5.1-FW 選定為 cheap-tier 決策模型（live eval 較自洽）。web type-check 我方新檔零錯（只剩既有 `../sdk/*` 未 build 錯），runner test 36 綠。**這容器無 LLM key＋出站擋 api.poe.com，GIVE 端到端要在有 key 環境用 `/api/tick` dry-run 驗。**
- **D5 settle shadow 引擎已起手（2026-06-11，同分支）**：校正——saga 金庫**有錢**(mint/抽卡費 `recruit.move:301`→`saga::deposit_to_treasury`、dream 費同)，不是空的；現有單角色 `lazySettle` 班中俸=0 純粹是因為它**不讀金庫**(只算自己訂閱分潤，demo 訂閱=0)。新增 `packages/economy/src/saga-settle.ts` `settleSagaTo`(cohort 版 lazySettle)：以**鏈上 `saga::treasury_balance` 當發薪池種子**，跑 `settleDay` 逐日發 `行當保底+perf`、扣 cost、更新 vitality、套用 GIVE transfers;池子被薪餉抽乾、新 mint 費再補。**零訂閱也有班中俸**(從金庫發保底)、金庫空才=0。stateful：持久化 per-char balance/vitality/streak + 池子(`SagaEconState`，JSON-safe)。`test/saga-settle.test.ts` 5 綠(`pnpm --filter @endless-story/economy test` 40 綠、type-check 綠)。**(a) web adapter 已接（2026-06-11）**：`lib/economy/saga-economy.ts` `settleSagaCohort`（讀鏈 cohort + `Saga.treasury` → `settleSagaTo` → 每角色 snapshot，idempotent per (saga,today)）+ `snapshotToSurvival`；`character-read.ts` 的 `fetchOnChainCharacters`（batch overlay）與 `fetchOnChainCharacter`（單角色用 cohort overlay）改成優先用 cohort 薪餉、失敗退回 lazySettle。**班中俸現在從金庫發保底**（需真 saga 才看得到，這容器無鏈）。store 暫用 process-local（TODO relayer KV）。web type-check 我方檔零錯。**(c) 已做（2026-06-11）— 金流真的會動了**：tick-loop 加 **2.95 SETTLE phase**（`tick-phases/settle.ts` `runSettlePhase`，排在 GIVE 之後）：讀鏈上 `Saga.treasury` → `settleSagaCohort` 把經濟影子推到今日（金庫發保底→扣 cost→vitality→死亡）+ 把 GIVE 的 **accepted** gifts 轉成 `TransferRequest[]` 真的扣加 persisted 餘額。難點解法：tick 比經濟日快、但 gift 每 tick 發生 → 核心 `settleSagaTo`/`PersistedCharEcon` 加 `lastSalaryMicro` 攜帶，**日結算 idempotent per day、轉帳每 tick 套用**（0 日的 transfer-only call 仍顯示穩定班中俸）。`settleSagaCohort` 帶 `transfers` 時繞過 (saga,today) cache 強制重結算；page 讀(無 transfers)維持 idempotent。`TickLoopResult.settle`（day/金庫/發薪/轉帳數/死亡）+ SchedulerPanel 顯示。dryRun 不動影子。`saga-settle.test.ts` 6 綠（含 same-day transfer-only）、economy 41 綠、web type-check 我方檔零錯。store 仍 process-local（demo 拓撲 world-loop→web `/api/tick` 同進程可共享；跨進程要 relayer KV）。**剩**：ASK 接進 tick-loop（needy 開口→掛上 giver 候選）；relayer KV；accept/refuse 升 pride/LLM；D1 上鏈把影子換成鏈上權威。
- **(d) 已做（2026-06-11）**：金錢 agent 操作補齊成 4 動作＝**給(`decideAidAction`)/收拒(GIVE phase 仇家回絕)/要(`decideAskAction`)/回應(=decideAid)**。新增 runner `ask-prompt.ts`(純)＋`ask.ts`(`decideAskAction`，LLM judge 可注入，鏡像 aid)＋`parseAsk`＋`finalizeAsk`(硬守衛：target 須真實非自己、amount>0)；`test/character-agent-ask.test.ts` 4 綠(runner test 40 綠)。GIVE phase 加受方 accept/refuse v1：用粗 relation，仇家回絕→寫「傷和氣」relationship memory(兩邊)＋scene line，`TickGiveResult.gifts[].refused`。**仍待**：(c) tick-loop SETTLE phase 每 tick 跑 `settleSagaCohort` + 把 GIVE **accepted** gifts 餵 `transfers`（金流真的扣加並持久化）；ASK 接進 tick-loop(needy 角色開口→把自己掛上 giver 候選)；relayer KV 持久化；受方 accept/refuse 升 LLM/pride 版。
- 經濟 Part D 仍待：D1 `economy.move`（`transfer_between_characters`/`owner_fund_character`/settle，需 sui 環境 build+test）＋ D5 settle shadow 持久化；兩者任一落地後，把 `give.ts` 的 deferred gifts 接成真正扣加 balance（giver→recipient）。受方 accept/refuse（§5.2）目前 v1 未做（假設接受），待補。
- **金流／高齡死亡已解耦成獨立純 step（2026-06-10）**：先前「角色間轉帳」只埋在 driver `runPatronage` 的貪婪策略裡（驗過 H4 但沒抽出來），「年齡死／vitality」也內聯在 `settleDay`。現各自抽成單一真理純函式：`src/transfer.ts`（`applyTransfer`/`applyTransfers`，含 memo_kind＋self/dead/overdraft 守衛，守恆 net-0）＋ `src/vitality.ts`（`stepVitality`，雙軌死亡）。`settleDay`、web `lazySettle` 影子、driver patronage 全改呼叫它們（不重寫）。新增 `test/transfer.test.ts`＋`test/vitality.test.ts`（含 settleDay parity 守衛），`pnpm --filter @endless-story/economy test` 27 綠、type-check 綠、`driver/report.ts` 全 PASS 且 H4(rescues=50/death on0 off3)＋逐日守恆 byte-identical（純解耦、零行為變更）。之後 Part D 的 `transfer_between_characters` / `economy.move` settle / runner `decideAid` 直接移植這兩支。
- **部署已上自架 VPS（2026-06-10）**：web 已部署在自己的 VPS，不再依賴 Vercel（也就沒有 300s maxDuration 上限）；relayer + world-loop 部署細節仍見 `docs/DEPLOYMENT.md`（文內 Vercel 段落視為歷史方案）。
- **Tick loop 已模組化（2026-06-10）**：`web/lib/actions/tick-loop-internal.ts` 已拆成 `lib/actions/tick-phases/{support,chain,move,social,act}.ts`（共用 helper／鏈上送簽／三個 phase 各一檔），`tick-loop.ts` 只剩 orchestrator。行為不變，純搬家。
- **Runner parse 防線已可測（2026-06-10）**：character-agent 的 LLM 輸出解析＋身份漂移防線抽到 `runner/src/services/character-agent/parse.ts`（純函數）；新增 `pnpm --filter @endless-story/runner test`（node --test fixture 測試：director capability 驗證 + move/act/social/plan 解析，27 綠）。自主跑 loop 前壞輸出會退化成 stay/idle/fallback plan，不會 throw。
- **角色所有權已改為鏈上強制（2026-06-10，⚠️ 待本地 Move 驗證）**：`mint_character_internal` 現在在合約內把 `OwnerCap` `public_transfer` 給 `owner_recipient`（redeem 路徑＝voucher.payer），只回傳 `(ID, ControlCap)`；`mint_genesis_character` / `mint_collectible_character` / `redeem_voucher_to_character` 只回 ControlCap。storyteller PTB 從此碰不到 OwnerCap——「持有 IP」變成鏈上結構性保證。TS 呼叫端（redeem-voucher / create-founding-cast / seed-cast / test-recruit-e2e）已同步，type-check 綠。**遠端容器無 sui CLI：redeploy 前必跑 `sui move build && sui move test`。**
- **ENDLESS decimals 已確認 = 6（2026-06-10）**：`currency.move` `new_currency_with_otw(witness, 6, …)`，前端全鏈路按 6（faucet 10e6=10、dream 50e6=50）。repo 內所有 1e9/9-decimals 都是 WAL/MIST（gas），與 ENDLESS 無關。常數已抽單一來源 `shared/src/currency.ts`（`ENDLESS_DECIMALS`），web 五處改 import。若 explorer 顯示非 6＝舊部署，redeploy 即對齊。
- **分潤現況（認知校正，2026-06-10）**：分潤**不是沒規劃**——完整設計在 `docs/CHARACTER_ECONOMY.md`（§1 金流、§3 混合發薪、Part D D1 `add_owner_revenue`），且**被刻意 gate**（「Part D 為 gate-after，須 owner 認可後另起」）。未實作的上游卡點：`subscribe.move` 目前不收費（註明 Phase 1.6），沒有金流自然分無可分；`RevenueConfig` 三段 bps 與 `OwnerCap.cumulative_revenue` 欄位都已就位等接。**2026-06-10 拍板：本輪不建分潤 primitive**，留待有 sui 工具鏈的環境照 Part D 做（付費訂閱 → 按 RevenueConfig 拆 → owner 份額累進 + 可 claim）。
- **記憶解密已改 cap-enforced（2026-06-10，⚠️ 待錢包環境實測）**：修掉「不連錢包（或任意 `?as=`）就能看任意角色解密記憶」的洞。舊路徑是 server 拿 admin ControlCap 當萬能解密 oracle、只用可竄改的 `?as=` 字串比對 owner（fallback 還是 OWNER_A）。現在對齊合約 SEAL 模型（解密＝ControlCap 持有者 saga server / OwnerCap 持有者 owner 兩種人）：server 新增 `/api/memories/encrypted` 只回**密文**（`MemWalManual.recallEncrypted`，不動 cap）；owner 在瀏覽器用真錢包＋鏈上查到的 OwnerCap 走 `decryptWithOwnerCap` → `seal_approve_owner` 解密（一次簽名、client 端三因子重排）。`lib/api/memories.ts` 的 server 解密分支已刪，mock fallback 保留（僅 demo fixtures）。tag 解析/評分抽到 client-safe `lib/chain/memory-tags.ts`；`MemoriesTab` 改吃 `isOwner` prop。runner / tick 的 saga ControlCap recall 路徑不變。**遠端容器無錢包：需在有錢包環境實點一輪（連錢包→解密→簽名→出記憶）。**
- **首頁影片素材 override 已接**：`scenesApi.listTodayClips` 會優先讀 `DEMO_CLIPS_URL`、`DEMO_CLIPS_FILE`、`public/demo-clips.json`，再 fallback 現有 mock clips；格式見 `packages/web/public/demo-clips.example.json`。
- **短 TTL chain-read cache 已接**：公開 Saga / World time / Scene reads 會走 process-local read-through cache，預設 10–15s，`CHAIN_READ_CACHE_TTL_MS=0` 可關閉；不碰 MemWal / 私密內容。

### 已驗證 / 已知限制

- `pnpm --filter @endless-story/runner type-check` 綠（2026-06-03）。
- `pnpm --filter @endless-story/web type-check` 綠（2026-06-03）。
- `pnpm --filter @endless-story/shared type-check` / `@endless-story/cli type-check` 綠（2026-06-03）。
- `POST /api/tick` dry-run 已在本地 dev server 跑通：
  - `maxCharacters=3`：PLAN / DRAMA / POV 成功，MOVE/SOCIAL 回 open-event busy idle reason，`memoryWarnings=[]`。
  - `maxCharacters=1`（孟雲屏）：role description fallback + 身份漂移防線生效，不再輸出「孟老板/當家」；`recalledCount=4`。
- `world-loop` headless dry-run 已跑通（2026-06-03）：
  `pnpm --filter @endless-story/cli run world-loop -- --max=1 --dry-run --max-characters=1 --no-sleep --no-gazette`
  → `第1日·日午 · 規劃1 · 移動0 · 張力2 · 互動0 · 出牌0 · 收尾0 · 章回1 · 睡0 · 公報—`。
- `pnpm --filter @endless-story/web build` 綠（2026-06-03）。已把 `/` 與 `/admin/director` 標成 dynamic，避免 Vercel build-time 去讀 testnet 並把空/舊資料烤成靜態頁。
- `WORLD_LOOP_URL` 可填 web base URL 或完整 `/api/tick`；已用 `WORLD_LOOP_URL=http://localhost:3002/api/tick` 跑通 headless dry-run。
- `packages/cli` 已有 `start` script 指向 `world-loop`；Zeabur/Railway service root 設 `packages/cli` 後可直接用 `pnpm start`。
- `world-loop --max=N` 有任何 HTTP / non-JSON / `ok:false` 失敗會 exit 1，可當部署 smoke gate；已用關閉的 `127.0.0.1:9` 驗過 failure exit 1，再用 3002 dev server 驗過 success exit 0。
- `world-loop` 支援 `RUNNER_CONTROL_URL=https://<relayer>/control`（或 fallback `MEMWAL_SERVER_URL/control`）；每輪 tick 前若讀到 `{paused:true}` 會跳過本輪，控制端暫時不可用時只 warning 並照跑，避免 relayer 抖動把世界停死。已驗 paused smoke：
  - `RUNNER_CONTROL_URL='data:application/json,%7B%22paused%22%3Atrue%7D'` + 關閉的 `WORLD_LOOP_URL` → 不打 `/api/tick`，exit 0，JSON `records[0].skipped=true`。
  - `MEMWAL_SERVER_URL=http://127.0.0.1:8788` fallback → 讀 `http://127.0.0.1:8788/control`，同樣 skipped/exit 0。
- `/admin` 的 Runner 開關已不是 local state：它會透過 server action 讀/寫 `RUNNER_CONTROL_URL`（fallback `MEMWAL_SERVER_URL/control`），控制 relayer `/control` 的 paused flag。
- `world-loop` 支援 `--character-ids=<comma-separated ids>`，可精準跑 demo cast 而不是取前 N 個。已用孟/顧/柳 targeted dry-run 跑通（187.8s，仍低於 `/api/tick` 300s maxDuration）：
  - 孟雲屏 `0x1dff99a3adf385874ae06066a1064a308d9d32907b35ef2ae63023ef9776a349`
  - 顧驚鴻 `0xa6832662d55a02c09d556c41d4d8bc44c17f0fb3e6338f70c332f63458cdafc7`
  - 柳生春 `0xc162a7e009a4d63ccf89c7773ea5fc0e3516eca05a536e4d40a042c9883509f6`
- `world-loop` 支援 `--no-pov`，可快速檢查 DRAMA / SOCIAL / 角色定位，不用每次等章回 LLM。已用孟/顧/柳 targeted dry-run 跑過 fast smoke（62.0s）：`規劃3 · 張力2 · 章回0`，`memoryWarnings=[]`。
  - Fast smoke 顯示 `partnership:孟雲屏` 仍只落在顧/柳：「與孟雲屏搭戲」。
  - 另有通用資源 `頭牌名額` 會讓孟/顧/柳都進張力；這是 spotlight/head-slot 資源設計，不是孟雲屏把自己當小生搶搭檔。
  - `/admin/director` 的自治 tick 面板已接「含 POV 章回」checkbox；關掉後等同 `pov=false`，可快速看 DRAMA/SOCIAL。面板也有上限、角色 IDs 和「孟/顧/柳」快捷填入，等同 CLI `--character-ids=<孟>,<顧>,<柳> --max-characters=3`。
- `world-loop` 支援 `--json-out=/path/report.json`，會保存完整 tick result / HTTP status / 耗時。已用 `/private/tmp/endless-story-meng-dryrun.json` 驗過：`tickCount=1, failures=0, chapters=1`。
- 注意：dry-run 不寫 memory、scene-lines 或鏈上 anchor；它只能驗本輪 decision / prompt / role routing，不能驗「第二輪 POV 召回第一輪 SOCIAL memory」。這個 acceptance 要在補 gas、redeploy/bootstrap 後用真跑或測試專用記憶層驗。
- repo-wide `pnpm -r type-check` 可能因未安裝 `packages/economy` 的 local deps / `tsc` 而失敗；不要把它誤判成 runner/web 改動失敗。
- 連續多輪 dry-run 會打到 MemWal / SEAL `fetchKeys` 429。自架 MemWal relayer 可改善 indexing/recall 壓力，但 SEAL key server 429 是另一層；demo 前先用 `MEMWAL_RECALL_CONCURRENCY=1`、降低 recall limit、做 per-tick recall cache。
- 目前 testnet 部署（`contract-ids.ts` last written 2026-06-01）與最新 `event.move` / generated SDK 不完全一致；`pnpm --filter @endless-story/cli run seed-cast -- --env testnet --tag-existing` 會在 `new_card_template` 路徑遇到 `FunctionNotFound`。重新 deploy/bootstrap 後再跑此命令補既有 cast role tags。
- `deploy-preflight` 已新增（2026-06-03）：`pnpm --filter @endless-story/cli run deploy-preflight -- --env testnet --json-out=/private/tmp/endless-story-deploy-preflight.json` 會檢查 active-env、admin signer、gas、Move build，並保存 JSON readiness report；它不 publish、不改 `contract-ids.ts`。
  - `/admin/deploy` 也已接 `0 preflight` 按鈕，走同一個 CLI script；失敗時會把 stdout/stderr 留在頁面輸出區。
  - `/admin/deploy` 環境區會直接顯示 `SUI_ADMIN_PRIVATE_KEY` 解出的 `SUI_ADMIN_SIGNER` 與 faucet link；不要再看舊的 `~/.endless-wuxia/keypair.json`。
  - `/admin/deploy` Runtime 連線區會顯示 relayer `/health`、runner `/control`、首頁 demo clips override、短 TTL chain-read cache 狀態；未設定會明確顯示 fallback。
  - `/admin/deploy` 的 `① deploy` 會用 `--gas-budget 2000000000 --force-republish`，和 preflight 2.5 SUI 建議相容。
  - 目前 preflight 前置檢查：Sui active-env=testnet，`SUI_ADMIN_PRIVATE_KEY` signer 與 active-address 同為 `0xb1fe42b96faf2722b4c47b0d8027022354128f977e3d4338a94e96ce55445870`，`sui move build --dump-bytecode-as-base64` 綠。
  - 最新 preflight（2026-06-03，`--skip-build`）硬擋只剩 gas：admin wallet 有 `2.018562684 SUI`，低於 preflight 建議 `2.5 SUI`；需要去 `https://faucet.sui.io/?address=0xb1fe42b96faf2722b4c47b0d8027022354128f977e3d4338a94e96ce55445870` 補氣後再真 redeploy。

---

## 鏈上架構（2026-05-24 拍板，不可漂移）

> 合約 / SDK / runner / web 之間的**契約**。任何 session 不准踰越。

### 七條核心原則

1. **依賴單向** — `web → sdk + memwal + llm` ／ `runner → sdk + memwal + llm` ／ `cli → sdk + shared`。`sdk` 不准 import `web`；`shared` 不准 import 任何上層
2. **`sdk` 是鏈上互動唯一入口** — 不准自己 `new SuiClient()`、不准自己手寫 PTB
3. **`memwal` 是 Walrus / Seal 唯一入口** — 不准 import `@mysten/walrus` 或 `@mysten/seal`
4. **`llm` 是文字 / 圖片 AI client 唯一入口** — 不准 `fetch('https://api.poe.com/...')`、import `@anthropic-ai/sdk` / `openai`。prompt 模板 **colocate 在使用它的 service**（runner 各 service 的 `prompt.ts`；mint 流程模板在 `llm/prompts`），不集中堆回 llm。唯一既定例外：`memwal` client 端 embedding 直打 OpenAI（設計如此，不要仿效擴散）
5. **`shared/src/contract-ids.ts` 是部署輸出單一真相** — `cli` 寫入，sdk/runner/web 只讀
6. **server actions 優先** — admin 操作走 `web/src/lib/actions/`，除非要 webhook / SSE / RSS 才開 `app/api/`
7. **`(site)` / `(admin)` route group 嚴格隔離** — admin layout + middleware 獨立

### 目錄契約

```
contracts/endless_story/sources/   Move 模組
packages/
  shared/    型別 + contract-ids；零依賴
  sdk/       鏈上唯一入口（generated/ + client.ts + tx/ + read/，node 部分在 ./node 子路徑）
  memwal/    Walrus + Seal 唯一入口（含 blob put/url helper）
  llm/       Poe + Anthropic 文字 + OpenAI 圖片 + prompt 模板 + HKDF seed roll
  cli/       deploy + bootstrap + reset + test-e2e + stories preset JSONs
  runner/    Agent / scheduler (Phase 4 stub → 賽前要遷移完整版)
  web/       UI；app/(site)/* + app/(admin)/* 隔離
```

### 內容存取模型（公開 vs 私密）

> 任何**新的內容 surface** 都要先歸到下面其一，別忘了 gate。

| 內容 | 誰可讀 | 實作 |
|---|---|---|
| **公報 gazette** | **公開**（所有人） | `/feed`，無 gate |
| **POV 章回** | owner + 訂閱者 | `ChainPovSection`（client，`useCurrentAccount` + `listSubscriptionsForAddress`），body client 端 fetch |
| **反思 reflection** | owner（+ 訂閱者 TODO） | `ReflectionsSection`（client gate） |
| **夢 / 耳語 intervention** | owner | `InterventionComposerGate` / mask |

**鐵則**：
- gate 一律 **client 端** 用 `useCurrentAccount()`，**不要**信 server 的 `?as=` viewerWallet（那是 mock-era debug，會 fallback 成假錢包）。
- 私密 body **client 端才 fetch**（`/api/blob/<id>`），非讀者的 HTML payload **不得**含內文。
- 非讀者保留 **on-chain anchor** 連結（憑證可公開驗），但**隱藏 walrus 直連**（否則繞過 gate 看明文）。
- 這層是 **UX gate 不是密碼學 gate** — blob 在 Walrus 上仍明文。真正私密 = Seal（見 seal backlog memory）。

---

## 已完成

**Phase 0–2 全部就位 + Runner v1 已可 demo**（commits `f99d28f` → 最新）：

- **合約 1.1–1.5c**：currency / faucet / world / saga / scene / character / recruit，47 unit tests 綠燈，徵召 voucher mint → redeem → character + cap 完整可用
- **SDK 2.1/2.2**：codegen + tx/read wrappers（thin、type-friendly、recruit-build acceptance 過）
- **`packages/llm/`**：Poe + Anthropic 文字 + OpenAI gpt-image-2 + prompt 模板 + HKDF seed roll（smoke test 過）
- **`memwal` blob API**：putBlob / getBlobUrl（testnet/mainnet publisher endpoint）
- **Web 4 個 server actions**：moderate-prompt / preview-character / generate-portrait / redeem-voucher
- **CLI**：bootstrap.ts（4 sequential txs，從 story preset JSON 讀），test-recruit-e2e.ts，story preset 系統 (`packages/cli/scripts/stories/{spring-snow,minimal}.json`)
- **Admin UI**：
  - `/admin/deploy`：① deploy / ② bootstrap / ③ seed 職缺（story preset dropdown）
  - `/admin/recruitments`：鏈下 JSON CRUD（新增 / 編輯 / 上下架 / 刪除）
  - Faucet 設定面板（drip 量、cooldown、供給上限、暫停 — 全 admin 可調）
- **User 端**：dapp-kit 1.x 整合 + MockWalletMenu 內整合連結錢包 + ENDLESS 餘額 + 領 ENDLESS（admin 自動走 admin_mint 繞 cooldown）
- **抽卡 wizard**：RecruitmentTicket 改造完，prompt → moderate → mint voucher (user sign) → LLM preview → accept → portrait → auto-redeem (admin server action) → 跳 `/dossier?id=<chain id>`
- **`/dossier?id=X`**：偵測 Sui object id → 走 SDK chain-read（fallback mock for demo ids）
- **Devnet object-version race**：mint PTB 加自動 retry 一次
- **Runner v1**：PLAN / MOVE / DRAMA / SOCIAL / ACT / POV / SLEEP / GAZETTE 已串成一鍵 tick；SOCIAL / roster cognition / subjective relationship memory 已接。
- **Drama engine**：`packages/drama` + scarce resource tension 已接進 tick；role tag / recruitment fallback 已能讓小生競爭搭檔位。
- **Relayer / MemWal metadata**：自架 relayer skeleton + three-factor metadata + memory count API 已有。
- **Economy shadow**：角色頁 survival 已接 off-chain shadow；純模擬驗證完成。

### 設計拍板（2026-05-25）

- **抽卡模型**：1 voucher = 1 roll = 1 candidate。失敗 voucher 過期不退費，UX 用「緣寂」收尾，**不做轉投別行當**
- **共簽機制**：server action + admin keypair 自動 redeem（策展權在發布職缺階段，不在每個 redeem）
- **預覽生成**：真實 LLM（Poe → Sonnet/GLM-4.6 + OpenAI gpt-image-2）；roll 用 voucher.attribute_seed 做 HKDF 確定性（同 seed = 同角色）
- **Portrait 儲存**：Walrus testnet publisher/aggregator
- **Story preset**：world + saga + locations + scenes + recruitments 都在 `cli/scripts/stories/<id>.json`，bootstrap 跟 seed 都從 preset 讀

---

## 下一步（6/21 deadline 前）

| # | 項目 | 範圍 | 估時 |
|---|---|---|---|
| **S** | **Runner demo acceptance** | 已做 cache/backoff/default=1/UI 顯示；剩顧/柳/孟 2 tick 真跑驗證、確認第二輪 POV 召回第一輪 SOCIAL memory、檢查 SOCIAL memory 不寫未授權重設定 | 0.5–1d |
| **D** | **部署策略落地** | web 已上自架 VPS；剩 relayer + world-loop 服務化、設定 `MEMWAL_SERVER_URL`、tick secret、pause control；按 `docs/DEPLOYMENT.md` 跑 smoke | 1–2d |
| **E** | **角色經濟產品化 Part D** | web adapter / SETTLE phase / GIVE phase / 日界發薪扣 cost / vitality & death hook；若 demo 時間不夠可先保留 shadow | 2–4d |
| **I** | **Web i18n** | `next-intl` framework + 抽既有文案 + LocaleToggle + `romanize-name`（中文 → 拼音） | 2–3d |
| **V** | **Demo / Trailer 素材** | 跑 2–3 tick 產章回 + 手卷錄屏；剪 trailer；首頁 placeholder 換真內容；需要預留 LLM/影片生成時間 | 2–4d |

**順序建議**：先 S（否則 demo 不穩）→ D（部署可跑）→ V（開始攢素材）；E / I 視時間切入。不要再從舊 repo 搬大 runner，只補現在 v1 的缺口。

---

## E2E 跑通手冊（從零到 mint）

> 所有 code path 已就位。**devnet 偶爾整集群掛**（"no healthy upstream"），demo 前切 testnet 比較穩。

**0. 一次性 env 設定**（`packages/web/.env.local`）：

```bash
nvm use
sui client switch --env testnet   # 推薦；或 devnet 但要 status.sui.io 確認
sui client faucet

cat > packages/web/.env.local <<'EOF'
POE_API_KEY=...                        # https://poe.com/api_key
OPENAI_API_KEY=sk-...                  # https://platform.openai.com/api-keys
SUI_ADMIN_PRIVATE_KEY=suiprivkey1...   # 同 cli admin；export 自 sui keytool
RECRUITMENT_MOD_SECRET=<openssl rand -hex 32>

# MemWal（角色長期記憶 / recall + remember）— 缺這些時 recall→[]、remember→false，
# 敘事仍可跑，只是沒有長期記憶。需 testnet（SEAL 不在 devnet）。
MEMWAL_PRIVATE_KEY=...                  # ed25519 delegate 私鑰（dashboard 產）
MEMWAL_ACCOUNT_ID=0x...                 # MemWalAccount object id（dashboard 產）
# MEMWAL_SERVER_URL 可省 — testnet 自動用 staging relayer；自架後填 https://<relayer>
MEMWAL_RECALL_CONCURRENCY=1             # demo 建議先 1；連續 dry-run 易打到 SEAL fetchKeys 429
EOF
```

> **MemWal 取得憑證**（賽道硬需求 · 不用寫腳本）：到 **dashboard** 直接產
> delegate key + account id：
> - **testnet（我們用這個）**：https://staging.memwal.ai → relayer `https://relayer.staging.memwal.ai`
> - mainnet：https://memwal.ai → relayer `https://relayer.memwal.ai`
>
> 把產出的私鑰填 `MEMWAL_PRIVATE_KEY`、account id 填 `MEMWAL_ACCOUNT_ID`。
> relayer URL 可先不填 —`memory.ts` 依網路自動選（testnet→staging）。
> 若用自架 relayer（建議 demo 前做），填 `MEMWAL_SERVER_URL=https://<你的 relayer>`。
> 注意：自架 relayer 主要解 indexing / recall 服務壓力；SEAL key server 的 `fetchKeys`
> 429 是另一層，仍需用低 concurrency / cache / backoff 控制。
>
> **架構**：我們走 `MemWalManual`（client 端 SEAL，patch 成打我們的
> `endless_story::character::seal_approve_control/_owner`，非 upstream
> `memwal::account`）。accountId 只供 relayer 認證 + 向量索引，**不 gate SEAL**
> （SEAL 由角色的 ControlCap/OwnerCap 管）。client 端 embed 用 `OPENAI_API_KEY`。
> 程式碼：`web/lib/chain/memory.ts` → pov-core + run-reflection 已接；
> `SagaMemoryClient`（ControlCap 寫）/`OwnerAuditClient`（OwnerCap 讀）在 `packages/memwal`。

**1. 部署 + 種子化**：開 `http://localhost:3000/admin/deploy` → 上方下拉選 STORY (spring-snow / minimal) + ENV → 依序點 ① deploy → ② bootstrap → ③ seed 職缺。`contract-ids.ts` 會被覆寫。

CLI 路徑先跑 preflight，避免半途才發現 gas / env / build 問題：

```bash
pnpm --filter @endless-story/cli run deploy-preflight -- --env testnet --json-out=/private/tmp/endless-story-deploy-preflight.json
```

**1.5. （Drama demo cast）正常 mint + 補行當 tags**：不要用 `seed-cast` 直接 mint demo cast，因為直 mint 會繞過 portrait / persona / setting gallery，角色會沒有基礎圖。先用 ③ seed 職缺，走首頁一般 recruitment wizard mint 主要角色；若 mint 出同名角色後需要補 `role:*` tags，再跑：

```bash
pnpm --filter @endless-story/cli run seed-cast -- --env testnet --tag-existing
```

`seed-cast` 的無圖直 mint 已被 `--allow-no-media` gate 起來，只留給本機 debug，不作 demo/redeploy 預設流程。

**1.6. Headless tick smoke（不上鏈）**：部署或本機 server 起來後先跑一輪安全 smoke：

```bash
pnpm --filter @endless-story/cli run world-loop -- --max=1 --dry-run --max-characters=1 --no-sleep --no-gazette
```

**1.7. Targeted dry-run（不上鏈）**：驗 demo cast 時不要靠排序。等用一般流程 mint 完主要角色後，從 `/admin/director` 或 `/dossier` 抄角色 object ids，直接指定 2–3 位：

```bash
WORLD_LOOP_URL=http://localhost:3000 \
pnpm --filter @endless-story/cli run world-loop -- \
  --max=1 --dry-run --max-characters=3 \
  --character-ids=<char-id-1>,<char-id-2>,<char-id-3> \
  --no-sleep --no-gazette \
  --json-out=/private/tmp/endless-story-targeted-dryrun.json
```

快速只看 DRAMA / SOCIAL 時加 `--no-pov`，會跳過最慢的章回生成：

```bash
WORLD_LOOP_URL=http://localhost:3000 \
pnpm --filter @endless-story/cli run world-loop -- \
  --max=1 --dry-run --max-characters=3 \
  --character-ids=<char-id-1>,<char-id-2>,<char-id-3> \
  --no-pov --no-sleep --no-gazette
```

**2. （可選）調 Faucet**：同頁底部 Faucet 設定 — 改 drip 量、cooldown 等，套用。

**3. User mint 流程**：
```
http://localhost:3000/
→ 右上 MockWalletMenu hover → 連結錢包 (dapp-kit, 同網路)
→ 「領 ENDLESS」 (admin 自動走 admin_mint; user 走 drip)
→ 第二屏徵召 carousel，點任一張票「應榜」
→ 寫描述 → 擲牌 (moderate → mint_voucher user-sign → LLM preview)
→ 揭曉 (1 候選 + rolled 屬性) → 接受 → painting (LLM curate + OpenAI + Walrus)
→ 配像 → 入班 (server action admin keypair auto-redeem)
→ 跳 /dossier?id=<0x…> 顯示鏈上 Character
```

**失敗排查**：
- `[mint] unavailable for consumption` → devnet 抖；wizard 已自動 retry 一次，再失敗就刷新瀏覽器或切 testnet
- `[mint] Failed to fetch wallet-rpc.devnet.sui.io` → Slush 自己內部 RPC 掛了，看 status.sui.io
- 「請先連結錢包」→ 右上點 ConnectModal
- 「梨園尚未種子化」→ 跑 admin /deploy ② bootstrap
- LLM 500 → 檢查 POE_API_KEY / OPENAI_API_KEY
- redeem 失敗 → 檢查 SUI_ADMIN_PRIVATE_KEY 對 + storyteller cap 在這把鑰匙

---

## 設計系統（精簡）

### Theme tokens（語意色，不是 Tailwind 預設）

`canvas`（body 底）/ `surface`（卡 nav sticky）/ `elevated`（modal popover）/ `ink`（主文字）/ `mute`（次文字）/ `hairline`（邊線）/ `cinnabar`（accent，dark=暖金）/ `jade`（次 accent）/ `seal`（cinnabar hover）

定義在 `packages/web/src/app/globals.css` `:root` + `.dark`。Tailwind 用 `bg-canvas` / `text-ink` 等（`darkMode: 'class'`）。

### Dark mode 鐵律

**canvas 不能同時當 body 跟卡片背景。** body → `bg-canvas`；卡/nav/sticky → `bg-surface`；modal/floating → `bg-elevated`；input/凹陷 → `bg-canvas dark:bg-canvas/40`。

Tailwind 預設色（`bg-stone-*` 等）一定要配 `dark:`。重複 className → 抽到 `globals.css @layer components` 的 `.es-*` utility（`.es-icon-button`、`.es-soft-panel`、`.es-field`、`.es-choice-card`、`.es-outline-button`、`.es-page-lead-eyebrow|title`）。

### 動畫

- Enter: `requestAnimationFrame` 後 toggle → `translate-y-4 opacity-0` → `translate-y-0 opacity-100`，`duration-300 ease-out`
- Exit: 反向 + `setTimeout` 280ms 才 unmount
- Stage 切換: `key={stage}` + `.animate-fade-in-up`

---

## 不要

**架構**
- ❌ 繞過 `sdk` 直接 `new SuiClient()`（原則 2）
- ❌ web/runner 直接 import `@mysten/walrus|seal`（走 memwal，原則 3）
- ❌ web/runner 直接 `fetch` Poe / OpenAI / Anthropic 或 import AI SDK（走 llm，原則 4；唯一既定例外＝memwal client 端 embedding）
- ❌ 手動編輯 `shared/src/contract-ids.ts`（cli 寫入，原則 5）
- ❌ 在 `(site)` route 放 admin 操作（原則 7）
- ❌ 繞過 `web/src/lib/api/` facade

**UI**
- ❌ raw Tailwind 色不加 `dark:`
- ❌ 用 `bg-canvas` 當卡片背景
- ❌ 重複 className → 抽 `.es-*`
- ❌ 入班自動跳轉（要手動 CTA）

**Repo / 環境**
- ❌ 動老 repo `Endless-Story`
- ❌ 雙份維護 `AGENTS.md` / `CLAUDE.md`
- ❌ 用拼音 skill 名（已禁 wuxia / xianxia 等）
- ❌ devnet 掛了切 testnet 不跟使用者確認

---

## 接班啟動 prompt

```
讀 /Users/harperdelaviga/endless-story-new/AGENTS.md，照「下一步」順序開工。
先做 S：Runner 穩定化 / Demo acceptance（per-tick recall cache、SEAL 429 backoff、
顧/柳/孟 2 tick 驗證）。不要回頭從 1.6/1.7 開始；不要搬舊 repo 大 runner。
每完成一個小步驟跟我回報；commit 由我決定時機。
```
