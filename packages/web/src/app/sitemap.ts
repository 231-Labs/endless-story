import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://endless-story.app';

/**
 * 春雪社產品殼為主。舊 /feed /dossier /saga 仍可索引但降權，作為鏈測試／深鏈，
 * 不再與首頁並列成「第二套產品」。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/feed`, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${SITE_URL}/dossier`, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${SITE_URL}/saga/spring-snow`, changeFrequency: 'weekly', priority: 0.3 },
  ];
}
