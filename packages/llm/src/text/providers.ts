/**
 * Provider HTTP adapters — Z.AI / Poe (OpenAI-compat) and Anthropic (direct).
 *
 * Direct `fetch` to provider REST endpoints — no SDK dependencies.
 * Edge-runtime safe (uses only stdlib fetch / Headers).
 *
 * All adapters return the same `ChatResponse` shape; callers should never
 * branch on which one served the request.
 */

import { THINKING_MODELS } from './models.js';
import type { ChatRequest, ChatResponse } from './types.js';

const POE_ENDPOINT = 'https://api.poe.com/v1/chat/completions';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ZAI_MIN_MAX_TOKENS = 1024;

export class LLMHttpError extends Error {
  constructor(
    public status: number,
    public provider: 'zai' | 'poe' | 'anthropic',
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

/**
 * POST to Z.AI's OpenAI-compatible /chat/completions endpoint.
 * `baseUrl` is the Z.AI v4 base (e.g. https://api.z.ai/api/paas/v4); we append
 * /chat/completions. GLM models take standard OpenAI params (model / messages /
 * max_tokens / temperature) — no Poe-style `thinking` block.
 */
export async function callZAI(apiKey: string, baseUrl: string, req: ChatRequest): Promise<ChatResponse> {
  const messages: Array<{ role: string; content: unknown }> = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push(...req.messages.map((m) => ({ role: m.role, content: m.content })));

  const body: Record<string, unknown> = {
    model: req.model,
    messages,
    max_tokens: Math.max(req.maxTokens, ZAI_MIN_MAX_TOKENS),
    stream: false,
    // GLM-4.5+/5.x default extended thinking ON server-side. Reasoning counts
    // against max_tokens, so short-budget calls get their answer truncated
    // mid-JSON, and every call pays 1-2k reasoning tokens + 3-4× latency
    // (measured: 52s → 15s on character gen). No call site relies on it —
    // disabled unless explicitly requested via req.thinking.
    thinking: { type: req.thinking ? 'enabled' : 'disabled' },
  };
  if (typeof req.temperature === 'number') body.temperature = req.temperature;

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LLMHttpError(res.status, 'zai', req.model, text.slice(0, 200));
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: data.choices?.[0]?.message?.content ?? '',
    model: req.model,
    provider: 'zai',
    usage:
      data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
  };
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
  } else {
    // GLM models default thinking ON at the Poe/Z.AI backend; without an explicit
    // `disabled` flag every call pays a ~3x reasoning tax (and can truncate output).
    // callZAI always sends the flag; this Poe path never did. Scope to GLM so the
    // non-GLM Poe models (GPT / Gemini / Claude) that may reject the field are left alone.
    if (/glm/i.test(req.model)) body.thinking = { type: 'disabled' };
    if (typeof req.temperature === 'number') body.temperature = req.temperature;
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
