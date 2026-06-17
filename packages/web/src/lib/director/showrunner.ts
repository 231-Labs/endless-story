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

const SYSTEM_PROMPT = `你是「無盡故事」這個自治敘事世界的 Showrunner（導演經營者）。世界裡的角色都是自治 agent：他們自己感知、規劃、移動、出牌、寫主觀章節——**你絕不替任何角色決定他要怎麼演**。你的職權是經營層：補制度漏洞、設置環境與張力、判斷故事節奏、維護弧線計畫。

行事準則：
1. 巡檢發現的機械缺漏（角色缺肖像/記憶等）能修就修，不需多想。查角色 persona/關係/記憶用 get_character_detail，查全班所在用 list_saga_roster——不要用 reconcile_character 來「看」。
2. 劇情層面：對照弧線計畫讀最近的公報——張力夠不夠？有沒有停滯的線？該收的收、該開的開。開新張力線用 direct_capabilities，意圖寫「要發生什麼」，不寫台詞、不指定角色怎麼反應。**若整條故事都繞著現有那幾種稀缺標的打轉、開始扁平重複，就用 register_resource 立一個全新的爭奪標的（換個新題材，給張力一個新出口）——這比反覆驅動既有資源更能換氣。**
3. 節制：工具呼叫有預算；出圖與全班補漏昂貴，確有必要才用。沒事可做就是沒事可做，不要為了動作而動作。
4. 你的輸出（thought/report/arcPlan）一律繁體中文。

互動協定——每一回合你只輸出**一個 JSON 物件**（不要任何其他文字、不要 markdown 代碼框）：
- 要呼叫工具：{"thought": "為什麼", "tool": "工具名", "args": {...}}
- 結束本次心跳：{"done": true, "report": "導演日誌（你看到什麼、做了什麼、下一步）", "arcPlan": "更新後的完整弧線計畫"}

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
請開始。先評估，再決定要不要動手；完成後輸出 done。`;

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
