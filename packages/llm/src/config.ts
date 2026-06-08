/**
 * LLM runtime config — read from environment variables.
 *
 * **Env vars** (all optional individually; need at least one provider key):
 *   POE_API_KEY               — Poe API key (multi-provider via OpenAI-compat endpoint)
 *   POE_MODEL_PRIMARY         — Poe model for creative tasks (default: 'GLM-4.6')
 *   POE_MODEL_CHEAP           — Poe model for decisions / moderation (default: 'GLM-4.6')
 *   ANTHROPIC_API_KEY         — direct Anthropic Claude key
 *   ANTHROPIC_MODEL_PRIMARY   — direct Anthropic model (default: 'claude-sonnet-4-6')
 *   ANTHROPIC_MODEL_CHEAP     — direct Anthropic cheap model (default: 'claude-haiku-4-5')
 *   AI_PROVIDER               — 'auto' | 'poe' | 'anthropic' (default: 'auto', prefers poe)
 *
 *   OPENAI_API_KEY            — OpenAI image generation key (consumed by image/)
 *   OPENAI_IMAGE_MODEL        — image model (default: 'gpt-image-2'; consumed by image/)
 *
 * No file I/O, no DI. If you need test isolation, pass `overrides` to `loadLLMConfig`.
 */

export type AIProvider = 'auto' | 'poe' | 'anthropic';

export interface LLMConfig {
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
export function resolveTextProvider(config: LLMConfig): 'poe' | 'anthropic' | null {
  const pref = config.aiProvider;
  if (pref === 'poe') return config.poeApiKey ? 'poe' : null;
  if (pref === 'anthropic') return config.anthropicApiKey ? 'anthropic' : null;
  if (config.poeApiKey) return 'poe';
  if (config.anthropicApiKey) return 'anthropic';
  return null;
}
