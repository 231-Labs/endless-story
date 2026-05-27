import type { Character, CharacterMagnetism, CharacterRole } from '@endless-story/shared';
import { characters, getCharacterById, listCharactersBySaga } from '@/mocks/characters';
import { magnetismByCharacterId } from '@/mocks/magnetism';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { USE_MOCK } from './config';
import { httpGet } from './http';
import {
  fetchOnChainCharacter,
  fetchOnChainCharacters,
  fetchOnChainCharactersByOwner,
  isSuiObjectId,
} from '@/lib/chain/character-read';
import {
  fetchRecruitmentIdForCharacter,
  fetchRecruitmentIdMapForCharacters,
} from '@/lib/chain/voucher-read';
import { getStoreRecruitment } from '@/lib/actions/recruitments-store';

/**
 * Characters API
 *
 * Chain-first when the deployment is live (packageId set). Falls back to
 * mocks during local dev / before bootstrap. Magnetism / relationships
 * remain mock-only — they're off-chain enrichment, Phase 4 runner work.
 *
 * Role enrichment lives at the facade layer (not in chain mapper):
 * chain `Character` has no role field, so we trace voucher hint →
 * off-chain Recruitment.specialty and overlay. Single-character paths
 * do one event scan; list paths batch via
 * `fetchRecruitmentIdMapForCharacters` so we don't fan out N scans.
 *
 * Backend HTTP endpoints (legacy, USE_MOCK=false path):
 *   GET  /characters[?sagaId=|ownedBy=]
 *   GET  /characters/{id}[/magnetism]
 */

function isDeployed(): boolean {
  return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}

export async function listCharacters(): Promise<Character[]> {
  if (isDeployed()) {
    const chars = await fetchOnChainCharacters();
    return enrichRoles(chars);
  }
  if (USE_MOCK) return characters;
  return httpGet<Character[]>('/characters');
}

export async function getCharacter(id: string): Promise<Character | null> {
  if (isSuiObjectId(id)) {
    const onChain = await fetchOnChainCharacter(id);
    if (onChain) {
      const role = await resolveRoleFromVoucher(id);
      return role ? { ...onChain, role } : onChain;
    }
  }
  if (USE_MOCK) return getCharacterById(id) ?? null;
  try {
    return await httpGet<Character>(`/characters/${id}`);
  } catch {
    return null;
  }
}

export async function listSagaCharacters(sagaId: string): Promise<Character[]> {
  if (isDeployed()) {
    if (isSuiObjectId(sagaId)) {
      const chars = await fetchOnChainCharacters({ sagaId });
      return enrichRoles(chars);
    }
  }
  if (USE_MOCK) return listCharactersBySaga(sagaId);
  return httpGet<Character[]>('/characters', { query: { sagaId } });
}

export async function listOwnedCharacters(wallet: string): Promise<Character[]> {
  if (isSuiObjectId(wallet)) {
    const chars = await fetchOnChainCharactersByOwner(wallet);
    return enrichRoles(chars);
  }
  if (USE_MOCK) return characters.filter((c) => c.nftOwner === wallet);
  return httpGet<Character[]>('/characters', { query: { ownedBy: wallet } });
}

export async function getMagnetism(characterId: string): Promise<CharacterMagnetism | null> {
  if (USE_MOCK) return magnetismByCharacterId[characterId] ?? null;
  try {
    return await httpGet<CharacterMagnetism>(`/characters/${characterId}/magnetism`);
  } catch {
    return null;
  }
}

/* ── role enrichment helpers ────────────────────────────────────── */

async function resolveRoleFromVoucher(characterId: string): Promise<CharacterRole | null> {
  const recruitmentId = await fetchRecruitmentIdForCharacter(characterId);
  if (!recruitmentId) return null;
  const recruitment = await getStoreRecruitment(recruitmentId);
  if (!recruitment) return null;
  // Recruitment.specialty is `CharacterRole | string`; the runtime
  // value may be outside the union (e.g. "富商"). Cast through —
  // CharacterPortrait + role-display surfaces all tolerate unknowns.
  return recruitment.specialty as CharacterRole;
}

async function enrichRoles(chars: Character[]): Promise<Character[]> {
  if (chars.length === 0) return chars;
  const recruitIdMap = await fetchRecruitmentIdMapForCharacters(chars.map((c) => c.id));
  // Dedupe recruitment ids → single off-chain fetch per id.
  const uniqRecruitIds = Array.from(
    new Set(
      Array.from(recruitIdMap.values()).filter((v): v is string => v != null),
    ),
  );
  const recruitmentsById = new Map<string, Awaited<ReturnType<typeof getStoreRecruitment>>>();
  await Promise.all(
    uniqRecruitIds.map(async (rid) => {
      recruitmentsById.set(rid, await getStoreRecruitment(rid));
    }),
  );
  return chars.map((c) => {
    const rid = recruitIdMap.get(c.id);
    const recruitment = rid ? recruitmentsById.get(rid) : null;
    if (!recruitment) return c;
    return { ...c, role: recruitment.specialty as CharacterRole };
  });
}
