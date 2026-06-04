/**
 * Public surface of `@endless-story/llm/prompts`.
 *
 * Each module exports `build*Prompt(...)` returning a `BuildPromptResult`
 * (system + messages + maxTokens) — feed straight to `TextClient.chat`.
 * Where applicable, a matching `parse*` decodes the model output.
 */

export {
  DEFAULT_MODERATION_RULES,
  USER_PROMPT_MIN,
  USER_PROMPT_MAX,
  buildModerationPrompt,
  parseModerationResult,
  type BuildModerationPromptOptions,
  type BuildPromptResult,
  type ModerationResult,
  type ModerationVerdict,
} from './moderation.js';

export {
  buildCharacterGenPrompt,
  parseCharacterCandidate,
  type AttributeKey,
  type BuildCharacterGenPromptOptions,
  type CharacterCandidate,
  type RolledAttribute,
} from './character.js';

export {
  buildPortraitCurationPrompt,
  parsePortraitPrompt,
  UNIVERSAL_PORTRAIT_TONE,
  type CharacterForPortrait,
  type PortraitCurationOptions,
} from './portrait.js';

export {
  buildPersonaPrompt,
  parsePersonaResponse,
  type BuildPersonaPromptOptions,
  type DistilledPersona,
} from './persona.js';

export {
  buildPublicTagsPrompt,
  parsePublicTags,
  type BuildPublicTagsPromptOptions,
  type PublicTagsResult,
} from './public-tags.js';
