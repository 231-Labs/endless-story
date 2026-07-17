/**
 * Model-fallback wrapper — retry on overload / rate-limit with cheaper models.
 *
 * Caller passes a chain of model ids; on retryable error (429/502/503/504/529 or
 * messages mentioning overloaded/rate_limit), try the next one. Non-retryable
 * errors propagate immediately.
 */

import { isRetryableError } from './providers.js';
import type { ChatRequest, ChatResponse } from './types.js';

export type ChatFn = (req: ChatRequest) => Promise<ChatResponse>;

export async function chatWithFallback(
  fn: ChatFn,
  baseRequest: Omit<ChatRequest, 'model'>,
  models: string[],
  onFallback?: (failedModel: string, nextModel: string, err: unknown) => void,
): Promise<ChatResponse> {
  if (models.length === 0) {
    throw new Error('chatWithFallback: no models provided');
  }

  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    // Same-model retry with backoff first: a transient (network reset, 429,
    // overloaded) usually clears in seconds — falling to another model (or
    // dying, when there is no fallback) should be the LAST resort.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fn({ ...baseRequest, model });
      } catch (err) {
        lastErr = err;
        if (!isRetryableError(err)) throw err;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * 4 ** attempt));
      }
    }
    const next = models[i + 1];
    if (next && onFallback) onFallback(model, next, lastErr);
  }
  throw lastErr ?? new Error('chatWithFallback: all models exhausted');
}
