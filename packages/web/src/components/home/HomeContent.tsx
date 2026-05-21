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
          seedRecruitments={initialRecruitments}
          onRecruitmentsChange={setOpenRecruitments}
        />
      </div>

      {/* Third Screen: Manifesto & Footer */}
      <footer className="snap-start snap-always flex min-h-[100dvh] flex-col items-center justify-between border-t border-hairline px-5 py-12 sm:px-10 sm:py-20">
        <div className="flex w-full max-w-5xl flex-1 flex-col justify-center gap-16 lg:flex-row lg:gap-24">
          {/* Left: Manifesto */}
          <div className="flex flex-1 flex-col justify-center space-y-8 text-center lg:text-left">
            {/* Small Cute Walrus Logo above Manifesto */}
            <div className="mx-auto mb-6 w-24 opacity-80 mix-blend-multiply transition-opacity hover:opacity-100 dark:invert dark:opacity-60 dark:mix-blend-screen lg:mx-0 sm:w-28">
              <img src="/walruses.png" alt="Walrus Trio" className="h-auto w-full object-contain pointer-events-none" />
            </div>
            <h2 className="font-serif text-3xl font-medium tracking-widest text-ink sm:text-4xl leading-tight">
              戲子無情，<br className="hidden lg:block" />
              <span className="text-cinnabar">記憶有痕。</span>
            </h2>
            <div className="space-y-5 text-sm leading-loose tracking-wider text-mute sm:text-base">
              <p>
                當速食的 AI 短劇氾濫，<br className="hidden lg:block" />
                我們渴望能沉澱的靈魂。
              </p>
              <p>
                這裡沒有拋棄式的生成對話，<br className="hidden lg:block" />
                也沒有靜止不動的二次元圖檔。<br className="hidden lg:block" />
                每一段連載、每一次的託夢交心，<br className="hidden lg:block" />
                都化作不可篡改的印記，永久銘刻於 Walrus。
              </p>
              <p className="text-ink/80 font-medium">
                大幕初啟，好戲正要上場。
              </p>
            </div>
          </div>

          {/* Right: Roadmap (戲單) */}
          <div className="flex flex-1 flex-col justify-center">
            <div className="flex items-center justify-center gap-4 mb-10 lg:justify-start">
              <div className="h-px w-8 bg-hairline"></div>
              <h3 className="font-serif text-lg tracking-[0.3em] text-ink">梨園戲單</h3>
              <div className="h-px w-8 bg-hairline"></div>
            </div>
            
            <div className="space-y-8 pl-2 sm:pl-4">
              <div className="relative pl-6 border-l border-hairline/60">
                <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-cinnabar shadow-[0_0_8px_rgba(176,74,60,0.6)]"></div>
                <h4 className="text-sm font-medium tracking-widest text-ink">第一折：起勢 <span className="ml-2 text-2xs text-mute/60 font-mono">Sui Overflow</span></h4>
                <p className="mt-2 text-xs leading-relaxed tracking-wider text-mute">角色記憶上鏈 Walrus，Sui NFT 確立 IP 歸屬。建立看客與角色的情感羈絆。</p>
              </div>
              <div className="relative pl-6 border-l border-hairline/60">
                <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-jade/70"></div>
                <h4 className="text-sm font-medium tracking-widest text-ink">第二折：入戲 <span className="ml-2 text-2xs text-mute/60 font-mono">Phase 2</span></h4>
                <p className="mt-2 text-xs leading-relaxed tracking-wider text-mute">接入真實 LLM 推演，每日生成專屬 POV 視角、心曲與自主社交互動。</p>
              </div>
              <div className="relative pl-6 border-l border-transparent">
                <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full border border-hairline bg-canvas"></div>
                <h4 className="text-sm font-medium tracking-widest text-mute">第三折：滿堂 <span className="ml-2 text-2xs text-mute/60 font-mono">Phase 3</span></h4>
                <p className="mt-2 text-xs leading-relaxed tracking-wider text-mute/50">開放 IP 授權與衍生創作，實現票房分潤與戲班自治的創作者經濟。</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Traditional Footer + Links */}
        <div className="mt-16 flex w-full max-w-5xl flex-col items-center justify-between gap-6 border-t border-hairline pt-8 sm:flex-row">
          <div className="flex flex-col text-center sm:text-left">
            <span className="text-sm font-medium tracking-[0.2em] text-ink">住在 Walrus 上的梨園</span>
            <span className="text-2xs tracking-[0.1em] text-mute/60 mt-1">© 2026 ENDLESS STORY</span>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs tracking-wider text-mute sm:gap-6">
            <a href="https://github.com/231-Labs/endless-story" target="_blank" rel="noreferrer" className="hover:text-cinnabar transition-colors">GitHub</a>
            <span className="text-hairline hidden sm:inline">|</span>
            <span className="cursor-default border border-hairline px-2 py-0.5 rounded text-2xs font-mono">SUI OVERFLOW 2026</span>
            <span className="text-hairline hidden sm:inline">|</span>
            <a href="/dossier" className="hover:text-cinnabar transition-colors">人物誌</a>
          </div>
        </div>
      </footer>
    </main>
  );
}