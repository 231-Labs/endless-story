/**
 * Self-contained AI client for the harness — mirrors @endless-story/llm's
 * pattern (same env vars, same provider precedence, same model defaults) but
 * with ZERO cross-package imports, so the harness runs under plain `node`
 * (native TS) with no install and no tsx, for BOTH mock and real keys.
 *
 * (App code — web/runner/cli — must still go through @endless-story/llm per
 *  AGENTS.md. This is a standalone verification harness, like packages/economy,
 *  so a small built-in client is the right call.)
 *
 * Key via env (drop packages/troupe/.env.local or pass inline):
 *   ZAI_API_KEY | POE_API_KEY | ANTHROPIC_API_KEY   (+ AI_PROVIDER to force one)
 * No key (or --mock / TROUPE_MOCK=1) → local templates, whole pipeline still runs.
 */

export interface AskRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  kind?: 'primary' | 'cheap';
}

export interface Ask {
  (req: AskRequest): Promise<string>;
  mock: boolean;
  provider: string;
  /** instrumentation so the driver can prove real calls happened (and how fast). */
  calls: number;
  failures: number;
  ms: number;
  lastError?: string;
}

interface ProviderCfg {
  provider: 'zai' | 'poe' | 'anthropic';
  apiKey: string;
  baseUrl: string;
  models: { primary: string; cheap: string };
  /** true = Anthropic messages API; false = OpenAI-compatible chat/completions. */
  anthropic: boolean;
}

function resolveProvider(): ProviderCfg | null {
  const e = process.env;
  const zai = (): ProviderCfg | null =>
    e.ZAI_API_KEY
      ? {
          provider: 'zai',
          apiKey: e.ZAI_API_KEY,
          baseUrl: e.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4',
          models: { primary: e.ZAI_MODEL_PRIMARY ?? 'glm-5.1', cheap: e.ZAI_MODEL_CHEAP ?? 'GLM-4.7-FlashX' },
          anthropic: false,
        }
      : null;
  const poe = (): ProviderCfg | null =>
    e.POE_API_KEY
      ? {
          provider: 'poe',
          apiKey: e.POE_API_KEY,
          baseUrl: 'https://api.poe.com/v1',
          models: { primary: e.POE_MODEL_PRIMARY ?? 'GLM-5.1-FW', cheap: e.POE_MODEL_CHEAP ?? 'GLM-4.7-N' },
          anthropic: false,
        }
      : null;
  const anthropic = (): ProviderCfg | null =>
    e.ANTHROPIC_API_KEY
      ? {
          provider: 'anthropic',
          apiKey: e.ANTHROPIC_API_KEY,
          baseUrl: 'https://api.anthropic.com/v1',
          models: {
            primary: e.ANTHROPIC_MODEL_PRIMARY ?? 'claude-sonnet-4-6',
            cheap: e.ANTHROPIC_MODEL_CHEAP ?? 'claude-haiku-4-5',
          },
          anthropic: true,
        }
      : null;

  if (e.AI_PROVIDER === 'zai') return zai();
  if (e.AI_PROVIDER === 'poe') return poe();
  if (e.AI_PROVIDER === 'anthropic') return anthropic();
  return zai() ?? poe() ?? anthropic(); // auto precedence, mirrors config.ts
}

const TIMEOUT_MS = 120_000; // GLM on Poe is slow for ~1k-token outputs; 60s timed out.
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Transient errors worth retrying / falling back to a faster model. */
function retryable(err: unknown): boolean {
  return /Timeout|aborted|ECONN|fetch failed|network|\b(408|409|425|429|500|502|503|504|529)\b/i.test(String(err));
}

async function callOnce(cfg: ProviderCfg, model: string, req: AskRequest): Promise<string> {
  const max = req.maxTokens ?? 1400;
  const temperature = req.temperature ?? 0.85;
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  if (cfg.anthropic) {
    const r = await fetch(`${cfg.baseUrl}/messages`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: max, temperature, system: req.system, messages: [{ role: 'user', content: req.user }] }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    if (!text.trim()) throw new Error('anthropic: empty content');
    return text;
  }

  // OpenAI-compatible (zai / poe). ZAI: disable GLM thinking (eats max_tokens + 4× slower).
  const body: Record<string, unknown> = {
    model,
    max_tokens: max,
    temperature,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
  };
  if (cfg.provider === 'zai') body.thinking = { type: 'disabled' };

  const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${cfg.provider} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = j.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error(`${cfg.provider}: empty/!string content`);
  return content;
}

/**
 * One logical call, made robust: try the primary model, then on a transient
 * error (timeout/429/5xx) back off and fall to the faster cheap model (twice).
 * A hard error (401/400) throws immediately — no point retrying a bad key.
 */
async function callProvider(cfg: ProviderCfg, req: AskRequest): Promise<string> {
  const chain =
    req.kind === 'cheap'
      ? [cfg.models.cheap, cfg.models.cheap]
      : [cfg.models.primary, cfg.models.cheap, cfg.models.cheap];
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    try {
      return await callOnce(cfg, chain[i], req);
    } catch (err) {
      lastErr = err;
      if (!retryable(err)) throw err;
      if (i < chain.length - 1) await sleep(700 * (i + 1));
    }
  }
  throw lastErr;
}

function attachAsk(
  fn: (req: AskRequest) => Promise<string>,
  meta: { mock: boolean; provider: string },
): Ask {
  const ask = Object.assign(fn, {
    mock: meta.mock,
    provider: meta.provider,
    calls: 0,
    failures: 0,
    ms: 0,
  });
  return ask as Ask;
}

export function makeAsk(opts: { mock?: boolean } = {}): Ask {
  const forceMock = opts.mock || process.env.TROUPE_MOCK === '1';
  const cfg = forceMock ? null : resolveProvider();

  if (!cfg) {
    return attachAsk(async (_req) => {
      throw new Error('ask() called in mock mode — use askOr()/askJson() so a local template runs');
    }, { mock: true, provider: 'mock' });
  }

  const ask = attachAsk(async (req) => {
    const t0 = Date.now();
    ask.calls++;
    try {
      return (await callProvider(cfg, req)).trim();
    } catch (err) {
      ask.failures++;
      ask.lastError = String(err);
      throw err;
    } finally {
      ask.ms += Date.now() - t0;
    }
  }, { mock: false, provider: cfg.provider });
  return ask;
}

/** Run the LLM if wired, else fall back to a local template (short marker on failure). */
export async function askOr(ask: Ask, req: AskRequest, fallback: () => string): Promise<string> {
  if (ask.mock) return fallback();
  try {
    return await ask(req);
  } catch {
    return `${fallback()}\n\n〔此段 LLM 呼叫失敗，已用本機模板〕`;
  }
}

/**
 * Run `fn` over items with a concurrency cap (preserves order). Keeps a 大戲's
 * 7-scene fan-out from firing 7 simultaneous requests at the provider (429s).
 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/** Pull the first JSON array/object out of an LLM reply (tolerates ``` fences + chatter). */
function extractJson(s: string): unknown {
  const cleaned = s.replace(/```(?:json)?/gi, '').trim();
  const starts = ['[', '{'].map((c) => cleaned.indexOf(c)).filter((i) => i >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
  return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
}

/** Ask for STRUCTURED output (JSON), parse + validate; fall back on mock/failure/mismatch. */
export async function askJson<T>(
  ask: Ask,
  req: AskRequest,
  fallback: () => T,
  validate?: (v: unknown) => v is T,
): Promise<T> {
  if (ask.mock) return fallback();
  try {
    const parsed = extractJson(await ask(req));
    if (validate && !validate(parsed)) return fallback();
    return parsed as T;
  } catch {
    return fallback();
  }
}
