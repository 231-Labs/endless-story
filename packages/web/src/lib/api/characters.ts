import type { Character, CharacterMagnetism, CharacterRole } from '@endless-story/shared';
import { inferRoleFromText } from '@endless-story/shared';
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
    try {
      const chars = await fetchOnChainCharacters();
      return enrichRoles(chars);
    } catch {
      // 鏈不可達 ≠ 名冊是空的：示範模式退回 mock 名冊讓產品仍可瀏覽；
      // 非示範模式往上拋給 error boundary，而不是渲染成「0 人」。
      if (USE_MOCK) return characters;
      throw new Error('鏈上節點暫時沒回話，名冊讀不出來');
    }
  }
  if (USE_MOCK) return characters;
  return httpGet<Character[]>('/characters');
}

export async function getCharacter(id: string): Promise<Character | null> {
  if (isSuiObjectId(id)) {
    const onChain = await fetchOnChainCharacter(id);
    if (onChain) {
      const recruitment = await resolveRecruitmentForCharacter(id);
      const taggedRole = roleFromPublicTags(onChain);
      const enriched = {
        ...onChain,
        ...(recruitment ? { membership: recruitment.membership } : {}),
        ...(taggedRole
          ? { role: taggedRole as CharacterRole }
          : recruitment
            ? { role: recruitment.specialty as CharacterRole }
            : {}),
      };
      return taggedRole || recruitment ? enriched : enrichRoleFromDescription(onChain);
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
      try {
        const chars = await fetchOnChainCharacters({ sagaId });
        return enrichRoles(chars);
      } catch {
        if (USE_MOCK) return listCharactersBySaga(sagaId);
        throw new Error('鏈上節點暫時沒回話，班底讀不出來');
      }
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

async function resolveRecruitmentForCharacter(
  characterId: string,
): Promise<Awaited<ReturnType<typeof getStoreRecruitment>>> {
  const recruitmentId = await fetchRecruitmentIdForCharacter(characterId);
  if (!recruitmentId) return null;
  return getStoreRecruitment(recruitmentId);
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
    const taggedRole = roleFromPublicTags(c);
    const rid = recruitIdMap.get(c.id);
    const recruitment = rid ? recruitmentsById.get(rid) : null;
    if (taggedRole || recruitment) {
      return {
        ...c,
        ...(recruitment ? { membership: recruitment.membership } : {}),
        role: (taggedRole ?? recruitment?.specialty ?? c.role) as CharacterRole,
      };
    }
    return enrichRoleFromDescription(c);
  });
}

function roleFromPublicTags(character: Character): string | null {
  const tag = character.publicTags?.find((t) => t.label.startsWith('role:'));
  return tag ? tag.label.slice('role:'.length) : null;
}

function enrichRoleFromDescription(character: Character): Character {
  const inferred = inferRoleFromText(character.description);
  return inferred ? { ...character, role: inferred as CharacterRole } : character;
}
