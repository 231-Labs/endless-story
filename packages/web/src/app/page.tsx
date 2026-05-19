import {
  recruitmentsApi,
  sagasApi,
  scenesApi,
} from '@/lib/api/index';
import { HeroBanner } from '@/components/home/HeroBanner';
import { SceneCarousel } from '@/components/home/SceneCarousel';
import { SiteNav } from '@/components/home/SiteNav';
import { RecruitmentSection } from '@/components/dossier/RecruitmentSection';

export default async function HomePage() {
  const saga = await sagasApi.getCurrentSaga();
  const [clips, openRecruitments] = await Promise.all([
    scenesApi.listTodayClips(saga.currentDay, 4),
    recruitmentsApi.listOpenRecruitments(),
  ]);

  return (
    <main className="min-h-screen">
      <SiteNav />
      <HeroBanner saga={saga} />
      <SceneCarousel clips={clips} />
      <RecruitmentSection recruitments={openRecruitments} />
      <footer className="border-t border-hairline px-5 py-8 text-center text-sm text-mute sm:px-10 sm:py-10">
        住在 Walrus 上的梨園
      </footer>
    </main>
  );
}
