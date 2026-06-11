/**
 * Provider HTTP adapters — Poe (OpenAI-compat) and Anthropic (direct).
 *
 * Direct `fetch` to provider REST endpoints — no SDK dependencies.
 * Edge-runtime safe (uses only stdlib fetch / Headers).
 *
 * Both adapters return the same `ChatResponse` shape; callers should never
 * branch on which one served the request.
 */

import { THINKING_MODELS } from './models.js';
import type { ChatRequest, ChatResponse } from './types.js';

const POE_ENDPOINT = 'https://api.poe.com/v1/chat/completions';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export class LLMHttpError extends Error {
  constructor(
    public status: number,
    public provider: 'poe' | 'anthropic',
    public model: string,
    bodySnippet: string,
  ) {
    super(`[${provider}] HTTP ${status} on ${model}: ${bodySnippet}`);
    this.name = 'LLMHttpError';
  }
}

/** Is this an overload / transient / rate-limit error worth retrying with another model? */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof LLMHttpError) {
    return err.status === 429 || err.status === 503 || err.status === 529;
  }
  const e = err as { status?: number; message?: string };
  if (e?.status === 429 || e?.status === 503 || e?.status === 529) return true;
  const msg = (e?.message ?? '').toLowerCase();
  return msg.includes('overloaded') || msg.includes('rate_limit') || msg.includes('rate limit');
}

/** POST to Poe's OpenAI-compatible endpoint. */
export async function callPoe(apiKey: string, req: ChatRequest): Promise<ChatResponse> {
  // content may be a string or multimodal parts (image_url) for vision models;
  // the OpenAI-compatible endpoint accepts both, so pass through verbatim.
  const messages: Array<{ role: string; content: unknown }> = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push(...req.messages.map((m) => ({ role: m.role, content: m.content })));

  const needsThinking = THINKING_MODELS.has(req.model);
  const body: Record<string, unknown> = {
    model: req.model,
    messages,
    max_tokens: needsThinking ? Math.max(req.maxTokens, 4096) : req.maxTokens,
    stream: false,
  };
  if (needsThinking) {
    body.thinking = { type: 'enabled', budget_tokens: req.thinking?.budgetTokens ?? Math.max(2048, req.maxTokens) };
  } else if (typeof req.temperature === 'number') {
    body.temperature = req.temperature;
  }

  const res = await fetch(POE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LLMHttpError(res.status, 'poe', req.model, text.slice(0, 200));
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: data.choices?.[0]?.message?.content ?? '',
    model: req.model,
    provider: 'poe',
    usage:
      data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
  };
}

/** POST to Anthropic's /v1/messages endpoint. */
export async function callAnthropic(apiKey: string, req: ChatRequest): Promise<ChatResponse> {
  const needsThinking = THINKING_MODELS.has(req.model);
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: needsThinking ? Math.max(req.maxTokens, 4096) : req.maxTokens,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (req.system) body.system = req.system;
  if (needsThinking) {
    body.thinking = { type: 'enabled', budget_tokens: req.thinking?.budgetTokens ?? Math.max(2048, req.maxTokens) };
  } else if (typeof req.temperature === 'number') {
    body.temperature = req.temperature;
  }

  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LLMHttpError(res.status, 'anthropic', req.model, text.slice(0, 200));
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');

  return {
    text,
    model: req.model,
    provider: 'anthropic',
    usage:
      data.usage
        ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
        : undefined,
  };
}
