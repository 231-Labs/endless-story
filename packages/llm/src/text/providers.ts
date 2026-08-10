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
/** A provider that never answers must not hold an atomic world tick forever.
 * Three minutes still accommodates slow creative calls; fallback owns retry. */
const REQUEST_TIMEOUT_MS = 180_000;
/** 留給 GLM 推理的額度（Poe 忽略關閉旗標時的保命符）。實測一次思考吃掉一兩千
 *  token；留三千，答案才有地方寫。關得掉的通道（Z.AI 直連）用不到這筆。 */
const GLM_REASONING_HEADROOM_TOKENS = 3000;

function boundedSignal(callerSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
}

export class LLMHttpError extends Error {
  status: number;
  provider: 'zai' | 'poe' | 'anthropic';
  model: string;

  constructor(
    status: number,
    provider: 'zai' | 'poe' | 'anthropic',
    model: string,
    bodySnippet: string,
  ) {
    super(`[${provider}] HTTP ${status} on ${model}: ${bodySnippet}`);
    this.name = 'LLMHttpError';
    this.status = status;
    this.provider = provider;
    this.model = model;
  }
}

/**
 * 這顆模型是不是根本不在了——下架、改名、或這把 key 沒有權限？
 *
 * 與 {@link isRetryableError} 不同：重試**同一個 id** 毫無意義（Poe 對下架的
 * bot 連回三次一模一樣的 404），但換**下一顆**正是該做的事。把兩者混為一談，
 * 就是一顆下架的 bot 能拖垮整卷的原因：`GLM-5.1-FW` 回 404、404 不算可重試，
 * 於是 `chatWithFallback` 在第一順位就拋出去，後面三顆健康的備援一顆都沒碰到。
 */
export function isModelUnavailableError(err: unknown): boolean {
  const status = err instanceof LLMHttpError ? err.status : (err as { status?: number })?.status;
  const msg = ((err as { message?: string })?.message ?? '').toLowerCase();
  if (status === 404) return true;
  // 有些供應商把「不認得的模型」報成 400 參數錯誤。
  if (status === 400) {
    return /model.*(not found|not exist|unavailable|not deployed|inaccessible)|unknown model|invalid model/.test(msg);
  }
  return false;
}

/** Is this an overload / transient / rate-limit error worth retrying with another model? */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof LLMHttpError) {
    // 500 included: Poe surfaces transient internal errors as plain 500s —
    // two live seasons died to one-off "provider_error" 500s before this.
    return err.status === 429 || err.status === 500 || err.status === 502 || err.status === 503 || err.status === 504 || err.status === 529;
  }
  const e = err as { status?: number; message?: string };
  if (e?.status === 429 || e?.status === 500 || e?.status === 502 || e?.status === 503 || e?.status === 504 || e?.status === 529) return true;
  const msg = (e?.message ?? '').toLowerCase();
  if ((e as { name?: string })?.name === 'TimeoutError' || msg.includes('timed out') || msg.includes('timeout')) return true;
  if (msg.includes('overloaded') || msg.includes('rate_limit') || msg.includes('rate limit')) return true;
  // Network-level transients (a TCP reset once killed a whole season at day 3):
  // undici surfaces them as `fetch failed` with the syscall error in `cause`.
  const causeCode = String((e as { cause?: { code?: string } })?.cause?.code ?? '');
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(causeCode)) return true;
  return msg.includes('fetch failed') || msg.includes('socket hang up') || msg.includes('econnreset') || msg.includes('network');
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
    signal: boundedSignal(req.signal),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LLMHttpError(res.status, 'zai', req.model, text.slice(0, 200));
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: requireText('zai', req.model, data.choices?.[0], data.usage),
    model: req.model,
    provider: 'zai',
    usage:
      data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
  };
}


/**
 * 空回是事故，不是答案。
 *
 * OpenAI 相容端點在幾種情形下會**成功回應但 content 一個字都沒有**：推理型模型
 * 把 max_tokens 全花在 reasoning 上（`finish_reason: 'length'`，實錄：一次呼叫想了
 * 32 秒回一個空字串，滿場角色一件心事都長不出來）、內容被安全層攔掉、或整段答案
 * 被放進 `reasoning_content` 那類非標準欄位。
 *
 * 原本這裡一律 `?? ''` 靜靜回空——空字串一路流到解析器，解析器回空值，世界靜止，
 * 而日誌上什麼都沒有。改為：先撿非標準欄位（答案真在那兒就用），真的什麼都沒有
 * 就**擲出可重試的錯誤**，讓 fallback 換一顆模型去試——這正是 fallback 鏈存在的
 * 理由，先前它對這種失敗完全看不見。
 */
function requireText(
  provider: 'zai' | 'poe' | 'anthropic',
  model: string,
  choice: { message?: { content?: string; reasoning_content?: string }; finish_reason?: string } | undefined,
  usage: { completion_tokens?: number } | undefined,
): string {
  const content = choice?.message?.content?.trim();
  if (content) return content;
  // 有些推理型模型把整段答案放在 reasoning 欄；答案在那兒就用，別浪費一次呼叫。
  const reasoning = choice?.message?.reasoning_content?.trim();
  if (reasoning) return reasoning;
  const why = choice?.finish_reason === 'length'
    ? `finish_reason=length（輸出額度用盡；completion_tokens=${usage?.completion_tokens ?? '?'}——推理型模型多半是把額度花在思考上了，換一顆不思考的模型或關掉 thinking）`
    : `finish_reason=${choice?.finish_reason ?? 'unknown'}`;
  throw new LLMHttpError(503, provider, model, `空回：模型回應成功但一個字都沒有（${why}）`);
}

/** POST to Poe's OpenAI-compatible endpoint. */
export async function callPoe(apiKey: string, req: ChatRequest): Promise<ChatResponse> {
  // content may be a string or multimodal parts (image_url) for vision models;
  // the OpenAI-compatible endpoint accepts both, so pass through verbatim.
  const messages: Array<{ role: string; content: unknown }> = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push(...req.messages.map((m) => ({ role: m.role, content: m.content })));

  const needsThinking = THINKING_MODELS.has(req.model);
  // GLM 在 Poe 這頭預設開著推理。我們照送官方的關閉旗標（Z.AI 直連確實吃這一套），
  // 但**實測 Poe 對它家的 GLM bot 忽略它**：一次呼叫想了 32 秒，`content` 回來一個
  // 字都沒有——推理把 max_tokens 花光了，答案沒地方寫（滿場角色一件心事都長不出來，
  // 世界完全靜止）。關不掉，就替它留位置：推理的額度另計，別跟答案搶。
  //
  // 這不是多花錢——想是照樣想、照樣計費，先前只是想完之後我們沒拿到東西。
  const glm = /glm/i.test(req.model);
  const reasoningHeadroom = glm && !needsThinking ? GLM_REASONING_HEADROOM_TOKENS : 0;
  const body: Record<string, unknown> = {
    model: req.model,
    messages,
    max_tokens: needsThinking ? Math.max(req.maxTokens, 4096) : req.maxTokens + reasoningHeadroom,
    stream: false,
  };
  if (needsThinking) {
    body.thinking = { type: 'enabled', budget_tokens: req.thinking?.budgetTokens ?? Math.max(2048, req.maxTokens) };
  } else {
    if (glm) body.thinking = { type: 'disabled' };
    if (typeof req.temperature === 'number') body.temperature = req.temperature;
  }

  const res = await fetch(POE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: boundedSignal(req.signal),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LLMHttpError(res.status, 'poe', req.model, text.slice(0, 200));
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: requireText('poe', req.model, data.choices?.[0], data.usage),
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
    signal: boundedSignal(req.signal),
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
