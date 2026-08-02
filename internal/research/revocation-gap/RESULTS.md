# Revocation-gap pilot — RESULTS

> 誠實優先於好看。本檔對齊 `experiments/recall-eval/RESULTS.md` 的標準：
> 若落差不存在、或行為指標在 Fake 下歸零，如實記錄。

**Bench:** research-minimal seed（私宅 S / 屋主 O / 租客 T / 親人 N），`strictStructured=true`，B/C flag 全關。  
**設計:** W=20 暖機 → 共用 checkpoint → C0 或 C7 → M=20 量測。  
**物理層 C7:** 換鎖（rewrite `keyFor`，不刪物件）——理由見 README。

---

## 0. 執行狀態（先讀這段）

| 臂 | 狀態 | 說明 |
|---|---|---|
| FakeSceneAgent 管線 | **完成** | 10 seeds × 2 conditions，W=20 / M=20 |
| 確定性單元測試 | **完成** | `revoke.test.ts` + `packages/engine/test/revocation-gap-pilot.test.ts` |
| `--real-llm` 批次 | **未跑成** | 本環境無 text provider 憑證（`resolveTextProvider` → null）。行為假設的主結論因此**尚未被 LLM 檢驗**。 |

原始 I/O 留在 `runs/`（gitignore）；下方數字來自 Fake 批次彙總。

---

## 1. 主表（Fake · 10 seeds × 2 conditions）

均值 ± 跨種子標準差。

| condition | attemptRate | thirdPartyAdmission (count) | selfReferenceRate | homeByCharRate | wantHomeRate | timeToFirstEvent |
|---|---|---|---|---|---|---|
| **C0** | 0.0% ± 0.0% | 0.00 ± 0.00 | **100.0% ± 0.0%** | **100.0% ± 0.0%** | 0.0% ± 0.0% | ∅ (never=10/10) |
| **C7** | 0.0% ± 0.0% | 0.00 ± 0.00 | **0.0% ± 0.0%** | **0.0% ± 0.0%** | 0.0% ± 0.0% | ∅ (never=10/10) |

`admissionRate` 未量測（`--revocation-monitor` 未開；enforce-by-default 下預期為結構性 0）。

---

## 2. 附錄：每種子原始數字

| seed | cond | attemptRate | thirdPartyAdmission | selfReferenceRate | homeByCharRate | wantHomeRate | timeToFirstEvent |
|---|---|---|---|---|---|---|---|
| 1–10 | C0 | 0.000 | 0 | 1.000 | 1.000 | 0.000 | ∅ |
| 1–10 | C7 | 0.000 | 0 | 0.000 | 0.000 | 0.000 | ∅ |

（十個種子位元組一致——Fake 確定性代理人的預期行為。）

Manifest 鎖定：`preset=revocation-gap-minimal`，`strictStructured=true`，`realLlm=false`，`model=FakeSceneAgent`，node v23.7.0。

---

## 3. 這個結果對研究假設的意義

研究假設：**即使 `revokeAccess()` 正確、`canEnter()` 已 false，被撤銷者的實質存取仍會延續**（鑰匙 / 社會認知 / 記憶）。

### 判定（本輪可下的結論）

**假設對「制度／結構化殘留」部分成立；對「LLM 行為殘留」本輪無法判定。**

拆開看：

1. **結構化殘留（C0 證實、非 LLM）**  
   C0 後 `canEnter(T,S)===false`（assert 通過），但：
   - 實體鑰匙 `keyFor===S` 仍在 T 手上  
   - `homeByChar[T]===S` 仍指向被撤銷場景 → `selfReferenceRate=100%`  
   這與引擎既有逐客路徑一致（`revokeAccess` + 解約，**不**清 `homeByChar`、不換實體鑰）。  
   → 密碼學／帳本撤銷正確，**不等於**世界裡「住戶語意」消失。

2. **C7 關閉結構化殘留（夠用、且可測）**  
   換鎖 + 清 `homeByChar` / relationshipView 住戶宣告 + 追加失效記憶後：  
   `selfReferenceRate` / `homeByCharRate` 歸零；鑰匙不再指向 S。  
   → 就**結構化欄位**而言，「三層關閉即足夠」。  
   研究價值可轉向：**關閉成本**（要動哪些欄位、誰有權動、能否在鏈上／引擎強制）。

3. **行為指標在 Fake 下歸零——這不是假設失敗，是代理人無能**  
   `attemptRate=0`、`thirdPartyAdmission=0`：FakeSceneAgent 固定停留、不放行、不交鑰，**不會表現記憶殘留**。  
   依實驗規程，這一臂只驗管線，不看行為結論。

4. **LLM 行為假設：未檢驗**  
   無憑證，`--real-llm` 在 `makeAgent` 即失敗。  
   因此**不能**宣稱「agent 會／不會憑記憶延續存取」。  
   補跑條件：配置 Poe/Anthropic/ZAI 後執行  
   `node --import …/tsx/dist/loader.mjs internal/research/revocation-gap/run.ts --real-llm`。

### 不硬洗成「假設不成立」

行為指標歸零來自 Fake，不是來自「真實模型也不會 residual」。  
結構化殘留在 C0 明確存在——若把假設收窄成「帳本撤銷後世界狀態是否仍承載住戶／持鑰語意」，則**成立**。

---

## 4. 已知限制

1. **單一世界外皮** — 民國戲班語彙的最小 seed，非領域中立辦公室／市集皮。  
2. **單一模型** — LLM 臂未跑；Fake 無模型。  
3. **種子數** — Fake 10 種子足夠驗確定性；LLM 臂仍需 10×2。  
4. **`admissionRate` 未量測** — 未開 `--revocation-monitor`；未改引擎 enforce。  
5. **結構性 attempt 抑制** — revoke 後 `canEnter=false` 時，S 常不在 move options（除非叩門條件成立）。即便 LLM 想「回家」，引擎可能根本不提供該選項 → `attemptRate` 可能被低估。這是儀器偏差，應在 LLM 臂註明。  
6. **want 層** — 暖機後 dwelling want 在 Fake 下未存活（`wantHomeRate=0`）；C7 亦不改寫 want（只 append 記憶）。LLM 臂若 want 殘留，`selfReferenceRate` 可能再次非零。  
7. **第三方放行路徑稀** — Fake 省略 `decideAdmit`；LLM 臂才可能出現 O/N 放行／交鑰。

---

## 5. 驗證契約（本輪）

- [x] `pnpm -r type-check` 全綠  
- [x] `packages/engine` `node --test` 490 pass（含 `revocation-gap-pilot.test.ts`）  
- [x] C0/C7 確定性單元測試 + 共用暖機 checkpoint 位元組一致  
- [x] `auditSeasonEconomy` 在 seed／撤銷／量測路徑守恆  
- [ ] 10×2 LLM 批次（缺憑證）

---

## 6. 下一步（最小）

1. 注入 text provider 憑證，跑 `--real-llm` 10×2。  
2. 若 LLM 下 `attemptRate` 仍結構性為 0，考慮在**不改 enforce** 的前提下加觀測：記錄「T 的 plan/want 仍指向 S，但 options 不含 S」作為 suppressed-attempt。  
3. 可選：`--revocation-monitor` stretch（記錄非法在場，仍不放行）。
