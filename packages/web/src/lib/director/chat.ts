/**
 * Director chat — NARRATIVE_AGENTS.md §12.4. The conversational face of the
 * same agent: same tool registry, same director memory.
 *
 *   問（「現在劇情是什麼？」）→ read tools + arc plan + gazettes → answer
 *   令・小事（補某角色、開一條 capability）→ narrative tools, do it now
 *   令・大方向（新主題、長弧線）→ update_arc_plan; next heartbeat executes
 *
 * Chat history persists in director memory, so "上次叫你做的怎樣了" works
 * across days.
 */

import { createTextClient } from '@endless-story/llm/text';
import type { ChatMessage } from '@endless-story/llm/text';
import {
  executeDirectorTool,
  renderToolCatalog,
  type ToolCallRecord,
  type ToolTier,
} from './tools';
import { appendChatTurns, readDirectorMemory, type ChatTurn } from './memory-store';
import { extractJson } from './showrunner';

export interface DirectorChatResult {
  ok: boolean;
  reply: string;
  toolCalls: ToolCallRecord[];
  error?: string;
}

const HISTORY_TURNS = 12;

const CHAT_SYSTEM = `你是「無盡故事」Showrunner（導演經營者）的對話介面，正在跟班主（admin）說話。世界裡的角色都是自治 agent——你不替角色決定怎麼演；你的職權是經營層：查狀態、補缺漏、設置張力、維護弧線計畫。

應對方式：
1. **問題**（劇情近況、某角色狀態、世界數據）→ 先用讀級工具查證再回答，不要憑空編。劇情近況優先看弧線計畫與 read_recent_gazettes；全班所在用 list_saga_roster；單角色 persona/關係/記憶用 get_character_detail（**不要用 reconcile_character 來查**）。
2. **小指令**（補某角色、出變體肖像、開一條張力線）→ 直接用工具執行，回報結果。
3. **大方向**（換主題、鋪長弧線、調整故事節奏）→ 用 update_arc_plan 把它整合進弧線計畫（完整改寫、保留仍有效的舊內容），回覆時說明已記錄、下次心跳開始執行。
4. **昂貴或破壞性的事**（全班補漏、大量出圖）拿不準就先反問確認，不要先斬後奏。
5. 回覆用繁體中文，語氣是可靠的劇團經理：簡潔、有憑據、不裝神弄鬼。

互動協定——每一回合你只輸出**一個 JSON 物件**（不要任何其他文字）：
- 要呼叫工具：{"thought": "為什麼", "tool": "工具名", "args": {...}}
- 回覆班主並結束：{"done": true, "reply": "給班主的回覆（可用 markdown）"}`;

export async function runDirectorChat(
  message: string,
  opts: { maxToolCalls?: number } = {},
): Promise<DirectorChatResult> {
  const maxToolCalls = opts.maxToolCalls ?? 4;
  const allowTiers: ToolTier[] = ['read', 'narrative'];
  const memory = readDirectorMemory();

  let client;
  try {
    client = createTextClient({ kind: 'primary' });
  } catch (err) {
    return {
      ok: false,
      reply: '',
      toolCalls: [],
      error: err instanceof Error ? err.message : 'LLM 未設定',
    };
  }

  const history = memory.chat
    .slice(-HISTORY_TURNS)
    .map((t) => `${t.role === 'admin' ? '班主' : '你'}：${t.text}`)
    .join('\n');

  const contextPrompt = `【弧線計畫（你的跨心跳記憶）】
${memory.arcPlan || '（尚無）'}

【近期對話】
${history || '（首次對話）'}

【可用工具】
${renderToolCatalog(allowTiers)}

工具呼叫預算：${maxToolCalls} 次。

班主說：
"""
${message}
"""`;

  const toolCalls: ToolCallRecord[] = [];
  let messages: ChatMessage[] = [{ role: 'user', content: contextPrompt }];
  let reply = '';
  const maxLlmRounds = maxToolCalls + 3;

  for (let round = 0; round < maxLlmRounds; round++) {
    let text: string;
    try {
      const res = await client.chat({
        system: CHAT_SYSTEM,
        messages,
        maxTokens: 2400,
        temperature: 0.4,
      });
      text = res.text;
    } catch (err) {
      return {
        ok: false,
        reply,
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
      reply = typeof parsed.reply === 'string' ? parsed.reply : '';
      break;
    }

    if (typeof parsed.tool === 'string') {
      if (toolCalls.length >= maxToolCalls) {
        messages = [
          ...messages,
          { role: 'assistant', content: text },
          { role: 'user', content: '工具預算已用完。請直接輸出 {"done": true, "reply": "..."}。' },
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

    messages = [
      ...messages,
      { role: 'assistant', content: text },
      { role: 'user', content: '請輸出工具呼叫或 {"done": true, "reply": "..."}，不要其他形狀。' },
    ];
  }

  if (!reply) {
    reply = '（這次我沒能整理出回覆——請再說一次，或換個說法。）';
  }

  const now = new Date().toISOString();
  const turns: ChatTurn[] = [
    { role: 'admin', text: message, at: now },
    { role: 'director', text: reply, at: now },
  ];
  appendChatTurns(turns);

  return { ok: true, reply, toolCalls };
}
