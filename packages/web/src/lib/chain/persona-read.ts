/**
 * On-chain persona (本色) read — public, verifiable, no backend/DB.
 *
 * Persona is stored on the **content road** (Walrus blob + `commitment::commit`), the same as
 * POV chapters / gazette. To avoid colliding with chapter commitments (which use
 * subject = characterId), persona gets its OWN derived subject namespace
 * (`sha256(characterId + ":persona")`) — `subject_id` is free-form (`bcs::Address`), so this is
 * legal and needs no contract change. Read = latest persona commitment for that subject →
 * decode the Walrus blob id → fetch the public blob → parse the persona JSON.
 */
import type { CharacterPersona } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { blob as memwalBlob } from '@endless-story/memwal';
import { resolveNetwork } from './network.js';
export { personaSubject } from './persona-subject.js';
import { personaSubject } from './persona-subject.js';

function walrusNetwork(): 'testnet' | 'mainnet' {
  return resolveNetwork() === 'mainnet' ? 'mainnet' : 'testnet';
}

function decodeByteString(raw: number[] | string | undefined): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  try {
    return new TextDecoder().decode(Uint8Array.from(raw));
  } catch {
    return '';
  }
}

/** Fetch a character's current persona from chain, or null if none anchored yet. Never throws. */
export async function fetchOnChainPersona(characterId: string): Promise<CharacterPersona | null> {
  const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
  if (!pkg) return null;
  const client = makeSuiClient({ network: resolveNetwork() });
  try {
    const latest = await read.commitment.findLatestCommitment(client, pkg, {
      subjectId: personaSubject(characterId),
    });
    if (!latest) return null;
    const res = await read.commitment.getCommitment(client, latest.commitmentId);
    const json = res.json as unknown as { blob_id?: number[] | string };
    const blobId = decodeByteString(json.blob_id);
    if (!blobId) return null;
    const bytes = await memwalBlob.fetchBlob(blobId, walrusNetwork());
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<CharacterPersona>;
    if (
      !Array.isArray(parsed.axes) ||
      !Array.isArray(parsed.mannerisms) ||
      !Array.isArray(parsed.boundaries)
    ) {
      return null;
    }
    return {
      characterId,
      axes: parsed.axes.map(String),
      mannerisms: parsed.mannerisms.map(String),
      boundaries: parsed.boundaries.map(String),
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      updatedAt: parsed.updatedAt ?? new Date(Number(latest.committedAtMs) || Date.now()).toISOString(),
      lastRegenTrigger: parsed.lastRegenTrigger,
      lastRegenChapterId: parsed.lastRegenChapterId,
    };
  } catch (err) {
    console.warn('[persona-read] fetch failed:', err);
    return null;
  }
}
