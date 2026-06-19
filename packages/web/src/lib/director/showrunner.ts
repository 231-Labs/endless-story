/**
 * Showrunner heartbeat — NARRATIVE_AGENTS.md §12.2.
 *
 *   OBSERVE   world time + live snapshot + recent gazettes + tension headline
 *   AUDIT     deterministic sweep (code finds; LLM only decides)
 *             + capped mechanical auto-repair of character gaps
 *   EVALUATE  expensive model reads context vs the persistent arc plan
 *   PLAN/ACT  budgeted JSON-action tool loop over the director registry
 *   REPORT    導演日誌 + updated arc plan → director memory store
 *
 * Guardrails: tool-call budget, LLM-round budget, dryRun restricts the
 * registry to read tier, every call recorded as a ToolCallRecord.
 */

import { createTextClient } from '@endless-story/llm/text';
import type { ChatMessage } from '@endless-story/llm/text';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { fetchTensionHeadline } from '@/lib/chain/drama';
import { fetchRecentGazetteTexts } from './observe';
import { runWorldAudit, type WorldAuditReport } from './audit';
import { runAutoRepair, type AutoRepairResult } from './repair';
import {
  executeDirectorTool,
  renderToolCatalog,
  type ToolCallRecord,
  type ToolTier,
} from './tools';
import { appendShowrunnerEntry, readDirectorMemory } from './memory-store';

export interface ShowrunnerOptions {
  /** Max tool executions per heartbeat. Default 6. */
  maxToolCalls?: number;
  /** Mechanically reconcile flagged character gaps before the LLM runs. Default true. */
  autoRepair?: boolean;
  /** Cap for the mechanical repair pass. Default 2. */
  maxRepairs?: number;
  /** true → read-only: no repair, registry restricted to read tier. */
  dryRun?: boolean;
}

export interface ShowrunnerResult {
  ok: boolean;
  /** 導演日誌 (markdown). */
  report: string;
  /** Arc plan after this heartbeat. */
  arcPlan: string;
  audit: WorldAuditReport;
  repair?: AutoRepairResult;
  toolCalls: ToolCallRecord[];
  error?: string;
}

const GAZETTE_COUNT = 3;

/** Tolerant first-JSON-object extractor (models love code fences). */
export function extractJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `你是「無盡故事」這個自治敘事世界的總導演（Showrunner）。世界裡的角色都是自治 agent，自己感知、規劃、出牌、寫主觀章回——**你絕不替任何角色決定他怎麼演、怎麼想**。

**你唯一也是最大的任務：讓這個故事好看、有血有肉，讓看的人想一直追下去。** 補漏、設環境、調張力都只是手段；衡量你做得好不好的唯一尺，是「一個讀者會不會在乎這些角色、會不會想知道接下來怎樣」。

**好看的判準（每一拍都拿這幾條對照自己）**：
- **角色是活人，不是張力的零件**：他們會變、會矛盾、會在不該心軟時心軟。別只顧種更多 rivalry/estrangement 把人愈推愈遠，也要給靠近、退讓、出乎意料的一刻。
- **要變化，別把同一個結愈打愈深**：一條衝突連著好幾天往同方向加碼（疏離第七層、danger 一路飆）是原地碾，不是推進。換口氣——換一對人、插一場安靜的戲、給一個反轉、把一條老線**收掉**。
- **張力要回報，不能只升不落**：埋的要爆、該和解的和解、該失去的失去、該攤牌的攤牌。只升不落的故事讓人累，不讓人追。
- **張力是手段不是目的**：讀者不在乎「danger 幾百」，在乎的是某兩個人會不會終於看對方一眼。別為了顯得有在做事就把數字往上拱。
- **留白與節奏**：不是每次心跳都要動手。有時最好的導演動作是**不動**，讓一場小溫情或一段沉默落地。
- **演出來，別說教**：別替角色「分析」他們其實還愛——把條件擺好，讓他們自己撞上、讓讀者自己看出來。你佈局，角色顯形。

**每次心跳先問自己一句：我這一步，是讓人更想追下去，還是只是維持秩序、把數字拱高？** 若是後者，寧可不動，或改去做一件真有血肉的事。

行事準則（都是手段，服務於上面那個唯一任務）：
1. **機械衛生**：巡檢發現角色缺漏（肖像/記憶等）能修就修——這是衛生、不是目的，別讓心跳都耗在補漏與清卡住的事件上。查 persona/關係/記憶用 get_character_detail、查全班所在用 list_saga_roster，別用 reconcile_character 來「看」。
2. **推故事**：對照弧線計畫與最近公報，用上面的判準問自己——這條線**該收了沒**？是不是同一個拍子在原地加深？**該變、該償、該安靜**的時候到了沒？要開新線／逼一個轉折／促成一場戲，用 direct_capabilities（寫「要發生什麼」，不寫台詞、不替角色決定反應）。整盤老繞著那幾種稀缺打轉，就用 register_resource 換個新題材換氣。
3. **排大戲（戲班自編自演）**：戲班能自己排一齣「舊戲新唱」——編劇寫本、行當選角（含乾旦/坤生）、角色有感而發填詞、全體演一場戲中戲，鑄成「戲折」上鏈。這是少數能把眾角的舊情、暗慕、較勁**一次攤上同一座台**的大場面，也是給整個戲班的共同創作高潮。**這幾條都成立才考慮排**：班底湊得齊行當（生旦淨丑有人）、金庫撐得起、距上次排戲已隔一段日子、且此刻敘事真需要一場大的（多條線纏到同一個結、該給某段關係一個舞台、或全局該換一口大氣）。用 launch_production（可指定 classicKey／cast，或讓班主自選）。**它極昂貴、是導演級的決定**——別頻繁排、別為了顯得有在做事而排；不到那個份上，寧可用 direct_capabilities 推一兩拍就好。
4. **節制**：工具有預算；想不出哪一步能讓故事更好看，就先別動。沒事可做就是沒事可做。
5. 輸出一律繁體中文。

互動協定——每回合只輸出**一個 JSON 物件**（不要其他文字、不要 markdown 代碼框）：
- 呼叫工具：{"thought": "為什麼（用『好看』對照）", "tool": "工具名", "args": {...}}
- 結束心跳：{"done": true, "report": "導演日誌（看到什麼、做了什麼、**為什麼這讓故事更好看**、下一步）", "arcPlan": "更新後的當前狀態快照"}

arcPlan 是你的**當前狀態快照**，不是歷史卷軸。固定四個 ## 區塊、總長控制在 600 字內、每次輸出完整版本（但只含「現在」）：
## 當前主題（2-4 句：此刻在演什麼、你要往哪推）
## 下步關注（3-5 條：接下來幾拍要盯的事）
## 進行中的張力線（只列**還活著**的線，各一兩句進展；已收束的線不要逐條留著，最多在主題裡一句帶過）
## 伏筆（還沒付清的短列；付清或已用掉的剪掉）
**鐵則：arcPlan 裡絕不寫「干預史／做過什麼／第幾日做了X」**——那是 report（導演日誌）的職責、已另外逐期保存。也不要逐日累積、不要保留已結束的線。看見上一版 arcPlan 很長，就是你的責任把它收乾淨。`;

/** First non-empty line of a markdown report, stripped + clipped — a one-line digest
 *  of a 導演日誌 entry for the Showrunner's recent-action context. */
function firstLine(md: string): string {
  const line = (md || '').split('\n').map((s) => s.trim()).find((s) => s.length > 0) ?? '';
  const cut = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^[-·•]\s*/, '');
  return cut.length > 90 ? `${cut.slice(0, 90)}…` : cut;
}

export async function runShowrunner(opts: ShowrunnerOptions = {}): Promise<ShowrunnerResult> {
  const maxToolCalls = opts.maxToolCalls ?? 6;
  const dryRun = opts.dryRun === true;
  const allowTiers: ToolTier[] = dryRun ? ['read'] : ['read', 'narrative'];

  const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
  const memory = readDirectorMemory();
  const emptyAudit: WorldAuditReport = {
    ok: false,
    castCount: 0,
    openEventCount: 0,
    issues: [],
    summary: '',
  };
  if (!sagaId) {
    return {
      ok: false,
      report: '',
      arcPlan: memory.arcPlan,
      audit: emptyAudit,
      toolCalls: [],
      error: 'saga 尚未種子化',
    };
  }

  // —— OBSERVE + AUDIT ————————————————————————————————
  const audit = await runWorldAudit();
  let repair: AutoRepairResult | undefined;
  if (!dryRun && opts.autoRepair !== false && audit.ok) {
    repair = await runAutoRepair(audit, { maxRepairs: opts.maxRepairs ?? 2 });
  }
  const [gazettes, tension] = await Promise.all([
    fetchRecentGazetteTexts(sagaId, { limit: GAZETTE_COUNT }),
    fetchTensionHeadline(sagaId).catch(() => null),
  ]);

  let client;
  try {
    client = createTextClient({ kind: 'primary' });
  } catch (err) {
    return {
      ok: false,
      report: '',
      arcPlan: memory.arcPlan,
      audit,
      repair,
      toolCalls: [],
      error: err instanceof Error ? err.message : 'LLM 未設定',
    };
  }

  const repairLine = repair
    ? `（本輪已先機械補漏 ${repair.attempted} 名角色${repair.deferred.length > 0 ? `；${repair.deferred.length} 名留待下輪` : ''}）`
    : '';

  // Recent intervention history lives in the LOG, not the arc plan — feed the last
  // few report headlines so the Showrunner keeps recent-action memory without the
  // arc plan having to accumulate a 干預史 卷軸.
  const recentLog =
    memory.log.length > 0
      ? memory.log
          .slice(-4)
          .map((e) => `· ${e.day != null ? `第${e.day}日` : e.at.slice(5, 10)}：${firstLine(e.report)}`)
          .join('\n')
      : '（尚無）';

  const contextPrompt = `${audit.summary}
${repairLine}

【當前張力】
${tension ?? '（無資料）'}

【最近 ${GAZETTE_COUNT} 期公報（舊→新）】
${gazettes}

【你最近幾次心跳做過的事（這就是干預史 — 不要再寫進 arcPlan）】
${recentLog}

【弧線計畫（你上次心跳留下的「當前狀態」；若它已變長/含歷史，這次收乾淨）】
${memory.arcPlan || '（尚無 —— 這是你第一次心跳，請從公報與現場狀態建立第一版弧線計畫）'}

【可用工具】
${renderToolCatalog(allowTiers)}

工具呼叫預算：${maxToolCalls} 次${dryRun ? '（dryRun：只開放讀級工具）' : ''}。
請開始。**先用一個讀者的眼睛評估：這故事此刻好不好看——哪條線悶了在原地碾、哪個埋了該償了、哪裡缺一場有血肉的戲、是不是該讓一條線收掉或安靜一拍。** 再決定動不動手；沒有哪一步能讓它更好看，就老實不動。完成後輸出 done。`;

  // —— EVALUATE + PLAN/ACT loop ————————————————————————
  const toolCalls: ToolCallRecord[] = [];
  let messages: ChatMessage[] = [{ role: 'user', content: contextPrompt }];
  let report = '';
  let arcPlan = memory.arcPlan;
  const maxLlmRounds = maxToolCalls + 4;

  for (let round = 0; round < maxLlmRounds; round++) {
    let text: string;
    try {
      const res = await client.chat({
        system: SYSTEM_PROMPT,
        messages,
        maxTokens: 3000,
        temperature: 0.4,
      });
      text = res.text;
    } catch (err) {
      return {
        ok: false,
        report,
        arcPlan,
        audit,
        repair,
        toolCalls,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const parsed = extractJson(text);
    if (!parsed) {
      messages = [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'user', content: '輸出不是合法 JSON。請依協定重新輸出一個 JSON 物件。' },
      ];
      continue;
    }

    if (parsed.done === true) {
      report = typeof parsed.report === 'string' ? parsed.report : '';
      if (typeof parsed.arcPlan === 'string' && parsed.arcPlan.trim()) {
        arcPlan = parsed.arcPlan.trim();
      }
      break;
    }

    if (typeof parsed.tool === 'string') {
      if (toolCalls.length >= maxToolCalls) {
        messages = [
          ...messages,
          { role: 'assistant', content: text },
          { role: 'user', content: '工具預算已用完。請直接輸出 {"done": true, "report": "...", "arcPlan": "..."}。' },
        ];
        continue;
      }
      const args =
        parsed.args && typeof parsed.args === 'object'
          ? (parsed.args as Record<string, unknown>)
          : {};
      const rec = await executeDirectorTool(parsed.tool, args, allowTiers);
      toolCalls.push(rec);
      messages = [
        ...messages,
        { role: 'assistant', content: text },
        {
          role: 'user',
          content: `【工具結果 ${rec.tool}】ok=${rec.ok} (${rec.ms}ms)\n${rec.outcome}`,
        },
      ];
      continue;
    }

    // Neither a tool call nor done — nudge once.
    messages = [
      ...messages,
      { role: 'assistant', content: text },
      { role: 'user', content: '請輸出工具呼叫或 {"done": true, ...}，不要其他形狀。' },
    ];
  }

  if (!report) {
    report = `（本輪心跳未產出日誌 —— LLM 輸出異常。工具呼叫 ${toolCalls.length} 次，巡檢摘要如下）\n\n${audit.summary}`;
  }

  // —— REPORT ————————————————————————————————————————
  appendShowrunnerEntry(
    {
      at: new Date().toISOString(),
      day: audit.day,
      report,
      toolCalls,
    },
    dryRun ? undefined : arcPlan,
  );

  return { ok: true, report, arcPlan, audit, repair, toolCalls };
}
