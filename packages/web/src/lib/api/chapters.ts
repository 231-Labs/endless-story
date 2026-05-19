import type { Chapter } from '@endless-story/shared';
import {
  chapters,
  getChapterById,
  listChaptersBySaga,
  listPublicChaptersForCharacter,
} from '@/mocks/chapters.js';

export async function listChapters(sagaId: string): Promise<Chapter[]> {
  return listChaptersBySaga(sagaId);
}

export async function listPublicChaptersForSubscription(
  characterId: string
): Promise<Chapter[]> {
  return listPublicChaptersForCharacter(characterId);
}

export async function getChapter(id: string): Promise<Chapter | null> {
  return getChapterById(id) ?? null;
}

export async function listLatestChapters(sagaId: string, limit = 5): Promise<Chapter[]> {
  return chapters
    .filter((c) => c.sagaId === sagaId && c.visibility === 'public_chapter')
    .sort((a, b) => b.day - a.day || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
