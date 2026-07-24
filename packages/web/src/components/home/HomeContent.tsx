'use client';

import Image from 'next/image';
import type { Saga, SceneClip, Recruitment } from '@endless-story/shared';
import { artifactsForTab, CHANNEL_ARTIFACTS, CHANNEL_SCENES, CHANNEL_TABS, type ChannelArtifact, type ChannelTab } from './channel-content';
}: {
  saga: Saga;
  clips: SceneClip[];
  initialRecruitments: Recruitment[];
  castCount?: number;
  children: React.ReactNode;
}) {
  const [openedArtifact, setOpenedArtifact] = useState<ChannelArtifact | null>(null);
  const scene = CHANNEL_SCENES[tab];
  const visibleArtifacts = artifactsForTab(tab);
  return (
              <span><b className="mr-2 font-serif text-lg text-[#30291f] dark:text-[#e6d9c0]">{CHANNEL_ARTIFACTS.length}</b>則新稿</span>
              <p className="text-xs tracking-[.24em] text-[#d5bd8b]">{scene.eyebrow}</p>
              <h3 className="mt-3 max-w-2xl font-serif text-3xl leading-snug sm:text-4xl">{scene.title}</h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65">{scene.note}</p>
          <div className="grid gap-5 md:grid-cols-3">{visibleArtifacts.map((artifact) => <button type="button" onClick={() => setOpenedArtifact(artifact)} key={artifact.id} className="group flex min-h-[310px] flex-col justify-between overflow-hidden rounded-[1.75rem] border border-[#92764c]/20 bg-[#f8f3e8]/75 p-7 text-left transition duration-500 hover:-translate-y-1 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-cinnabar dark:bg-[#211c15] sm:p-8">{artifact.imageUrl && <span className="relative -mx-8 -mt-8 mb-7 block h-36"><Image src={artifact.imageUrl} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover opacity-80 transition duration-700 group-hover:scale-105" /></span>}<span><span className="flex items-center justify-between text-[11px] tracking-[.2em] text-[#8c7653]"><span>{artifact.kind}</span><span>{artifact.stamp}</span></span><span className="mt-10 block font-serif text-2xl leading-snug">{artifact.title}</span><span className="mt-5 block text-sm leading-loose text-[#766958] dark:text-[#b6a991]">{artifact.excerpt}</span></span><span className="mt-8 text-xs tracking-[.18em] text-cinnabar opacity-70 transition group-hover:translate-x-1">展開這頁 →</span></button>)}</div>
      {openedArtifact && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-8" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenedArtifact(null); }}><article role="dialog" aria-modal="true" aria-labelledby="artifact-title" className="relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-[#f8f3e8] p-8 shadow-2xl dark:bg-[#1b1712] sm:p-12"><button type="button" onClick={() => setOpenedArtifact(null)} aria-label="關閉" className="absolute right-5 top-5 h-10 w-10 rounded-full border border-[#92764c]/25 text-lg transition hover:border-cinnabar hover:text-cinnabar">×</button><p className="text-xs tracking-[.24em] text-cinnabar">{openedArtifact.kind} · {openedArtifact.stamp}</p><h2 id="artifact-title" className="mt-5 pr-10 font-serif text-3xl leading-snug sm:text-4xl">{openedArtifact.title}</h2>{openedArtifact.imageUrl && <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-2xl"><Image src={openedArtifact.imageUrl} alt={openedArtifact.title} fill sizes="672px" className="object-cover" /></div>}<p className="mt-8 font-serif text-lg leading-[2] text-[#5f5548] dark:text-[#c7bba5]">{openedArtifact.body}</p><div className="mt-9 border-t border-[#92764c]/20 pt-5 text-xs tracking-[.16em] text-[#8c7653]">由今日事件、人物記憶與訪談痕跡編成 · 不補寫未曾發生之事</div></article></div>}

        <WelcomeNotice />
        <HeroTheater saga={saga} clips={clips} recruitmentsCount={initialRecruitments.length} castCount={castCount} />
      </div>
      
      {/* Second Screen: Recruitment */}
      <div className="min-h-[100dvh] snap-start snap-always">
        <RecruitmentSection recruitments={initialRecruitments} />
      </div>

      {/* Third Screen: Manifesto & Footer */}
      <footer className="snap-start snap-always flex min-h-[100dvh] flex-col items-center justify-between border-t border-hairline px-5 py-12 sm:px-10 sm:py-20">
        <div className="flex w-full max-w-5xl flex-1 flex-col justify-center gap-16 lg:flex-row lg:gap-24">
          {/* Left: Manifesto */}
          <div className="flex flex-1 flex-col justify-center space-y-8 text-center lg:text-left">
            {/* Small Cute Walrus Logo above Manifesto */}
            <div className="mx-auto mb-6 w-24 opacity-80 mix-blend-multiply transition-opacity hover:opacity-100 dark:invert dark:opacity-60 dark:mix-blend-screen lg:mx-0 sm:w-28">
              <Image
                src="/walruses.png"
                alt="Walrus Trio"
                width={224}
                height={224}
                className="pointer-events-none h-auto w-full object-contain"
              />
            </div>
            <h2 className="font-serif text-3xl font-medium tracking-widest text-ink sm:text-4xl leading-tight">
              戲未落幕，<br className="hidden lg:block" />
              <span className="text-cinnabar">記憶上鏈。</span>
            </h2>
            <div className="space-y-5 text-sm leading-loose tracking-wider text-mute sm:text-base">
              <p>
                Endless Story 是一套通用的 AI 敘事協議。<br className="hidden lg:block" />
                創作者可以定義世界觀、角色規則與故事資產，讓不同主題的世界在同一套合約上運行。
              </p>
              <p>
                春雪社只是第一座舞台。<br className="hidden lg:block" />
                在這裡，角色會累積記憶、形成關係，並把重要狀態留下可驗證的痕跡。
              </p>
              <p className="text-ink/80 font-medium">
                故事不再只是被生成，<br className="hidden lg:block" />
                而是可以被擁有、被追溯、被延續。
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
                <h4 className="text-sm font-medium tracking-widest text-ink">第一折｜立約 <span className="ml-2 text-2xs text-mute/60 font-mono">Sui Overflow 2026</span></h4>
                <p className="mt-2 text-xs leading-relaxed tracking-wider text-mute">完成通用敘事合約：定義世界、角色、權限與記憶承諾。</p>
              </div>
              <div className="relative pl-6 border-l border-hairline/60">
                <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-jade/70"></div>
                <h4 className="text-sm font-medium tracking-widest text-ink">第二折｜入戲 <span className="ml-2 text-2xs text-mute/60 font-mono">進行中</span></h4>
                <p className="mt-2 text-xs leading-relaxed tracking-wider text-mute">啟動第一個世界「春雪社」：讓角色擁有記憶、關係與持續行動。</p>
              </div>
              <div className="relative pl-6 border-l border-transparent">
                <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full border border-hairline bg-canvas"></div>
                <h4 className="text-sm font-medium tracking-widest text-mute">第三折｜開台 <span className="ml-2 text-2xs text-mute/60 font-mono">未來</span></h4>
                <p className="mt-2 text-xs leading-relaxed tracking-wider text-mute/50">開放創作者建立自己的世界：讓每段故事都有來源，每個角色都能延續。</p>
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
            <span className="cursor-default border border-hairline px-2 py-0.5 rounded text-2xs font-mono">SUI OVERFLOW 2026</span>
          </div>
        </div>
      </footer>
    </main>
  );
}