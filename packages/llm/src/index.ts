/**
 * @endless-story/llm — the **only** entry point for external AI services.
 *
 * Mirrors `@endless-story/memwal`: web / runner / cli MUST go through here.
 * Never call Poe / Anthropic / OpenAI directly from app code — see AGENTS.md
 * 「鏈上架構」原則 4.
 *
 * Subpath exports:
 *   - `@endless-story/llm/text`    — Poe / Anthropic chat completions
 *   - `@endless-story/llm/image`   — OpenAI gpt-image-2
 *   - `@endless-story/llm/prompts` — character / portrait / moderation templates
 *   - `@endless-story/llm/seed`    — deterministic HKDF roll from voucher seed
 *
 * The top-level export bundles namespaces for consumers that want a single
 * import:
 * ```ts
 * import { text, image, prompts, seed } from '@endless-story/llm';
 * ```
 */

export * as text from './text/index.js';
export * as image from './image/index.js';
export * as prompts from './prompts/index.js';
export * as seed from './seed/index.js';

export { loadLLMConfig, resolveTextProvider, type LLMConfig, type AIProvider } from './config.js';
