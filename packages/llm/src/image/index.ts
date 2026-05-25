/**
 * Public surface of `@endless-story/llm/image`.
 */

export { createImageClient, hasImageProvider, type CreateImageClientOptions } from './client.js';
export { ImageHttpError, createOpenAIImageClient, type OpenAIImageClientOptions } from './openai.js';
export type {
  AspectRatio,
  GeneratedImage,
  ImageClient,
  ImageProvider,
  ImageQuality,
  ImageRequest,
  ImageResponse,
} from './types.js';
