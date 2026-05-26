import {
  recruitmentsApi,
  sagasApi,
  scenesApi,
} from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { HomeContent } from '@/components/home/HomeContent';

export default async function HomePage() {
  const saga = await sagasApi.getCurrentSaga();
  const [clips, openRecruitments] = await Promise.all([
    scenesApi.listTodayClips(saga.currentDay, 4),
    recruitmentsApi.listOpenRecruitments(),
  ]);

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
    <HomeContent saga={saga} clips={clips} initialRecruitments={availableRecruitments}>
      <SiteNav />
    </HomeContent>
  );
}
