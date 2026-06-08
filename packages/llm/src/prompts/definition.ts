// The server-only behavior of a lab prompt: build the chat prompt + parse the output.
//
// Metadata (title / kind / fixture) is client-safe and lives in web's prompt-lab/catalog.ts.
// build/parse are kept separate because they import runner/llm builders (server-only) — the
// prompt-lab admin panel is a client component and must not pull those into its bundle.
// The lab dispatch combines catalog metadata + this behavior; see docs/PROMPTS.md.

import type { BuildPromptResult } from './moderation.js';

export interface ParsedOutput<TOutput> {
  parsed: TOutput;
  note?: string;
}

export interface PromptBehavior<TInput, TOutput> {
  build(input: TInput): BuildPromptResult;
  parse(raw: string, input: TInput): ParsedOutput<TOutput>;
}
