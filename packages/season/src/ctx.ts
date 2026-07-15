import type { Ask } from './llm.ts';
import type { SeasonConfig } from './types.ts';

/** Threaded through perceive / distill / enact so they can resolve names + use the LLM. */
export interface Ctx {
  /** character id → display name. */
  names: Record<string, string>;
  ask: Ask;
  config: SeasonConfig;
}

export const nameOf = (ctx: Ctx, id: string): string => ctx.names[id] ?? id;
