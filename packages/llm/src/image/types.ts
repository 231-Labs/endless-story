/**
 * Image generation types — provider-agnostic.
 *
 * Phase 2 only ships OpenAI gpt-image-2; the `ImageClient` interface keeps
 * room for MiniMax / Replicate later without callers branching on provider.
 */

export type ImageProvider = 'openai';

export type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '4:5' | '5:4';

export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

export interface ImageRequest {
  prompt: string;
  /** 1–9; default 1 for the recruit flow (1 voucher = 1 portrait). */
  n?: number;
  /** Default '1:1'. Portrait line typically '4:5' (maps to gpt-image-2 1024x1536). */
  aspectRatio?: AspectRatio;
  /** Per-request override; otherwise inherits from client config. */
  quality?: ImageQuality;
  /** Per-request model override (rare). */
  model?: string;
}

export interface GeneratedImage {
  /** Hosted URL — present when the provider returns one (gpt-image-2 returns b64 by default). */
  url?: string;
  /** Base64 PNG payload (no data: prefix). Default for OpenAI gpt-image-2. */
  base64?: string;
  /** Provider's auto-revised prompt (gpt-image-2 surfaces this). */
  revisedPrompt?: string;
}

export interface ImageResponse {
  provider: ImageProvider;
  model: string;
  images: GeneratedImage[];
}

/**
 * img2img edit request — one or more reference images guide a new render of the
 * SAME subject (§11 face-consistency). The model keeps the reference's identity
 * while following the prompt for the new angle / framing / scene.
 */
export interface ImageEditRequest {
  prompt: string;
  /** Reference image bytes (PNG). The first is the primary subject anchor. */
  images: Uint8Array[];
  /** 1–9; default 1. */
  n?: number;
  /** Default '1:1'. */
  aspectRatio?: AspectRatio;
  quality?: ImageQuality;
  model?: string;
}

export interface ImageClient {
  provider: ImageProvider;
  defaultModel: string;
  generate(req: ImageRequest): Promise<ImageResponse>;
  /**
   * img2img edit: render a new image of the SAME subject as the reference
   * image(s), following `prompt` for the new angle / composition. Backed by
   * OpenAI /v1/images/edits (gpt-image-2). This is the §11 face-consistency path.
   */
  edit(req: ImageEditRequest): Promise<ImageResponse>;
}
