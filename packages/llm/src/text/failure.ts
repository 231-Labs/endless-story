/**
 * 失敗的種類 — what a caller can DO about an LLM HTTP failure.
 *
 * Deliberately import-free, so it can be unit-tested without dragging the HTTP
 * transport (and its `.js`-suffixed module graph) along with it. The taxonomy is
 * also not really a transport concern: it is about what the OPERATOR should do.
 */

/**
 * What a caller can DO about an HTTP failure — the part a raw status code and a
 * JSON blob do not say.
 *
 * A live season died at 「[fatal] [poe] HTTP 402 on GLM-4.7-N: {"error": ...}」
 * and the only thing that line told the operator was that something was broken.
 * Whether to wait, top up, fix a key or change a model id is exactly the question
 * a run-ending error should answer.
 */
export type LLMFailureKind =
  /** 額度用盡 — retrying and falling back are both pointless: every model on the
   *  account shares the quota. Only topping up helps. */
  | 'quota'
  /** 鑰匙不對／沒權限 —— 換模型也一樣。 */
  | 'auth'
  /** 模型不存在或改名了 —— 這一把鑰匙用得著，這個模型用不著。 */
  | 'unknown-model'
  /** 過載／限流／網路 —— 等一下、退到別的模型會好。 */
  | 'transient'
  | 'other';

const FAILURE_HINT: Record<LLMFailureKind, string> = {
  quota: '額度用盡：同一個帳號所有模型共用額度，重試與備援模型都救不了，只能儲值',
  auth: '鑰匙不對或沒有這個模型的權限：換模型不會好，去檢查 API key',
  'unknown-model': '這個模型 id 供應商不認得（下架或改名了）：改設定裡的模型 id',
  transient: '過載／限流／網路：等一下或退到備援模型',
  other: '',
};

export function classifyLLMFailure(status: number, bodySnippet = ''): LLMFailureKind {
  const body = bodySnippet.toLowerCase();
  if (status === 402 || body.includes('insufficient_quota') || body.includes('used up your points') || body.includes('quota')) {
    return 'quota';
  }
  if (status === 401 || status === 403) return 'auth';
  if (status === 404 || body.includes('bot not found') || body.includes('model_not_found')) return 'unknown-model';
  if ([429, 500, 502, 503, 504, 529].includes(status)) return 'transient';
  return 'other';
}

export class LLMHttpError extends Error {
  status: number;
  provider: 'zai' | 'poe' | 'anthropic';
  model: string;
  /** What the caller can do about it. */
  kind: LLMFailureKind;

  constructor(
    status: number,
    provider: 'zai' | 'poe' | 'anthropic',
    model: string,
    bodySnippet: string,
  ) {
    const kind = classifyLLMFailure(status, bodySnippet);
    const hint = FAILURE_HINT[kind];
    super(`[${provider}] HTTP ${status} on ${model}${hint ? `（${hint}）` : ''}: ${bodySnippet}`);
    this.name = 'LLMHttpError';
    this.status = status;
    this.provider = provider;
    this.model = model;
    this.kind = kind;
  }
}

/** 額度用盡 —— the one failure where neither retrying nor falling back can help. */
export function isQuotaError(err: unknown): boolean {
  if (err instanceof LLMHttpError) return err.kind === 'quota';
  const e = err as { status?: number; message?: string };
  if (e?.status === 402) return true;
  const msg = (e?.message ?? '').toLowerCase();
  return msg.includes('insufficient_quota') || msg.includes('used up your points');
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
