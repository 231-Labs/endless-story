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
import type { ImageClient, ImageQuality, ImageResponse } from './types.js';

/** 1x1 transparent PNG (base64, no data: prefix). */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function makeHarnessImageClient(): ImageClient {
  const resp = (): ImageResponse => ({
    provider: 'openai',
    model: 'harness-fake-image',
    images: [{ base64: TINY_PNG_B64, revisedPrompt: 'harness fake' }],
  });
  return {
    provider: 'openai',
    defaultModel: 'harness-fake-image',
    async generate() {
      return resp();
    },
    async edit() {
      return resp();
    },
  };
}

export interface CreateImageClientOptions {
  config?: Partial<LLMConfig>;
  defaultQuality?: ImageQuality;
}

export function createImageClient(opts: CreateImageClientOptions = {}): ImageClient {
  // DECOUPLED HARNESS seam (test-only, ES_HARNESS=1): return a zero-network fake
  // that yields a 1x1 PNG so the event-moment path runs without OpenAI. Gated ⇒
  // production unaffected.
  if (process.env.ES_HARNESS === '1') {
    return makeHarnessImageClient();
  }
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
