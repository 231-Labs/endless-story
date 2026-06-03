/**
 * Generate + anchor a character's 本色 (persona).
 *
 * Distils 軸/腔/界 from the on-chain public profile via the LLM, then anchors the persona JSON on
 * the content road (public Walrus blob + `commitment::commit`, on its own derived subject
 * namespace — see persona-read.ts). Public + verifiable, no backend/DB.
 *
 * Called from `redeemVoucher`'s `after()` (first_run) so it never blocks the mint; a failure is
 * swallowed (the Character is already on chain). Re-distillation at saga-arc / manual is a later
 * trigger (version++ → a new commitment for the same subject; read always takes the latest).
 */
import type { CharacterPersona } from '@endless-story/shared';
import { text as llmText, prompts as llmPrompts } from '@endless-story/llm';
import { signAndAnchorBatch } from '@endless-story/runner';
import { fetchOnChainCharacter } from '../chain/character-read.js';
import { getAdminContext } from '../chain/admin-signer.js';
import { personaSubject } from '../chain/persona-read.js';

export interface GeneratePersonaResult {
  ok: boolean;
  version?: number;
  commitmentId?: string;
  skipped?: string;
  error?: string;
}

export async function generatePersonaAction(characterId: string): Promise<GeneratePersonaResult> {
  let character;
  try {
    character = await fetchOnChainCharacter(characterId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!character) return { ok: false, skipped: 'character_unreachable' };
  if (!character.sagaId) return { ok: false, skipped: 'no_saga' };

  // 1. Distil 軸/腔/界 from the public profile.
  let distilled;
  try {
    const llm = llmText.createTextClient({ kind: 'primary' });
    const prompt = llmPrompts.buildPersonaPrompt({
      name: character.name,
      role: character.role,
      gender: character.gender,
      ageYears: character.age,
      physicalFacts: character.physicalFacts,
      description: character.description,
    });
    const res = await llm.chat({
      model: llm.defaultModel,
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: prompt.maxTokens,
      temperature: 0.85,
    });
    distilled = llmPrompts.parsePersonaResponse(res.text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!distilled) return { ok: false, skipped: 'parse_failed' };

  // 2. Anchor the persona doc (public Walrus blob + commitment, own subject namespace).
  const persona: CharacterPersona = {
    characterId,
    axes: distilled.axes,
    mannerisms: distilled.mannerisms,
    boundaries: distilled.boundaries,
    version: 1,
    updatedAt: new Date().toISOString(),
    lastRegenTrigger: 'first_run',
  };
  try {
    const admin = getAdminContext();
    const content = new TextEncoder().encode(JSON.stringify(persona));
    const [anchor] = await signAndAnchorBatch(
      [
        {
          sagaId: character.sagaId,
          subjectId: personaSubject(characterId),
          content,
          contentType: 'application/json',
        },
      ],
      { signer: admin.signer },
    );
    return { ok: true, version: 1, commitmentId: anchor?.commitmentId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
