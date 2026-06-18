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
  const [clips, openRecruitments, sagaCharacters] = await Promise.all([
    scenesApi.listShowcaseClips(),
    recruitmentsApi.listOpenRecruitments(),
    // saga.castIds isn't populated by the on-chain saga read (characters
    // reference the saga, not vice versa) — count the saga's characters for
    // the hero meta. Resilient: chain hiccup → 0 → the count just hides.
    charactersApi.listSagaCharacters(saga.id).catch(() => []),
  ]);
  const castCount = sagaCharacters.length;

  // Chain-side capacity check: drop recruitments whose mintedCount has
  // already hit `slots`. Single batched event-log scan via the facade —
  // when chain is unreachable counts come back as 0 and nothing gets
  // filtered (degrade visibly, not silently lock out the page).
  const mintedCounts = await recruitmentsApi.getMintedCounts(
    openRecruitments.map((r) => r.id),
  );
  const availableRecruitments = openRecruitments.filter(
    (r) => !recruitmentsApi.isFull(r, mintedCounts.get(r.id) ?? 0),
  );

  return (
    <HomeContent saga={saga} clips={clips} initialRecruitments={availableRecruitments} castCount={castCount}>
      <SiteNav />
    </HomeContent>
  );
}
