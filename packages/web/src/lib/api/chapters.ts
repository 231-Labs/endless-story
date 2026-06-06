import type { Chapter, Character } from '@endless-story/shared';
import {
  chapters,
  getChapterById,
  listChaptersBySaga,
  listPublicChaptersForCharacter,
} from '@/mocks/chapters';
import { USE_MOCK } from './config';
import { httpGet } from './http';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import {
  fetchChapterText,
  fetchPovChapterByCommitment,
  fetchPovChaptersForCharacter,
  fetchPovChaptersForSaga,
  type PovChapterEntry,
} from '@/lib/chain/pov-read';
import {
  fetchOnChainCharacter,
  fetchOnChainCharacters,
  isSuiObjectId,
} from '@/lib/chain/character-read';
import { parseProvenance } from '@/lib/chain/chapter-provenance';

/**
 * Chapters API
 *
 * 後端對應 endpoints：
 *   GET  /chapters?sagaId={id}                       → Chapter[]      (saga 全部章回)
 *   GET  /chapters?sagaId={id}&visibility=public     → Chapter[]      (僅公開)
 *   GET  /chapters?sagaId={id}&latest={n}            → Chapter[]      (最近 N 章)
 *   GET  /chapters?characterId={id}                  → Chapter[]      (該角色出場的公開章回)
 *   GET  /chapters/{id}                              → Chapter | 404
 *
 * 後端應該：
 *   - Chapter.body 從 Walrus blob 拉，blob id 寫在 chapter 上
 *   - visibility = saga_internal 只給 owner / storyteller 看
 */

function isDeployed(): boolean {
  return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}

export async function listChapters(sagaId: string): Promise<Chapter[]> {
  if (isDeployed() && isSuiObjectId(sagaId)) {
    const characters = await fetchOnChainCharacters({ sagaId }).catch(() => [] as Character[]);
    const entries = await fetchPovChaptersForSaga(sagaId, {
      limit: 40,
      characterIds: characters.map((c) => c.id),
    });
    return entriesToChapters(entries, new Map(characters.map((c) => [c.id, c])));
  }
  if (USE_MOCK) return listChaptersBySaga(sagaId);
  return httpGet<Chapter[]>('/chapters', { query: { sagaId } });
}

export async function listPublicChaptersForSubscription(
  characterId: string
): Promise<Chapter[]> {
  if (isDeployed() && isSuiObjectId(characterId)) {
    const character = await fetchOnChainCharacter(characterId).catch(() => null);
    const entries = await fetchPovChaptersForCharacter(characterId, { limit: 12 });
    return entriesToChapters(
      entries,
      new Map(character ? [[character.id, character]] : []),
    );
  }
  if (USE_MOCK) return listPublicChaptersForCharacter(characterId);
  return httpGet<Chapter[]>('/chapters', { query: { characterId } });
}

export async function getChapter(id: string): Promise<Chapter | null> {
  if (isDeployed() && isSuiObjectId(id)) {
    const entry = await fetchPovChapterByCommitment(id);
    if (!entry || !entry.subjectId || entry.subjectId === entry.sagaId) return null;
    const character = await fetchOnChainCharacter(entry.subjectId).catch(() => null);
    const [chapter] = await entriesToChapters(
      [entry],
      new Map(character ? [[character.id, character]] : []),
    );
    return chapter ?? null;
  }
  if (USE_MOCK) return getChapterById(id) ?? null;
  try {
    return await httpGet<Chapter>(`/chapters/${id}`);
  } catch {
    return null;
  }
}

export async function listLatestChapters(sagaId: string, limit = 5): Promise<Chapter[]> {
  if (isDeployed() && isSuiObjectId(sagaId)) {
    const list = await listChapters(sagaId);
    return list.slice(0, limit);
  }
  if (USE_MOCK) {
    return chapters
      .filter((c) => c.sagaId === sagaId && c.visibility === 'public_chapter')
      .sort((a, b) => b.day - a.day || b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  return httpGet<Chapter[]>('/chapters', {
    query: { sagaId, latest: limit, visibility: 'public' },
  });
}

async function entriesToChapters(
  entries: PovChapterEntry[],
  charactersById: Map<string, Character>,
): Promise<Chapter[]> {
  const dayByCommitment = buildOrdinalDayMap(entries);
  const chapters = await Promise.all(
    entries.map(async (entry): Promise<Chapter | null> => {
      let raw = '';
      try {
        raw = (await fetchChapterText(entry.blobUrl)).trim();
      } catch {
        raw = '';
      }
      if (!raw) return null;
      // Split off the embedded provenance header → verifiable source event +
      // real involved cast; render only the clean prose.
      const { provenance, body: parsedBody } = parseProvenance(raw);
      const body = parsedBody.trim();
      if (!body) return null;
      const character = charactersById.get(entry.subjectId);
      const involved =
        provenance?.involvedIds && provenance.involvedIds.length > 0
          ? provenance.involvedIds
          : [entry.subjectId];
      return {
        id: entry.commitmentId,
        sagaId: entry.sagaId,
        day: provenance?.day ?? extractDay(body) ?? dayByCommitment.get(entry.commitmentId) ?? 1,
        title: titleForChapter(body, character),
        body,
        mediaType: 'text',
        povCharacterId: entry.subjectId,
        involvedCharacterIds: involved,
        sourceEventId: provenance?.eventTx,
        provenance,
        walrusBlobId: entry.blobId,
        visibility: 'public_chapter',
        createdAt: dateFromMs(entry.committedAtMs),
      };
    }),
  );
  return chapters.filter((c): c is Chapter => c != null);
}

function buildOrdinalDayMap(entries: PovChapterEntry[]): Map<string, number> {
  const sorted = [...entries].sort(
    (a, b) => Number(a.committedAtMs || 0) - Number(b.committedAtMs || 0),
  );
  return new Map(sorted.map((entry, index) => [entry.commitmentId, index + 1]));
}

function extractDay(text: string): number | null {
  const match = text.match(/第\s*(\d{1,4})\s*日/);
  if (!match) return null;
  const day = Number(match[1]);
  return Number.isFinite(day) && day > 0 ? day : null;
}

function titleForChapter(body: string, character?: Character): string {
  const firstLine = body
    .split(/\n+/)
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  const snippet = firstLine ? firstLine.slice(0, 18) : '新章回';
  const prefix = character ? `${character.name} 視角` : '角色視角';
  return `${prefix} · ${snippet}${firstLine && firstLine.length > 18 ? '…' : ''}`;
}

function dateFromMs(ms: string): string {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : new Date(0).toISOString();
}
