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
  const [lastActiveClip, setLastActiveClip] = useState<SceneClip | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    if (activeClip) {
      setLastActiveClip(activeClip);
      setShowControls(true);
    } else {
      setIsFullscreen(false);
    }
  }, [activeClip]);

  // Auto-hide controls after 3s of inactivity
  useEffect(() => {
    if (!activeClip || !showControls) return;
    const timer = setTimeout(() => setShowControls(false), 3000);
    return () => clearTimeout(timer);
  }, [activeClip, showControls]);

  // ESC closes theater or exits fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          setActiveClip(null);
        }
      }
    };
    if (activeClip) {
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [activeClip, isFullscreen]);

  const displayClip = activeClip || lastActiveClip;

  return (
    <section className="relative flex flex-1 flex-col overflow-hidden bg-canvas transition-colors duration-500">
      {/* Background painting — day / night crossfade + slow-focus reveal on mount */}
      <div aria-hidden className={`pointer-events-none absolute inset-0 z-0 animate-focus-in transition-transform duration-700 ${activeClip ? 'scale-105' : 'scale-100'}`}>
        <div className="absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-out bg-[url('/hero/saga-day.webp')] dark:opacity-0" />
        <div className="absolute inset-0 bg-cover bg-center opacity-0 transition-opacity duration-700 ease-out bg-[url('/hero/saga-night.webp')] dark:opacity-100" />
        {/* Top whisper of canvas so nav floats; subtle vignette */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-canvas/40 to-transparent dark:from-canvas/50" />
        {/* Bottom fade into surface so today's-scenes panel sits naturally */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-canvas via-canvas/70 to-transparent" />
      </div>

      {/* Theater Mode Overlay */}
      <div
        className={`absolute inset-x-0 top-0 flex items-center justify-center transition-all duration-700 ${
          activeClip ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-95'
        } ${
          isFullscreen ? 'bottom-0 z-[60] bg-black/95' : 'bottom-[100px] sm:bottom-[116px] z-30'
        }`}
      >
        {/* Click-away background */}
        <div 
          className={`absolute inset-0 transition-colors duration-700 ${
            isFullscreen 
              ? 'bg-transparent' 
              : 'bg-canvas/85 dark:bg-black/70'
          }`} 
          onClick={() => { setActiveClip(null); setIsFullscreen(false); }} 
        />

        {displayClip && (
          <div className={`group/player relative z-10 flex flex-col items-center justify-center w-full h-full transition-all duration-500 ${
            isFullscreen ? 'p-0' : 'p-4 pb-16 sm:p-8 sm:pb-20'
          }`}>
            <div
              className={`group relative flex items-center justify-center overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 transition-all duration-500 ease-out ${
                isFullscreen ? 'rounded-none' : 'rounded-xl'
              }`}
              style={{
                aspectRatio: aspectRatio(displayClip.aspect),
                maxHeight: '100%',
                maxWidth: '100%',
                height: '100%', // this combined with max-width and aspect-ratio will fit it perfectly
              }}
              onClick={() => setShowControls(!showControls)}
            >
              {/* Top Controls Overlay (Title + Close) */}
              <div className={`absolute top-0 left-0 right-0 flex items-start justify-between p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent z-40 transition-opacity duration-300 ${
                showControls ? 'opacity-100' : 'opacity-0 lg:group-hover:opacity-100'
              }`}>
                <div className="pointer-events-none">
                  <h3 className="font-serif text-lg sm:text-xl text-white/90 drop-shadow-md">{displayClip.title}</h3>
                  <p className="mt-1 text-xs tracking-widest text-white/70 drop-shadow-md">DAY {displayClip.day}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveClip(null); setIsFullscreen(false); }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-md ring-1 ring-white/20 transition-all hover:bg-cinnabar hover:text-white hover:ring-cinnabar hover:scale-105 shadow-lg"
                  aria-label="關閉劇院模式"
                >
                  <XIcon />
                </button>
              </div>

              {/* Video Player */}
              {displayClip.videoUrl ? (
                <video
                  src={displayClip.videoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover pointer-events-none"
                />
              ) : (
                <div className="flex flex-col items-center text-white/40 transition-colors group-hover:text-white/80 cursor-pointer pointer-events-none">
                  <PlayIcon size={64} />
                  <span className="mt-4 font-mono text-sm tracking-widest">{displayClip.durationSeconds}s</span>
                </div>
              )}

              {/* Bottom Controls Overlay (Fullscreen Toggle) */}
              <div className={`absolute bottom-0 left-0 right-0 flex items-end justify-end p-4 sm:p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-40 transition-opacity duration-300 ${
                showControls ? 'opacity-100' : 'opacity-0 lg:group-hover:opacity-100'
              }`}>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsFullscreen(!isFullscreen); }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-md ring-1 ring-white/20 transition-all hover:bg-white/20 hover:text-white shadow-lg"
                  aria-label={isFullscreen ? "退出全螢幕" : "全螢幕播放"}
                >
                  {isFullscreen ? <HeroMinimizeIcon /> : <HeroMaximizeIcon />}
                </button>
              </div>
            </div>

            {/* Chapter Link (Outside Video, Below) */}
            {displayClip.chapterId && (
              <div className={`absolute left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
                isFullscreen ? 'bottom-8' : 'bottom-4 sm:bottom-6'
              } ${
                isFullscreen && !showControls ? 'opacity-0 pointer-events-none lg:group-hover/player:opacity-100 lg:group-hover/player:pointer-events-auto' : 'opacity-100 pointer-events-auto'
              }`}>
                <a
                  href={`/feed/chapter/${displayClip.chapterId}`}
                  className="group/btn flex items-center gap-2 rounded-full bg-surface/95 px-6 py-2.5 text-sm font-medium tracking-wide text-ink shadow-xl ring-1 ring-hairline backdrop-blur-md transition-all hover:bg-cinnabar hover:text-white hover:ring-cinnabar hover:-translate-y-0.5"
                >
                  <span>讀對應章回</span>
                  <span className="transition-transform group-hover/btn:translate-x-1">→</span>
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banner Content */}
      <div 
        className={`relative z-20 flex flex-1 flex-col justify-center px-5 py-4 sm:px-10 sm:py-6 lg:py-8 transition-all duration-700 ${
          activeClip ? 'scale-95 opacity-0 pointer-events-none' : 'scale-100 opacity-100 pointer-events-auto'
        }`}
      >
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
      <div className={`relative z-40 w-full border-t border-white/30 pt-3 pb-3 backdrop-blur-xl dark:border-white/10 transition-colors duration-700 ${
        activeClip ? 'bg-canvas/80 dark:bg-black/80' : 'bg-canvas/60 dark:bg-black/50'
      }`}>
        <div className="mx-auto max-w-7xl">
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
              className="no-scrollbar flex gap-4 overflow-x-auto py-2 px-5 sm:gap-5 sm:px-10 snap-x snap-mandatory scroll-smooth scroll-pl-5 sm:scroll-pl-10"
            >
              {clips.map((clip) => {
                const isActive = activeClip?.id === clip.id;
                return (
                  <button
                    key={clip.id}
                    onClick={() => setActiveClip(isActive ? null : clip)}
                    className={`group relative flex-none snap-start w-[75vw] max-w-[280px] sm:w-72 sm:max-w-none overflow-hidden rounded-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                      isActive 
                        ? 'ring-2 ring-cinnabar shadow-lg shadow-cinnabar/20 bg-elevated dark:bg-elevated/80 -translate-y-1' 
                        : 'ring-1 ring-hairline bg-surface hover:ring-cinnabar hover:shadow-cinnabar/10 dark:bg-elevated/40'
                    }`}
                  >
                    <div className={`relative w-full ${aspectClass('16/9')} overflow-hidden bg-elevated/50 dark:bg-canvas/50`}>
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-ink/5 dark:to-black/20" />
                      <div className={`absolute inset-0 flex items-center justify-center transition-transform duration-500 group-hover:scale-110 ${
                        isActive ? 'text-cinnabar' : 'text-mute/40 group-hover:text-cinnabar/80'
                      }`}>
                        <PlayIcon size={32} />
                      </div>
                      <div className="absolute right-2 top-2 rounded bg-elevated/90 px-2 py-0.5 font-mono text-2xs tracking-wider text-ink shadow-sm backdrop-blur">
                        {clip.durationSeconds}s
                      </div>
                      {/* Hover-reveal text overlay */}
                      <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-canvas via-canvas/90 to-transparent p-3 pt-10 text-left transition-opacity duration-300 ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                        <p className="truncate font-serif text-base text-ink">
                          {clip.title}
                        </p>
                        <p className="mt-0.5 text-2xs tracking-widest text-mute">DAY {clip.day}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
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

function HeroMaximizeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
    </svg>
  );
}

function HeroMinimizeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
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
