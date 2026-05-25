/**
 * Public surface of `@endless-story/llm/text`.
 */

export { createTextClient, type CreateTextClientOptions } from './client.js';
export {
  POE_MODELS,
  PRIMARY_MODELS,
  CHEAP_MODELS,
  TIER_LABEL,
  THINKING_MODELS,
  getFallbackModels,
  type PoeModel,
  type PoeModelTier,
} from './models.js';
export { LLMHttpError, isRetryableError } from './providers.js';
export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatRole,
  TextClient,
} from './types.js';
