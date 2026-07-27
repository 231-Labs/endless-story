import {
  charactersApi,
  recruitmentsApi,
  sagasApi,
  scenesApi,
} from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { HomeContent } from '@/components/home/HomeContent';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const saga = await sagasApi.getCurrentSaga();
  const [clips, availableRecruitments, sagaCharacters] = await Promise.all([
    scenesApi.listShowcaseClips(),
    // Chain-side capacity check: drop recruitments whose mintedCount has
    // already hit `slots`. Chained onto the recruitment list inside the same
    // Promise.all so it overlaps the other reads instead of adding a stage.
    // When chain is unreachable counts come back as 0 and nothing gets
    // filtered (degrade visibly, not silently lock out the page).
    recruitmentsApi.listOpenRecruitments().then(async (open) => {
      const mintedCounts = await recruitmentsApi.getMintedCounts(open.map((r) => r.id));
      return open.filter((r) => !recruitmentsApi.isFull(r, mintedCounts.get(r.id) ?? 0));
    }),
    // saga.castIds isn't populated by the on-chain saga read (characters
    // reference the saga, not vice versa) — count the saga's characters for
    // the hero meta. Resilient: chain hiccup → 0 → the count just hides.
    charactersApi.listSagaCharacters(saga.id).catch(() => []),
  ]);
  const castCount = sagaCharacters.length;

  return (
    <HomeContent saga={saga} clips={clips} initialRecruitments={availableRecruitments} castCount={castCount}>
      <SiteNav />
    </HomeContent>
  );
}
