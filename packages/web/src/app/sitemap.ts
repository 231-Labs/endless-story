import type { MetadataRoute } from 'next';
import { chaptersApi, charactersApi, sagasApi } from '@/lib/api/index';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://endless-story.app';

/**
 * 核心靜態路由 + 公開章回 / 角色頁。鏈讀失敗時退回靜態核心
 * （sitemap 永遠可生成，不因節點抖動 500）。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/feed`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/dossier`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/saga/spring-snow`, changeFrequency: 'daily', priority: 0.8 },
  ];

  try {
    const saga = await sagasApi.getCurrentSaga();
    const [chapters, characters] = await Promise.all([
      chaptersApi.listChapters(saga.id),
      charactersApi.listCharacters(),
    ]);
    const chapterRoutes: MetadataRoute.Sitemap = chapters
      .filter((c) => c.visibility === 'public_chapter')
      .map((c) => ({
        url: `${SITE_URL}/feed/chapter/${c.id}`,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }));
    const characterRoutes: MetadataRoute.Sitemap = characters.map((c) => ({
      url: `${SITE_URL}/dossier?id=${c.id}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
    return [...staticRoutes, ...chapterRoutes, ...characterRoutes];
  } catch {
    return staticRoutes;
  }
}
