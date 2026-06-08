// Build/parse behavior for the recruit-time + persona prompts (llm builders).
// Metadata + fixtures live client-safe in ../catalog.ts; this is server-only.

import {
  buildModerationPrompt,
  parseModerationResult,
  buildCharacterGenPrompt,
  parseCharacterCandidate,
  buildPortraitCurationPrompt,
  parsePortraitPrompt,
  buildPersonaPrompt,
  parsePersonaResponse,
  type PromptBehavior,
} from '@endless-story/llm/prompts';
import { DEFAULT_ATTRIBUTE_SCHEMA } from '@/lib/config/attribute-schema';
import type { PromptLabCallId } from '../catalog';
import { asRecord, typed, stringField, optionalStringField, stringArrayField, rolledValuesFrom } from './helpers';

export const recruitDefs: Partial<Record<PromptLabCallId, PromptBehavior<unknown, unknown>>> = {
  'recruit.moderation': {
    build: (input) => {
      const obj = asRecord(input);
      return buildModerationPrompt({
        userPrompt: stringField(obj, 'userPrompt'),
        rulesText: optionalStringField(obj, 'rulesText'),
      });
    },
    parse: (raw) => ({ parsed: parseModerationResult(raw), note: 'moderation parser' }),
  },
  'recruit.character': {
    build: (input) => {
      const obj = asRecord(input);
      return buildCharacterGenPrompt({
        userPrompt: stringField(obj, 'userPrompt'),
        recruitmentIntent: optionalStringField(obj, 'recruitmentIntent'),
        castNames: stringArrayField(obj, 'castNames'),
        storyTags: stringArrayField(obj, 'storyTags'),
        schemaKeys: DEFAULT_ATTRIBUTE_SCHEMA,
        rolledValues: rolledValuesFrom(obj.rolledValues),
      });
    },
    parse: (raw, input) => ({
      parsed: parseCharacterCandidate(raw, rolledValuesFrom(asRecord(input).rolledValues)),
      note: 'character candidate parser; server-locked attributes are reattached after parse',
    }),
  },
  'recruit.portraitCuration': {
    build: (input) => {
      const obj = asRecord(input);
      return buildPortraitCurationPrompt(typed(asRecord(obj.character)), {
        toneHint: stringField(obj, 'toneHint'),
        recruitmentIntent: optionalStringField(obj, 'recruitmentIntent'),
      });
    },
    parse: (raw) => ({
      parsed: { prompt: parsePortraitPrompt(raw), chars: parsePortraitPrompt(raw).length },
      note: 'portrait output is the image prompt',
    }),
  },
  'persona.distill': {
    build: (input) => buildPersonaPrompt(typed(input)),
    parse: (raw) => ({ parsed: parsePersonaResponse(raw), note: 'persona 軸/腔/界 parser' }),
  },
};
