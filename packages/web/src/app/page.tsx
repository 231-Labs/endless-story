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

  return (
    <HomeContent saga={saga} clips={clips} initialRecruitments={openRecruitments}>
      <SiteNav />
    </HomeContent>
  );
}