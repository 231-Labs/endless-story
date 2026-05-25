/**
 * Image-client factory — resolves OpenAI from env config.
 *
 * Usage:
 * ```ts
 * import { createImageClient } from '@endless-story/llm/image';
 * const client = createImageClient();
 * const res = await client.generate({ prompt, aspectRatio: '4:5' });
 * ```
 */

import { loadLLMConfig, type LLMConfig } from '../config.js';
import { createOpenAIImageClient } from './openai.js';
import type { ImageClient, ImageQuality } from './types.js';

export interface CreateImageClientOptions {
  config?: Partial<LLMConfig>;
  defaultQuality?: ImageQuality;
}

export function createImageClient(opts: CreateImageClientOptions = {}): ImageClient {
  const cfg = loadLLMConfig(opts.config);
  if (!cfg.openaiApiKey) {
    throw new Error(
      '@endless-story/llm: OPENAI_API_KEY missing. Image generation requires OpenAI gpt-image-2.',
    );
  }
  return createOpenAIImageClient({
    apiKey: cfg.openaiApiKey,
    model: cfg.openaiImageModel,
    defaultQuality: opts.defaultQuality ?? 'medium',
  });
}

/** UI gating helper — does config have an image provider? */
export function hasImageProvider(config?: Partial<LLMConfig>): boolean {
  return Boolean(loadLLMConfig(config).openaiApiKey);
}
