import {
  charactersApi,
  chaptersApi,
  sagasApi,
  scenesApi,
} from '@/lib/api/index';
import { HeroBanner } from '@/components/home/HeroBanner';
import { SceneCarousel } from '@/components/home/SceneCarousel';
import { LatestChaptersStrip } from '@/components/home/LatestChaptersStrip';
import { FeaturedCast } from '@/components/home/FeaturedCast';
import { SiteNav } from '@/components/home/SiteNav';

export default async function HomePage() {
  const saga = await sagasApi.getCurrentSaga();
  const [clips, chapters, allCharacters] = await Promise.all([
    scenesApi.listTodayClips(saga.currentDay, 4),
    chaptersApi.listLatestChapters(saga.id, 5),
    charactersApi.listSagaCharacters(saga.id),
  ]);
  const charactersById = new Map(allCharacters.map((c) => [c.id, c]));
  const featured = allCharacters.slice(0, 5);

  return (
    <main className="min-h-screen">
      <SiteNav />
      <HeroBanner saga={saga} />
      <SceneCarousel clips={clips} />
      <LatestChaptersStrip chapters={chapters} charactersById={charactersById} />
      <FeaturedCast characters={featured} />
      <footer className="border-t border-ink/10 px-8 py-6 text-center text-xs text-ink/40">
        住在 Walrus 上的梨園 · 訂閱誰，誰用他的視角把今天寫給你
      </footer>
    </main>
  );
}
