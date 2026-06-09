// Server-only behavior registry — every lab prompt's build/parse, keyed by call id.
// Replaces the old buildPrompt switch in prompt-lab.ts (which now just looks up here).
// Metadata + fixtures are client-safe and live in ./catalog.ts; this file imports
// runner/llm builders, so it must never be pulled into the client bundle (only the
// 'use server' prompt-lab.ts imports it). See docs/PROMPTS.md.

import type { PromptBehavior } from '@endless-story/llm/prompts';
import type { PromptLabCallId } from './catalog';
import { recruitDefs } from './registry/recruit';
import { agentDefs } from './registry/agent';
import { worldDefs } from './registry/world';
import { socialDefs } from './registry/social';
import { imageDefs } from './registry/image';

function beh(id: PromptLabCallId): PromptBehavior<unknown, unknown> {
  const b = recruitDefs[id] ?? agentDefs[id] ?? worldDefs[id] ?? socialDefs[id] ?? imageDefs[id];
  if (!b) throw new Error(`prompt registry: missing behavior for ${id}`);
  return b;
}

// Typed as a total Record so a missing id is a compile error.
export const PROMPT_REGISTRY: Record<PromptLabCallId, PromptBehavior<unknown, unknown>> = {
  'recruit.moderation': beh('recruit.moderation'),
  'recruit.character': beh('recruit.character'),
  'recruit.portraitCuration': beh('recruit.portraitCuration'),
  'persona.distill': beh('persona.distill'),
  'character.publicTags': beh('character.publicTags'),
  'director.intent': beh('director.intent'),
  'tick.plan': beh('tick.plan'),
  'tick.move': beh('tick.move'),
  'tick.drama': beh('tick.drama'),
  'tick.social': beh('tick.social'),
  'tick.act': beh('tick.act'),
  'tick.pov': beh('tick.pov'),
  'tick.povRevision': beh('tick.povRevision'),
  'tick.sleepConsolidate': beh('tick.sleepConsolidate'),
  'tick.gazette': beh('tick.gazette'),
  'memory.genesis': beh('memory.genesis'),
  'dream.moderator': beh('dream.moderator'),
  'reflection.character': beh('reflection.character'),
  'relationship.assess': beh('relationship.assess'),
  'induction.intro': beh('induction.intro'),
  'image.portraitVariant': beh('image.portraitVariant'),
  'image.artSheet': beh('image.artSheet'),
  'image.evolve': beh('image.evolve'),
  'image.eventMoment': beh('image.eventMoment'),
};
