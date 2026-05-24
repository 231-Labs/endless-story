import type { Chapter } from '@endless-story/shared';
import {
  chapters,
  getChapterById,
  listChaptersBySaga,
  listPublicChaptersForCharacter,
} from '@/mocks/chapters';
import { USE_MOCK } from './config';
import { httpGet } from './http';

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

export async function listChapters(sagaId: string): Promise<Chapter[]> {
  if (USE_MOCK) return listChaptersBySaga(sagaId);
  return httpGet<Chapter[]>('/chapters', { query: { sagaId } });
}

export async function listPublicChaptersForSubscription(
  characterId: string
): Promise<Chapter[]> {
  if (USE_MOCK) return listPublicChaptersForCharacter(characterId);
  return httpGet<Chapter[]>('/chapters', { query: { characterId } });
}

export async function getChapter(id: string): Promise<Chapter | null> {
  if (USE_MOCK) return getChapterById(id) ?? null;
  try {
    return await httpGet<Chapter>(`/chapters/${id}`);
  } catch {
    return null;
  }
}

export async function listLatestChapters(sagaId: string, limit = 5): Promise<Chapter[]> {
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
