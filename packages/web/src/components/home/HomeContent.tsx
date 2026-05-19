'use client';

import { useState } from 'react';
import type { Saga, SceneClip, Recruitment } from '@endless-story/shared';
import { HeroTheater } from '@/components/home/HeroTheater';
import { RecruitmentSection } from '@/components/dossier/RecruitmentSection';

export function HomeContent({
  saga,
  clips,
  initialRecruitments,
  children,
}: {
  saga: Saga;
  clips: SceneClip[];
  initialRecruitments: Recruitment[];
  children: React.ReactNode;
}) {
  const [openRecruitments, setOpenRecruitments] = useState<Recruitment[]>(initialRecruitments);

  return (
    <main className="h-[100dvh] overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* First Screen: Nav + Hero */}
      <div className="flex min-h-[100dvh] flex-col snap-start snap-always">
        {children}
        <HeroTheater saga={saga} clips={clips} recruitmentsCount={openRecruitments.length} />
      </div>
      
      {/* Second Screen: Recruitment */}
      <div className="min-h-[100dvh] snap-start snap-always">
        <RecruitmentSection
          recruitments={openRecruitments}
          onRecruitmentsChange={setOpenRecruitments}
        />
      </div>

      {/* Footer */}
      <footer className="snap-start snap-always border-t border-hairline px-5 py-8 text-center text-sm text-mute sm:px-10 sm:py-10">
        住在 Walrus 上的梨園
      </footer>
    </main>
  );
}