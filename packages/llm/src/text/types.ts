/**
 * Provider-agnostic text chat types.
 *
 * Avoid leaking Anthropic / Poe response shapes into callers — they should
 * pattern-match on this narrow surface only.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

/** A part of a multimodal message — text or an image (vision models). */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: ChatRole;
  /** plain text, or multimodal parts (text + image_url) for vision models. */
  content: string | ChatContentPart[];
}

export interface ChatRequest {
  /** Provider model id (e.g. 'Claude-Sonnet-4.6' or 'claude-sonnet-4-6'). */
  model: string;
  messages: ChatMessage[];
  /** System prompt — separated for Anthropic-style API parity. */
  system?: string;
  maxTokens: number;
  /** 0..1 sampling temperature. Ignored when extended-thinking enabled. */
  temperature?: number;
  /** Enable extended thinking with budget. Provider may ignore if unsupported. */
  thinking?: { budgetTokens: number };
}

export interface ChatResponse {
  /** Concatenated assistant text. */
  text: string;
  /** Provider model id that actually served the request (may differ on fallback). */
  model: string;
  /** Provider tag. */
  provider: 'zai' | 'poe' | 'anthropic';
  /** Token usage if available. */
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface TextClient {
  provider: 'zai' | 'poe' | 'anthropic';
  /** Default model id for this client (primary or cheap, depending on construction). */
  defaultModel: string;
  chat(req: Omit<ChatRequest, 'model'> & { model?: string }): Promise<ChatResponse>;
}
