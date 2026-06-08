// A prompt defined ONCE: metadata + builder + parser + a default fixture.
//
// Today each prompt is spread across three places that must stay in sync — the
// builder fns, the prompt-lab catalog metadata, and the prompt-lab dispatch switch.
// A PromptDefinition bundles all three so the lab (and any caller) can be driven from
// a single registry. The builder text is unchanged; this only changes how it's wired.
//
// Lives in `llm` (the lowest AI layer) so both llm and runner prompt modules can
// export a definition without violating dependency direction (runner → llm, never up).

import type { BuildPromptResult } from './moderation.js';

export type PromptKind = 'cheap' | 'primary' | 'deterministic';

export interface PromptMeta {
  id: string;
  phase: string;
  title: string;
  shortTitle: string;
  kind: PromptKind;
  summary: string;
  // One-line illustration of the expected output, e.g. '{"verdict":"ok|not_ok"}'.
  outputShape: string;
  defaultTemperature?: number;
  // Where this prompt runs for real, surfaced in the lab UI.
  existingTool?: { label: string; href: string; note: string };
}

export interface ParsedOutput<TOutput> {
  parsed: TOutput;
  note?: string;
}

export interface PromptDefinition<TInput, TOutput> {
  meta: PromptMeta;
  // Fixture used by the prompt-lab "run" / "inspect" modes.
  defaultInput: TInput;
  // Build the chat prompt (system + messages + maxTokens). Verbatim wrap of the
  // existing build*Prompt() / build*SystemPrompt()+build*UserPrompt() functions.
  build(input: TInput): BuildPromptResult;
  parse(raw: string): ParsedOutput<TOutput>;
}

// Identity helper for inference + a single place to evolve the contract.
export function definePrompt<TInput, TOutput>(
  def: PromptDefinition<TInput, TOutput>,
): PromptDefinition<TInput, TOutput> {
  return def;
}
