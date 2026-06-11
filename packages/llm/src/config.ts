/**
 * LLM runtime config — read from environment variables.
 *
 * **Env vars** (all optional individually; need at least one provider key):
 *   ZAI_API_KEY               — Z.AI direct API key (OpenAI-compatible) — https://docs.z.ai
 *   ZAI_MODEL_PRIMARY         — Z.AI model for creative tasks (default: 'glm-5.1')
 *   ZAI_MODEL_CHEAP           — Z.AI model for decisions / moderation (default: 'GLM-4.7-FlashX')
 *   ZAI_BASE_URL              — Z.AI base URL (default: 'https://api.z.ai/api/paas/v4')
 *   POE_API_KEY               — Poe API key (multi-provider via OpenAI-compat endpoint)
 *   POE_MODEL_PRIMARY         — Poe model for creative tasks (default: 'GLM-4.6')
 *   POE_MODEL_CHEAP           — Poe model for decisions / moderation (default: 'GLM-4.6')
 *   ANTHROPIC_API_KEY         — direct Anthropic Claude key
 *   ANTHROPIC_MODEL_PRIMARY   — direct Anthropic model (default: 'claude-sonnet-4-6')
 *   ANTHROPIC_MODEL_CHEAP     — direct Anthropic cheap model (default: 'claude-haiku-4-5')
 *   AI_PROVIDER               — 'auto' | 'zai' | 'poe' | 'anthropic' (default: 'auto', prefers zai)
 *
 *   OPENAI_API_KEY            — OpenAI image generation key (consumed by image/)
 *   OPENAI_IMAGE_MODEL        — image model (default: 'gpt-image-2'; consumed by image/)
 *
 * No file I/O, no DI. If you need test isolation, pass `overrides` to `loadLLMConfig`.
 */

export type AIProvider = 'auto' | 'zai' | 'poe' | 'anthropic';

export interface LLMConfig {
  zaiApiKey?: string;
  zaiModelPrimary: string;
  zaiModelCheap: string;
  zaiBaseUrl: string;
  poeApiKey?: string;
  poeModelPrimary: string;
  poeModelCheap: string;
  anthropicApiKey?: string;
  anthropicModelPrimary: string;
  anthropicModelCheap: string;
  aiProvider: AIProvider;
  openaiApiKey?: string;
  openaiImageModel: string;
}

const DEFAULTS = {
  // Z.AI direct (OpenAI-compatible): GLM-5.1 for creative writing, GLM-4.7-FlashX for
  // decisions / moderation. Override via ZAI_MODEL_* env.
  zaiModelPrimary: 'glm-5.1',
  zaiModelCheap: 'GLM-4.7-FlashX',
  zaiBaseUrl: 'https://api.z.ai/api/paas/v4',
  // Chinese-prose quality first: both primary and cheap use GLM-4.6 (Claude's Chinese
  // is weaker than GLM here). Override explicitly via POE_MODEL_* env to switch.
  poeModelPrimary: 'GLM-4.6',
  poeModelCheap: 'GLM-4.6',
  anthropicModelPrimary: 'claude-sonnet-4-6',
  anthropicModelCheap: 'claude-haiku-4-5',
  aiProvider: 'auto' as AIProvider,
  openaiImageModel: 'gpt-image-2',
};

export function loadLLMConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
  const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;
  return {
    zaiApiKey: env.ZAI_API_KEY,
    zaiModelPrimary: env.ZAI_MODEL_PRIMARY ?? DEFAULTS.zaiModelPrimary,
    zaiModelCheap: env.ZAI_MODEL_CHEAP ?? DEFAULTS.zaiModelCheap,
    zaiBaseUrl: env.ZAI_BASE_URL ?? DEFAULTS.zaiBaseUrl,
    poeApiKey: env.POE_API_KEY,
    poeModelPrimary: env.POE_MODEL_PRIMARY ?? DEFAULTS.poeModelPrimary,
    poeModelCheap: env.POE_MODEL_CHEAP ?? DEFAULTS.poeModelCheap,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModelPrimary: env.ANTHROPIC_MODEL_PRIMARY ?? DEFAULTS.anthropicModelPrimary,
    anthropicModelCheap: env.ANTHROPIC_MODEL_CHEAP ?? DEFAULTS.anthropicModelCheap,
    aiProvider: (env.AI_PROVIDER as AIProvider | undefined) ?? DEFAULTS.aiProvider,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiImageModel: env.OPENAI_IMAGE_MODEL ?? DEFAULTS.openaiImageModel,
    ...overrides,
  };
}

/** Returns the active text provider given config, or null if none usable. */
export function resolveTextProvider(config: LLMConfig): 'zai' | 'poe' | 'anthropic' | null {
  const pref = config.aiProvider;
  if (pref === 'zai') return config.zaiApiKey ? 'zai' : null;
  if (pref === 'poe') return config.poeApiKey ? 'poe' : null;
  if (pref === 'anthropic') return config.anthropicApiKey ? 'anthropic' : null;
  // auto: Z.AI direct wins (the configured default), then Poe, then Anthropic.
  if (config.zaiApiKey) return 'zai';
  if (config.poeApiKey) return 'poe';
  if (config.anthropicApiKey) return 'anthropic';
  return null;
}
