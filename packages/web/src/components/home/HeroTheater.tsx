'use client';

import { useState, useEffect } from 'react';
import type { Saga, SceneClip, ClipAspect } from '@endless-story/shared';

const ASPECT_CLASS: Record<ClipAspect, string> = {
  '16/9': 'aspect-video',
  '9/16': 'aspect-[9/16]',
  '1/1': 'aspect-square',
  '4/3': 'aspect-[4/3]',
  '3/4': 'aspect-[3/4]',
};

const ASPECT_RATIO: Record<ClipAspect, number> = {
  '16/9': 16 / 9,
  '9/16': 9 / 16,
  '1/1': 1,
  '4/3': 4 / 3,
  '3/4': 3 / 4,
};

function aspectClass(aspect?: ClipAspect): string {
  return ASPECT_CLASS[aspect ?? '16/9'];
}

function aspectRatio(aspect?: ClipAspect): number {
  return ASPECT_RATIO[aspect ?? '16/9'];
}

export function HeroTheater({ saga, clips, recruitmentsCount }: { saga: Saga; clips: SceneClip[]; recruitmentsCount: number }) {
  const [activeClip, setActiveClip] = useState<SceneClip | null>(null);

  // ESC closes theater
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveClip(null);
    };
    if (activeClip) {
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [activeClip]);

  return (
    <section className="relative flex flex-1 flex-col overflow-hidden bg-canvas transition-colors duration-500">
      {/* Background painting — day / night crossfade + slow-focus reveal on mount */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 animate-focus-in">
        <div className="absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-out bg-[url('/hero/saga-day.webp')] dark:opacity-0" />
        <div className="absolute inset-0 bg-cover bg-center opacity-0 transition-opacity duration-700 ease-out bg-[url('/hero/saga-night.webp')] dark:opacity-100" />
        {/* Top whisper of canvas so nav floats; subtle vignette */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-canvas/40 to-transparent dark:from-canvas/50" />
        {/* Bottom fade into surface so today's-scenes panel sits naturally */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-canvas via-canvas/70 to-transparent" />
      </div>

      {/* Theater Mode Overlay */}
      <div
        className={`absolute inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur-xl transition-all duration-700 dark:bg-black/95 ${
          activeClip ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {activeClip && (
          <>
            {/* Blurred Background for Aspect Ratio handling */}
            <div className="absolute inset-0 z-0 overflow-hidden opacity-20">
              {/* If we had a thumbnail URL, we'd put it here with blur-3xl scale-110 */}
              <div className="absolute inset-0 bg-surface/10" />
            </div>

            {/* Header / Close Button */}
            <div className="relative z-10 flex items-center justify-between p-5 sm:px-10 sm:py-6">
              <div className="text-ink dark:text-canvas">
                <h3 className="font-serif text-xl tracking-wide sm:text-2xl">{activeClip.title}</h3>
                <p className="mt-1 text-xs tracking-widest text-mute dark:text-canvas/60">DAY {activeClip.day}</p>
              </div>
              <button
                onClick={() => setActiveClip(null)}
                className="group flex h-10 w-10 items-center justify-center rounded-full bg-ink/5 text-ink backdrop-blur transition-all hover:bg-cinnabar hover:text-white dark:bg-canvas/20 dark:text-canvas"
                aria-label="關閉劇院模式"
              >
                <XIcon />
              </button>
            </div>

            {/* Video Container */}
            <div className="relative z-10 min-h-0 min-w-0 flex-1 p-5 pb-10 sm:px-10 sm:pb-16">
              <div className="absolute inset-0 flex items-center justify-center p-5 pb-10 sm:px-10 sm:pb-16">
                <div
                  className="relative flex items-center justify-center overflow-hidden rounded-lg bg-black shadow-2xl ring-1 ring-white/10 transition-all duration-500"
                  style={{
                    aspectRatio: aspectRatio(activeClip.aspect),
                    maxHeight: '100%',
                    maxWidth: '100%',
                    height: '100%', // this combined with max-width and aspect-ratio will fit it perfectly
                  }}
                >
                  {/* Video Player Placeholder */}
                  <div className="flex flex-col items-center text-white/40 transition-colors hover:text-white/80 cursor-pointer">
                    <PlayIcon size={64} />
                    <span className="mt-4 font-mono text-sm tracking-widest">{activeClip.durationSeconds}s</span>
                  </div>
                  
                  {/* Link to chapter if available */}
                  {activeClip.chapterId && (
                    <a
                      href={`/feed/chapter/${activeClip.chapterId}`}
                      className="absolute bottom-4 right-4 rounded bg-black/60 px-4 py-2 text-sm text-white/80 backdrop-blur transition-colors hover:bg-cinnabar hover:text-white"
                    >
                      讀對應章回 →
                    </a>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Banner Content */}
      <div
        className={`relative z-10 flex flex-1 flex-col justify-between transition-all duration-700 ${
          activeClip ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        {/* Top: Banner Text — frosted glass card */}
        <div className="flex flex-1 flex-col justify-center px-5 py-4 sm:px-10 sm:py-6 lg:py-8">
          <div className="mx-auto w-full max-w-3xl animate-banner-rise">
            <div className="rounded-3xl border border-white/40 bg-canvas/65 p-6 shadow-[0_10px_60px_-20px_rgba(0,0,0,0.18)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-canvas/70 dark:shadow-[0_10px_60px_-12px_rgba(0,0,0,0.6)] sm:p-8">
              <h1 className="font-serif text-5xl leading-tight tracking-wide text-ink sm:text-6xl lg:text-7xl">
                {saga.name}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm tracking-widest text-mute sm:mt-5 sm:text-base">
                <span>第 {saga.currentDay} 日 / 全 {saga.totalDays} 日</span>
                <span className="hidden text-hairline sm:inline">·</span>
                <span>{saga.castIds.length} 人在臺</span>
              </div>
              <p className="mt-6 text-lg leading-relaxed text-ink/90 sm:mt-7 sm:text-xl">
                {saga.premise}
              </p>

              {/* CTA Button */}
              {recruitmentsCount > 0 && (
                <div className="mt-8 sm:mt-10">
                  <button
                    onClick={() => {
                      document.getElementById('recruitment-section')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="group inline-flex items-center gap-3 rounded-full bg-cinnabar px-6 py-3 text-sm tracking-widest text-canvas transition-all hover:bg-seal hover:shadow-lg hover:shadow-cinnabar/20"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-canvas opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-canvas"></span>
                    </span>
                    <span>開放徵召中 ({recruitmentsCount})</span>
                    <span className="transition-transform group-hover:translate-y-0.5">↓</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom: Scene Thumbnails — frosted strip seated on the painting */}
        <div className="w-full border-t border-white/30 bg-canvas/60 pt-6 pb-4 backdrop-blur-xl dark:border-white/10 dark:bg-black/50">
          <div className="mx-auto max-w-7xl">
            <div className="mb-2 flex items-center justify-between px-5 sm:px-10">
              <h2 className="font-serif text-lg tracking-widest text-ink/80 dark:text-canvas/80">今日場景</h2>
            </div>
            {/* Scrollable row of scenes */}
            <div className="group/carousel relative">
              {/* Left/Right Navigation Buttons (Desktop only) */}
              <button
                onClick={() => {
                  const container = document.getElementById('scenes-scroll-container');
                  if (container) container.scrollBy({ left: -300, behavior: 'smooth' });
                }}
                className="absolute -left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-surface/90 p-2 text-ink/50 opacity-0 shadow-md ring-1 ring-hairline backdrop-blur transition-all hover:text-ink hover:ring-cinnabar group-hover/carousel:opacity-100 hidden sm:block disabled:opacity-0"
                aria-label="向左滑動"
              >
                <ChevronLeftIcon />
              </button>
              <button
                onClick={() => {
                  const container = document.getElementById('scenes-scroll-container');
                  if (container) container.scrollBy({ left: 300, behavior: 'smooth' });
                }}
                className="absolute -right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-surface/90 p-2 text-ink/50 opacity-0 shadow-md ring-1 ring-hairline backdrop-blur transition-all hover:text-ink hover:ring-cinnabar group-hover/carousel:opacity-100 hidden sm:block disabled:opacity-0"
                aria-label="向右滑動"
              >
                <ChevronRightIcon />
              </button>

              <div
                id="scenes-scroll-container"
                className="flex gap-4 overflow-x-auto py-2 px-5 sm:gap-5 sm:px-10 snap-x snap-mandatory scroll-smooth scroll-pl-5 sm:scroll-pl-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {clips.map((clip) => (
                  <button
                    key={clip.id}
                    onClick={() => setActiveClip(clip)}
                    className="group relative flex-none snap-start w-[75vw] max-w-[280px] sm:w-72 sm:max-w-none overflow-hidden rounded-lg bg-surface ring-1 ring-hairline transition-all duration-300 hover:-translate-y-1 hover:ring-cinnabar hover:shadow-xl hover:shadow-cinnabar/10 dark:bg-elevated/40"
                  >
                    <div className={`relative w-full ${aspectClass('16/9')} overflow-hidden bg-elevated/50 dark:bg-canvas/50`}>
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-ink/5 dark:to-black/20" />
                      <div className="absolute inset-0 flex items-center justify-center text-mute/40 transition-transform duration-500 group-hover:scale-110 group-hover:text-cinnabar/80">
                        <PlayIcon size={32} />
                      </div>
                      <div className="absolute right-2 top-2 rounded bg-elevated/90 px-2 py-0.5 font-mono text-2xs tracking-wider text-ink shadow-sm backdrop-blur">
                        {clip.durationSeconds}s
                      </div>
                    </div>
                    <div className="p-4 text-left">
                      <p className="truncate font-serif text-base text-ink transition-colors group-hover:text-cinnabar">
                        {clip.title}
                      </p>
                      <p className="mt-1.5 text-xs tracking-widest text-mute">DAY {clip.day}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlayIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <polygon points="6 4 20 12 6 20" fill="currentColor" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  );
}
