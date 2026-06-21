import type { Chapter, Character } from '@endless-story/shared';
import {
  chapters,
  getChapterById,
  listChaptersBySaga,
  listPublicChaptersForCharacter,
} from '@/mocks/chapters';
import { USE_MOCK, isDeployed } from './config';
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
import { cachedPublicRead, publicChainReadTtl } from '@/lib/chain/read-cache';

/**
 * The chapter detail page calls listChapters() on every load (to build the TOC +
 * prev/next nav). Without this cache that meant re-scanning the saga's commitments
 * and re-reading every chapter body from Walrus on each navigation — seconds of
 * blank page that also made the wallet look disconnected. Short TTL: new chapters
 * still surface within the window; bodies themselves are cached harder (immutable)
 * in pov-read.fetchChapterText.
 */
const SAGA_CHAPTERS_TTL_MS = 30_000;

/**
 * Chapters API
 *
 * Backend endpoints:
 *   GET  /chapters?sagaId={id}                       → Chapter[]      (all chapters of a saga)
 *   GET  /chapters?sagaId={id}&visibility=public     → Chapter[]      (public only)
 *   GET  /chapters?sagaId={id}&latest={n}            → Chapter[]      (latest N chapters)
 *   GET  /chapters?characterId={id}                  → Chapter[]      (public chapters this character appears in)
 *   GET  /chapters/{id}                              → Chapter | 404
 *
 * Backend should:
 *   - Chapter.body is pulled from a Walrus blob; the blob id is stored on the chapter
 *   - visibility = saga_internal is visible only to owner / storyteller
 */

export async function listChapters(sagaId: string): Promise<Chapter[]> {
  if (isDeployed() && isSuiObjectId(sagaId)) {
    return cachedPublicRead(
      `chapters:saga:${sagaId}`,
      publicChainReadTtl(SAGA_CHAPTERS_TTL_MS),
      async () => {
        const characters = await fetchOnChainCharacters({ sagaId }).catch(() => [] as Character[]);
        const entries = await fetchPovChaptersForSaga(sagaId, {
          limit: 40,
          characterIds: characters.map((c) => c.id),
        });
        return entriesToChapters(entries, new Map(characters.map((c) => [c.id, c])));
      },
      // TTL rollover serves the old list instantly + refreshes in background.
      { staleTtlMs: 10 * 60 * 1000 },
    );
  }
  if (USE_MOCK) return listChaptersBySaga(sagaId);
  return httpGet<Chapter[]>('/chapters', { query: { sagaId } });
}

/**
 * How deep to scan ONE character's commitments when resolving their POV for a
 * specific event. The cut → POV deep-link matches on `provenance.eventTx`, and a
 * cut can be many narrative days old, so its POVs sit well behind the newest few.
 * Scanning per character (not saga-wide) keeps an old event's angles reachable;
 * this bound caps the cost at N_cast × this many cached reads.
 */
const EVENT_POV_SCAN_LIMIT = 60;

/**
 * Resolve each cast member's POV chapter for ONE on-chain event, matched by
 * `provenance.eventTx`. Returns the chapters that were found (one per character
 * that has one), each carrying `povCharacterId` so the caller can key by it.
 *
 * Why this exists: the cut reading page lists a cut's woven POV authors and wants
 * to deep-link each to THAT character's angle on THIS event. The saga-wide
 * `listChapters()` scan only covers the latest commitments, so an older cut's
 * POVs fall out of the window and every link dead-ends. Scanning per character
 * keeps the right POV reachable however old the cut is.
 */
export async function listEventPovChapters(
  sagaId: string,
  eventTx: string,
  characterIds: string[]
): Promise<Chapter[]> {
  if (!eventTx || characterIds.length === 0) return [];
  if (!(isDeployed() && isSuiObjectId(sagaId))) {
    // Mock / HTTP backend: filter the saga list we already have.
    const all = await listChapters(sagaId).catch(() => [] as Chapter[]);
    const wanted = new Set(characterIds);
    return all.filter(
      (c) => c.povCharacterId && wanted.has(c.povCharacterId) && c.provenance?.eventTx === eventTx
    );
  }
  return cachedPublicRead(
    `event-povs:${sagaId}:${eventTx}`,
    publicChainReadTtl(SAGA_CHAPTERS_TTL_MS),
    async () => {
      const found = await Promise.all(
        characterIds.map(async (cid) => {
          const character = await fetchOnChainCharacter(cid).catch(() => null);
          const entries = await fetchPovChaptersForCharacter(cid, {
            limit: EVENT_POV_SCAN_LIMIT,
          }).catch(() => [] as PovChapterEntry[]);
          const chapters = await entriesToChapters(
            entries,
            new Map(character ? [[character.id, character]] : [])
          );
          return chapters.find((c) => c.provenance?.eventTx === eventTx) ?? null;
        })
      );
      return found.filter((c): c is Chapter => c != null);
    },
    { staleTtlMs: 10 * 60 * 1000 }
  );
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
