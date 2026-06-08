// Build/parse behavior for the reflection / gazette / genesis / dream prompts plus the
// deterministic DRAMA placeholder. Metadata + fixtures live client-safe in ../catalog.ts;
// this is server-only.

import { reflection, gazette, genesisMemory, dream } from '@endless-story/runner';
import type { PromptBehavior } from '@endless-story/llm/prompts';
import type { PromptLabCallId } from '../catalog';
import { sysUser, typed, parseJsonObject, parseJsonArray, proseStats } from './helpers';

export const worldDefs: Partial<Record<PromptLabCallId, PromptBehavior<unknown, unknown>>> = {
  'tick.drama': {
    build: () => ({ messages: [], maxTokens: 0 }),
    parse: () => ({
      parsed: { note: 'DRAMA has no LLM prompt. It derives scarce-resource tension and injects dramaHint downstream.' },
    }),
  },
  'tick.sleepConsolidate': {
    build: (input) => sysUser(reflection.buildConsolidateSystemPrompt(), reflection.buildConsolidateUserPrompt(typed(input)), 500),
    parse: (raw) => ({ parsed: parseJsonArray(raw) ?? { parseFailed: true }, note: 'sleep consolidation JSON array' }),
  },
  'tick.gazette': {
    build: (input) => sysUser(gazette.buildGazetteSystemPrompt(), gazette.buildGazetteUserPrompt(typed(input)), 1500),
    parse: (raw) => ({ parsed: proseStats(raw), note: 'gazette markdown stats' }),
  },
  'memory.genesis': {
    build: (input) => sysUser(genesisMemory.buildGenesisSystemPrompt(), genesisMemory.buildGenesisUserPrompt(typed(input)), 3200),
    parse: (raw) => ({ parsed: parseJsonObject(raw) ?? { parseFailed: true }, note: 'genesis memory JSON response' }),
  },
  'dream.moderator': {
    build: (input) => sysUser(dream.buildDreamModeratorSystemPrompt(), dream.buildDreamModeratorUserPrompt(typed(input)), 800),
    parse: (raw) => ({ parsed: parseJsonObject(raw) ?? { parseFailed: true }, note: 'dream moderator JSON response' }),
  },
  'reflection.character': {
    build: (input) => sysUser(reflection.buildReflectionSystemPrompt(), reflection.buildReflectionUserPrompt(typed(input)), 1500),
    parse: (raw) => ({ parsed: proseStats(raw), note: 'reflection prose stats' }),
  },
};
