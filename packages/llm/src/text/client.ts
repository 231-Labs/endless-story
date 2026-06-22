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
import { callAnthropic, callPoe, callZAI } from './providers.js';
import { chatWithFallback } from './fallback.js';
import { makeHarnessTextClient } from './harness-fake.js';
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
  // DECOUPLED HARNESS seam (test-only): bypass loadLLMConfig (which throws when no
  // provider key is set) and return a zero-network fake whose `.chat()` produces
  // plausible markdown sized to the prompt (plan line / POV chapter / multi-POV cut
  // / gazette). Gated on ES_HARNESS=1 ⇒ production unaffected.
  //
  // ESCAPE HATCH (narrative observatory): the full-tick *mechanism* harness wants
  // the fake (fast, deterministic, studies the chain seam). The *narrative*
  // observatory wants REAL prose to see whether chapters iterate or loop — it sets
  // ES_NARRATIVE_REAL_LLM=1 to fall through to the real provider client below (which
  // needs a provider key). Image generation stays faked either way.
  if (process.env.ES_HARNESS === '1' && process.env.ES_NARRATIVE_REAL_LLM !== '1') {
    return makeHarnessTextClient(opts.kind === 'cheap' ? 'cheap' : 'primary');
  }
  const cfg = loadLLMConfig(opts.config);
  const provider = resolveTextProvider(cfg);
  if (!provider) {
    throw new Error(
      '@endless-story/llm: no text provider configured. ' +
        'Set ZAI_API_KEY (or POE_API_KEY / ANTHROPIC_API_KEY) in environment.',
    );
  }

  const cheap = opts.kind === 'cheap';
  let defaultModel: string;
  let callOne: (req: ChatRequest) => Promise<ChatResponse>;
  let extraFallback: string[];

  if (provider === 'zai') {
    defaultModel = cheap ? cfg.zaiModelCheap : cfg.zaiModelPrimary;
    const apiKey = cfg.zaiApiKey!;
    const baseUrl = cfg.zaiBaseUrl;
    callOne = (req) => callZAI(apiKey, baseUrl, req);
    // Only two Z.AI models in play: on overload the primary degrades to the cheap one.
    extraFallback = cheap ? [] : [cfg.zaiModelCheap];
  } else if (provider === 'poe') {
    defaultModel = cheap ? cfg.poeModelCheap : cfg.poeModelPrimary;
    const apiKey = cfg.poeApiKey!;
    callOne = (req) => callPoe(apiKey, req);
    extraFallback = getFallbackModels('poe', cheap);
  } else {
    defaultModel = cheap ? cfg.anthropicModelCheap : cfg.anthropicModelPrimary;
    const apiKey = cfg.anthropicApiKey!;
    callOne = (req) => callAnthropic(apiKey, req);
    extraFallback = getFallbackModels('anthropic', cheap);
  }

  const fallbackChain = opts.disableFallback
    ? null
    : [defaultModel, ...extraFallback.filter((m) => m !== defaultModel)];

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
