// Build/parse behavior for the relationship-assess + induction prompts (runner builders).
// Metadata + fixtures live client-safe in ../catalog.ts; this is server-only.

import { relationshipAssess, induction } from '@endless-story/runner';
import type { PromptBehavior } from '@endless-story/llm/prompts';
import type { PromptLabCallId } from '../catalog';
import { sysUser, asRecord, typed, parseJsonObject } from './helpers';

export const socialDefs: Partial<Record<PromptLabCallId, PromptBehavior<unknown, unknown>>> = {
  'relationship.assess': {
    build: (input) =>
      sysUser(
        relationshipAssess.buildRelationshipSystemPrompt(),
        relationshipAssess.buildRelationshipUserPrompt(typed(input)),
        3600,
      ),
    parse: (raw) => ({ parsed: parseJsonObject(raw) ?? { parseFailed: true }, note: 'relationship assess JSON response' }),
  },
  'induction.intro': {
    build: (input) => {
      const obj = asRecord(input);
      return sysUser(
        induction.buildInductionSystemPrompt(typed(obj.mode)),
        induction.buildInductionUserPrompt(typed(input)),
        6400,
      );
    },
    parse: (raw) => ({ parsed: parseJsonObject(raw) ?? { parseFailed: true }, note: 'induction JSON response' }),
  },
};
