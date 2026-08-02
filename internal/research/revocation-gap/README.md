# Revocation-gap pilot（C0 vs C7）

先導實驗：回答「**授權被正確撤銷後，存取是否仍然延續？**」

只做兩格（C0 / C7），不做八格完整因子。若落差不存在（指標歸零），亦如實回報。

研究設計見 [`docs/testbed/RESEARCH_DESIGN.md`](../../../docs/testbed/RESEARCH_DESIGN.md) §3 I3、§6 論文三；邊界見 [`docs/testbed/TESTBED_BOUNDARY.md`](../../../docs/testbed/TESTBED_BOUNDARY.md)。

## 條件

| 條件 | 操作 |
|---|---|
| **C0** | `revokeAccess(S,T)` + `delete leases[S]`。不動鑰匙、社會記錄、記憶。 |
| **C7** | C0 + 物理換鎖 + 清除社會住戶記錄 + 對 T/O/N 追加權威失效記憶註記。 |

兩條件**共用同一暖機 checkpoint**（W=20 tick），差異只有撤銷方式。

### C7 物理層選擇：換鎖（rewrite `keyFor`）

不刪除鑰匙物件，改寫 `keyFor` 使不再指向 S。理由：引擎逐客語彙即「換鎖」；殘留的無效力 bearer token 更接近真實再配鑰後的物理殘留。

### 社會層欄位盤點（C7 清除清單）

承載「T 住在 S」語意的結構化欄位：

1. `WorldStateData.homeByChar[T]` — 夜宿錨點（權威）
2. `WorldStateData.leases[S].tenantId` — 租約登記（C0 已刪）
3. `WorldStateData.accessGrants[S].standing` — 使用權帳本（C0 `revokeAccess` 已清）
4. `CastMember.relationshipView[*]` — 本 seed 寫入的住戶宣告散文（C7 改寫為「已遷出」）
5. `CastMember.plan` — 若仍以 S 為住處計畫，C7 清掉
6. `WorldObject.keyFor === S` — 實體鑰匙（物理層；C7 換鎖）

**不承載住戶語意**（已盤點、C7 不為此清除）：`edges` tone/weight、`bonds`、`acquaintance`（無 scene 欄位）、`propertyOwners`（擁有權 ≠ 居住）。

## 指標（帳本判定，無 LLM 評分）

| 指標 | 定義 |
|---|---|
| `attemptRate` | 量測窗內，T 對 S 提出結構化行動（移動/叩門、對 S 物件動作）的 tick 比例 |
| `thirdPartyAdmission` | O 或 N 為 T 執行 `grantAccess(S,T)`、交付 `keyFor===S` 鑰、或代取 S 內資源的次數 |
| `selfReferenceRate` | `homeByChar[T]===S` 或 T 的 live want 仍以 S 為住處的 tick 比例 |
| `timeToFirstEvent` | 撤銷後到第一次 attempt / admission 的 tick 數 |
| `admissionRate` | 選作；需 `--revocation-monitor`（預設關；不改引擎強制） |

## 執行

```bash
# 0 成本管線驗證（FakeSceneAgent）
export PATH="$HOME/.nvm/versions/node/v23.7.0/bin:$PATH"
node --import tsx internal/research/revocation-gap/run.ts --seeds 1

# 正式批次（需 text provider）
node --import tsx internal/research/revocation-gap/run.ts --real-llm

# 單元測試
node --test --import tsx internal/research/revocation-gap/revoke.test.ts
# 引擎鏡像測試（CI）
pnpm --filter @endless-story/engine test -- test/revocation-gap-pilot.test.ts
```

`runs/` 在套件 `.gitignore` 內；進 repo 的只有原始碼、`README.md`、`RESULTS.md`。

## 檔案

| 檔 | 角色 |
|---|---|
| `scenario.ts` | 最小 seed（S/O/T/N + seedHousing） |
| `revoke.ts` | C0 / C7 操作 |
| `metrics.ts` | 指標彙總 |
| `instrument.ts` | agent / grantAccess 觀測（不改強制） |
| `checkpoint.ts` | 共用暖機 checkpoint |
| `run.ts` | 批次 harness + manifest |
| `revoke.test.ts` | 確定性單元測試 |
| `RESULTS.md` | 假設成立與否的誠實報告 |

## 變更史

| 日期 | 變更 |
|---|---|
| 2026-08-01 | 初版 pilot：C0 vs C7，Fake 管線 + 引擎鏡像測試。LLM 批次見 RESULTS。 |
