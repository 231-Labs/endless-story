'use server';

/**
 * Server action — AI 策展: GLM arranges the checked exhibits (position / yaw /
 * scale) and lights each one (colour temperature + intensity) from the titles'
 * semantics and the collector's instruction. Iterative: pass the current
 * arrangement back with a new instruction to adjust.
 */

import { text as llmText, prompts as llmPrompts } from '@endless-story/llm';
import type { CurateCurrent, CurateItem, CurateResult } from '@endless-story/llm/prompts';

const CURATE_MODEL = process.env.CHAMBER_CURATE_MODEL || 'glm-4.7-flash';

export interface CurateVaultInput {
  items: CurateItem[];
  instruction: string;
  current?: CurateCurrent[];
}

export interface CurateVaultResult {
  ok: boolean;
  result?: CurateResult;
  model?: string;
  error?: string;
}

export async function curateVault(input: CurateVaultInput): Promise<CurateVaultResult> {
  if (!input.items.length) return { ok: false, error: '沒有勾選任何展品。' };
  if (!process.env.POE_API_KEY && !process.env.ZAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: '未設定 LLM API key。' };
  }
  try {
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const prompt = llmPrompts.buildCuratePrompt({
      items: input.items,
      instruction: input.instruction,
      current: input.current,
    });
    const res = await llm.chat({
      model: CURATE_MODEL,
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: prompt.maxTokens,
      temperature: 0.6,
    });
    const parsed = llmPrompts.parseCurateResponse(res.text);
    if (!parsed) return { ok: false, error: '策展輸出無法解析，請再試一次。', model: res.model };
    return { ok: true, result: parsed, model: res.model };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
