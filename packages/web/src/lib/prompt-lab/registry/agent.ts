// Build/parse behavior for the director + character-agent + character-worker prompts.
// Metadata + fixtures live client-safe in ../catalog.ts; this is server-only.

import { director, characterAgent, characterWorker } from '@endless-story/runner';
import type { PromptBehavior } from '@endless-story/llm/prompts';
import type { PromptLabCallId } from '../catalog';
import { sysUser, asRecord, typed, stringField, stringArrayField, parseJsonObject, proseStats } from './helpers';

export const agentDefs: Partial<Record<PromptLabCallId, PromptBehavior<unknown, unknown>>> = {
  'director.intent': {
    build: (input) => {
      const obj = asRecord(input);
      return sysUser(
        director.buildDirectorSystemPrompt(),
        director.buildDirectorUserPrompt(typed(asRecord(obj.snapshot)), stringField(obj, 'intent')),
        1500,
      );
    },
    parse: (raw) => ({ parsed: parseJsonObject(raw) ?? { parseFailed: true }, note: 'director JSON response' }),
  },
  'tick.plan': {
    build: (input) => sysUser(characterAgent.buildPlanSystemPrompt(), characterAgent.buildPlanUserPrompt(typed(input)), 400),
    parse: (raw) => ({ parsed: parseJsonObject(raw) ?? { parseFailed: true }, note: 'plan JSON response' }),
  },
  'tick.move': {
    build: (input) => sysUser(characterAgent.buildMoveSystemPrompt(), characterAgent.buildMoveUserPrompt(typed(input)), 200),
    parse: (raw) => ({ parsed: parseJsonObject(raw) ?? { parseFailed: true }, note: 'move JSON response; runtime clamps invalid scene ids to stay-put' }),
  },
  'tick.social': {
    build: (input) => sysUser(characterAgent.buildSocialSystemPrompt(), characterAgent.buildSocialUserPrompt(typed(input)), 360),
    parse: (raw) => ({ parsed: parseJsonObject(raw) ?? { parseFailed: true }, note: 'social JSON response; runtime sanitizes unsupported shared past / heavy motifs' }),
  },
  'tick.act': {
    build: (input) => sysUser(characterAgent.buildActSystemPrompt(), characterAgent.buildActUserPrompt(typed(input)), 400),
    parse: (raw) => ({ parsed: parseJsonObject(raw) ?? { parseFailed: true }, note: 'act JSON response; runtime clamps catalogIndex to hand' }),
  },
  'tick.pov': {
    build: (input) => sysUser(characterWorker.buildPovSystemPrompt(), characterWorker.buildPovUserPrompt(typed(input)), 1800),
    parse: (raw) => ({ parsed: proseStats(raw), note: 'POV prose stats' }),
  },
  'tick.povRevision': {
    build: (input) => {
      const obj = asRecord(input);
      const motifs = stringArrayField(obj, 'motifs') ?? [];
      return sysUser(characterWorker.buildRevisionSystemPrompt(), characterWorker.buildRevisionUserPrompt(stringField(obj, 'chapter'), motifs), 1800);
    },
    parse: (raw) => ({ parsed: proseStats(raw), note: 'revision prose stats' }),
  },
};
