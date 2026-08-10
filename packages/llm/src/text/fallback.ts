/**
 * Model-fallback wrapper — retry on overload / rate-limit with cheaper models.
 *
 * Caller passes a chain of model ids. Three outcomes per model:
 *   - 可重試（429/500/502/503/504/529、連線重置、空回）→ 同一顆退避重試，再換下一顆；
 *   - **不在了**（404 / 不認得的模型 400）→ 直接換下一顆，不重試也不退避：id 已經
 *     沒了，等再久也不會回來；
 *   - 其餘（401、參數錯誤…）→ 立刻往外拋。壞掉的 key 或畸形的 prompt 在每一顆模型
 *     上都會壞成一樣，走完整條鏈只是把同一個錯誤乘以鏈長。
 */

import { isModelUnavailableError, isRetryableError } from './providers.js';
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
        // 下架的 bot 不是一時的。跳過退避與剩下的重試，直接換下一顆——
        // 這條鏈存在的理由就是這一刻。
        if (isModelUnavailableError(err)) break;
        if (!isRetryableError(err)) throw err;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * 4 ** attempt));
      }
    }
    const next = models[i + 1];
    if (next && onFallback) onFallback(model, next, lastErr);
  }
  throw lastErr ?? new Error('chatWithFallback: all models exhausted');
}
