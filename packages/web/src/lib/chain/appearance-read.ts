/**
 * On-chain appearance read — public, verifiable, no backend/DB.
 *
 * The 形貌 description is stored on the **content road** (Walrus blob +
 * `commitment::commit`), exactly like persona, under its OWN derived subject
 * namespace (`sha256(characterId + ":appearance")`) so it never collides with
 * chapter / persona commitments. `subject_id` is free-form (`bcs::Address`), so
 * this is legal with no contract change. Read = latest appearance commitment for
 * that subject → decode the Walrus blob id → fetch the public blob → parse JSON.
 */
import type { CharacterAppearance } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { blob as memwalBlob } from '@endless-story/memwal';
import { resolveNetwork } from './network.js';
import { decodeByteString } from './decode.js';
export { appearanceSubject } from './appearance-subject.js';
import { appearanceSubject } from './appearance-subject.js';

function walrusNetwork(): 'testnet' | 'mainnet' {
  return resolveNetwork() === 'mainnet' ? 'mainnet' : 'testnet';
}

/** Fetch a character's current 形貌 from chain, or null if none anchored yet. Never throws. */
export async function fetchOnChainAppearance(characterId: string): Promise<CharacterAppearance | null> {
  const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
  if (!pkg) return null;
  const client = makeSuiClient({ network: resolveNetwork() });
  try {
    const latest = await read.commitment.findLatestCommitment(client, pkg, {
      subjectId: appearanceSubject(characterId),
    });
    if (!latest) return null;
    const res = await read.commitment.getCommitment(client, latest.commitmentId);
    const json = res.json as unknown as { blob_id?: number[] | string };
    const blobId = decodeByteString(json.blob_id);
    if (!blobId) return null;
    const bytes = await memwalBlob.fetchBlob(blobId, walrusNetwork());
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<CharacterAppearance>;
    if (typeof parsed.description !== 'string' || !parsed.description.trim()) return null;
    return {
      characterId,
      description: parsed.description.trim(),
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      updatedAt: parsed.updatedAt ?? new Date(Number(latest.committedAtMs) || Date.now()).toISOString(),
      lastRegenTrigger: parsed.lastRegenTrigger,
      lastRegenChapterId: parsed.lastRegenChapterId,
    };
  } catch (err) {
    console.warn('[appearance-read] fetch failed:', err);
    return null;
  }
}
