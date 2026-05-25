/**
 * User-prompt moderation — judge whether a player's character description
 * violates platform rules before it gets fed into the storyteller.
 *
 * The actual judging is done by a cheap model (Haiku-tier). This file only
 * builds the prompt + parses the verdict.
 */

import type { ChatMessage } from '../text/types.js';

export const DEFAULT_MODERATION_RULES = `1. 真實名人（政治人物、藝人、歷史敏感人物，例如希特勒、毛澤東等）
2. 性露骨內容（裸體、性行為描寫、戀童）
3. 仇恨言論（針對特定族群、種族、宗教的歧視 / 攻擊）
4. 違法行為的具體教學（製毒 / 製武 / 駭客）
5. 自我傷害 / 自殺的鼓勵性內容

如果**任何一條**違反，回 not_ok；否則回 ok。

「武俠 / 民國 / 黑幫 / 暴力打鬥 / 一般戲劇衝突 / 風月場域 / 含蓄情慾」**不算違規**——這個平台本來就在演江湖戲。`;

export interface BuildModerationPromptOptions {
  userPrompt: string;
  /** Override `DEFAULT_MODERATION_RULES`. */
  rulesText?: string;
}

export interface BuildPromptResult {
  system?: string;
  messages: ChatMessage[];
  maxTokens: number;
}

export function buildModerationPrompt(opts: BuildModerationPromptOptions): BuildPromptResult {
  const rulesText = opts.rulesText?.trim() || DEFAULT_MODERATION_RULES;
  const userText = `你是「無盡故事」這個說書平台的內容審核員。下面是用戶要塞給說書人、用來生成新角色的描述。請依「審核規則」判斷它是否違反任一條。

【審核規則】
${rulesText}

只輸出 JSON，不要任何前綴或解釋：
{"verdict": "ok" | "not_ok", "reason": "<若 not_ok，一句話說明踩了哪條>"}

用戶描述：
"""
${opts.userPrompt}
"""`;
  return {
    messages: [{ role: 'user', content: userText }],
    maxTokens: 200,
  };
}

export type ModerationVerdict = 'ok' | 'not_ok' | 'parse_failed';

export interface ModerationResult {
  verdict: ModerationVerdict;
  reason?: string;
}

export function parseModerationResult(text: string): ModerationResult {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { verdict: 'parse_failed' };
  try {
    const parsed = JSON.parse(match[0]) as { verdict?: string; reason?: string };
    if (parsed.verdict === 'ok') return { verdict: 'ok' };
    if (parsed.verdict === 'not_ok') {
      return { verdict: 'not_ok', reason: parsed.reason?.trim() || '未通過審核，請改寫。' };
    }
    return { verdict: 'parse_failed' };
  } catch {
    return { verdict: 'parse_failed' };
  }
}

/**
 * Input length bounds — caller-side guard before invoking the model.
 * Matches the old repo's `/api/characters/moderate` route limits.
 */
export const USER_PROMPT_MIN = 1;
export const USER_PROMPT_MAX = 1200;
