/**
 * OpenAI gpt-image-2 adapter — direct REST.
 *
 * Notes from the old repo's image-client.ts:
 * - gpt-image-2 does NOT accept `response_format`; it defaults to b64_json.
 * - gpt-image-2 has no `subject_reference`; face-consistency requires
 *   the /v1/images/edits multipart upload (deferred to Phase 4).
 * - Quality 'medium' is a sensible default — 'high' is much slower / costlier.
 * - 4:5 aspect maps to the closest portrait `1024x1536` (2:3).
 */

import type {
  AspectRatio,
  ImageClient,
  ImageQuality,
  ImageRequest,
  ImageResponse,
} from './types.js';

export class ImageHttpError extends Error {
  constructor(
    public status: number,
    public provider: 'openai',
    public model: string,
    bodySnippet: string,
  ) {
    super(`[image:${provider}] HTTP ${status} on ${model}: ${bodySnippet}`);
    this.name = 'ImageHttpError';
  }
}

const ENDPOINT = 'https://api.openai.com/v1/images/generations';

const ASPECT_TO_SIZE: Record<AspectRatio, string> = {
  '1:1': '1024x1024',
  '16:9': '1536x1024',
  '9:16': '1024x1536',
  '4:3': '1536x1024',
  '3:4': '1024x1536',
  '4:5': '1024x1536',
  '5:4': '1536x1024',
};

interface OpenAIImageRaw {
  data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  error?: { message?: string; type?: string };
}

export interface OpenAIImageClientOptions {
  apiKey: string;
  model: string;
  defaultQuality?: ImageQuality;
}

export function createOpenAIImageClient(opts: OpenAIImageClientOptions): ImageClient {
  const { apiKey, model, defaultQuality = 'medium' } = opts;

  const generate: ImageClient['generate'] = async (req) => {
    const n = Math.max(1, Math.min(9, Math.floor(req.n ?? 1)));
    const size = req.aspectRatio ? ASPECT_TO_SIZE[req.aspectRatio] : 'auto';
    const reqModel = req.model ?? model;
    const body: Record<string, unknown> = {
      model: reqModel,
      prompt: req.prompt,
      n,
      size,
      quality: req.quality ?? defaultQuality,
    };

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ImageHttpError(res.status, 'openai', reqModel, text.slice(0, 400));
    }

    const data = (await res.json()) as OpenAIImageRaw;
    if (data.error) {
      throw new Error(`OpenAI image ${data.error.type ?? 'error'}: ${data.error.message ?? 'unknown'}`);
    }
    const items = data.data ?? [];
    if (items.length === 0) {
      throw new Error('OpenAI image: empty data array');
    }

    return {
      provider: 'openai',
      model: reqModel,
      images: items.map((it) => ({
        url: it.url,
        base64: it.b64_json,
        revisedPrompt: it.revised_prompt,
      })),
    };
  };

  return { provider: 'openai', defaultModel: model, generate };
}
