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
      <footer className="border-t border-hairline px-5 py-8 text-center text-sm text-mute sm:px-10 sm:py-10">
        住在 Walrus 上的梨園
      </footer>
    </main>
  );
}
