'use server';

/**
 * Generate + anchor a character's 形貌 (appearance description).
 *
 * Distils a vivid appearance paragraph from the on-chain public profile via the
 * LLM, then anchors it on the content road (public Walrus blob +
 * `commitment::commit`, own derived subject namespace — see appearance-read.ts).
 * Public + verifiable, no backend/DB. Sibling of `generate-persona`.
 *
 * Called from `redeemVoucher`'s `after()` (first_run) so it never blocks the
 * mint; a failure is swallowed (the Character is already on chain). Re-distilled
 * on portrait evolution (version++ → a new commitment for the same subject; read
 * always takes the latest), which is how the look is allowed to drift over time
 * WITHOUT bloating the lean on-chain `physical_facts` identity anchor.
 */
import type { CharacterAppearance } from '@endless-story/shared';
import { text as llmText, prompts as llmPrompts } from '@endless-story/llm';
import { signAndAnchorBatch } from '@endless-story/runner';
import { fetchOnChainCharacter } from '../chain/character-read.js';
import { getAdminContext } from '../chain/admin-signer.js';
import { appearanceSubject } from '../chain/appearance-read.js';

export interface GenerateAppearanceResult {
  ok: boolean;
  version?: number;
  commitmentId?: string;
  skipped?: string;
  error?: string;
  /** The freshly distilled 形貌 — returned so an admin re-distill UI can show it
   *  without a (possibly lagging) chain re-read. */
  appearance?: CharacterAppearance;
}

export async function generateAppearanceAction(characterId: string): Promise<GenerateAppearanceResult> {
  let character;
  try {
    character = await fetchOnChainCharacter(characterId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!character) return { ok: false, skipped: 'character_unreachable' };
  if (!character.sagaId) return { ok: false, skipped: 'no_saga' };

  // 1. Distil the 形貌 paragraph from the public profile.
  let distilled;
  try {
    const llm = llmText.createTextClient({ kind: 'primary' });
    const prompt = llmPrompts.buildAppearancePrompt({
      name: character.name,
      role: character.role,
      gender: character.gender,
      ageYears: character.age,
      physicalFacts: character.physicalFacts,
      description: character.description,
      appearance: character.attributes?.appearance,
    });
    const res = await llm.chat({
      model: llm.defaultModel,
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: prompt.maxTokens,
      temperature: 0.8,
    });
    distilled = llmPrompts.parseAppearanceResponse(res.text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!distilled) return { ok: false, skipped: 'parse_failed' };

  // 2. Anchor the appearance doc (public Walrus blob + commitment, own subject namespace).
  const appearance: CharacterAppearance = {
    characterId,
    description: distilled.description,
    version: 1,
    updatedAt: new Date().toISOString(),
    lastRegenTrigger: 'first_run',
  };
  try {
    const admin = getAdminContext();
    const content = new TextEncoder().encode(JSON.stringify(appearance));
    const [anchor] = await signAndAnchorBatch(
      [
        {
          sagaId: character.sagaId,
          subjectId: appearanceSubject(characterId),
          content,
          contentType: 'application/json',
        },
      ],
      { signer: admin.signer },
    );
    return { ok: true, version: 1, commitmentId: anchor?.commitmentId, appearance };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
