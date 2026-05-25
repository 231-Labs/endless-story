/**
 * `TextClient` factory — resolves provider + default model from env config.
 *
 * Usage:
 * ```ts
 * import { createTextClient } from '@endless-story/llm/text';
 * const client = createTextClient({ kind: 'primary' });   // creative writing
 * const res = await client.chat({ system: '...', messages: [...], maxTokens: 2000 });
 * ```
 *
 * Falls through 429/503/529 to provider-specific cheaper models automatically.
 */

import { loadLLMConfig, resolveTextProvider, type LLMConfig } from '../config.js';
import { getFallbackModels } from './models.js';
import { callAnthropic, callPoe } from './providers.js';
import { chatWithFallback } from './fallback.js';
import type { ChatRequest, ChatResponse, TextClient } from './types.js';

export interface CreateTextClientOptions {
  /** 'primary' (creative) or 'cheap' (decisions / moderation). Default: 'primary'. */
  kind?: 'primary' | 'cheap';
  /** Override config (mainly for tests). */
  config?: Partial<LLMConfig>;
  /** Disable model fallback on overload. */
  disableFallback?: boolean;
  /** Called when a model in the fallback chain is skipped due to overload. */
  onFallback?: (failedModel: string, nextModel: string, err: unknown) => void;
}

export function createTextClient(opts: CreateTextClientOptions = {}): TextClient {
  const cfg = loadLLMConfig(opts.config);
  const provider = resolveTextProvider(cfg);
  if (!provider) {
    throw new Error(
      '@endless-story/llm: no text provider configured. ' +
        'Set POE_API_KEY or ANTHROPIC_API_KEY in environment.',
    );
  }

  const cheap = opts.kind === 'cheap';
  const defaultModel =
    provider === 'poe'
      ? cheap
        ? cfg.poeModelCheap
        : cfg.poeModelPrimary
      : cheap
        ? cfg.anthropicModelCheap
        : cfg.anthropicModelPrimary;

  const apiKey = provider === 'poe' ? cfg.poeApiKey! : cfg.anthropicApiKey!;
  const callOne = (req: ChatRequest): Promise<ChatResponse> =>
    provider === 'poe' ? callPoe(apiKey, req) : callAnthropic(apiKey, req);

  const fallbackChain = opts.disableFallback
    ? null
    : [defaultModel, ...getFallbackModels(provider, cheap).filter((m) => m !== defaultModel)];

  const chat: TextClient['chat'] = async (req) => {
    const model = req.model ?? defaultModel;
    const base: Omit<ChatRequest, 'model'> = {
      messages: req.messages,
      system: req.system,
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      thinking: req.thinking,
    };
    if (fallbackChain && model === defaultModel) {
      return chatWithFallback(callOne, base, fallbackChain, opts.onFallback);
    }
    return callOne({ ...base, model });
  };

  return { provider, defaultModel, chat };
}
