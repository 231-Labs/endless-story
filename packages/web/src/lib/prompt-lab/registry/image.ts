// Build/parse behavior for the deterministic image-generation prompts (additional
// views, evolve-portrait variant, event moment). These prompts are sent to the
// IMAGE model (gpt-image / edit), not a chat LLM — so they're built directly from
// the shared @/lib/image-prompts templates with no parse step. Metadata + fixtures
// live client-safe in ../catalog.ts; this is server-only.

import type { PromptBehavior } from '@endless-story/llm/prompts';
import type { PromptLabCallId } from '../catalog';
import { asRecord, stringField } from './helpers';
import { portraitVariantPrompt, artSheetPrompt, evolveVariantPrompt, eventMomentPrompt } from '@/lib/image-prompts';

const det = (build: (input: unknown) => string): PromptBehavior<unknown, unknown> => ({
  build: (input) => ({ messages: [{ role: 'user', content: build(input) }], maxTokens: 0 }),
  parse: () => ({ parsed: { note: 'deterministic image prompt — sent to the image model (gpt-image / edit), not a chat LLM' } }),
});

export const imageDefs: Partial<Record<PromptLabCallId, PromptBehavior<unknown, unknown>>> = {
  'image.portraitVariant': det((i) => portraitVariantPrompt(stringField(asRecord(i), 'person'))),
  'image.artSheet':        det((i) => artSheetPrompt(stringField(asRecord(i), 'person'))),
  'image.evolve':          det((i) => { const o = asRecord(i); return evolveVariantPrompt(stringField(o, 'personLine'), stringField(o, 'framing')); }),
  'image.eventMoment':     det((i) => { const o = asRecord(i); return eventMomentPrompt({ cast: stringField(o, 'cast'), sceneName: stringField(o, 'sceneName'), label: stringField(o, 'label') }); }),
};
