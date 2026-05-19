'use client';

import { useEffect, useState } from 'react';
import type { Recruitment } from '@endless-story/shared';
import { RecruitmentTicket } from './RecruitmentTicket';

export function RecruitmentSection({
  recruitments: initialRecruitments,
  onRecruitmentsChange,
}: {
  recruitments: Recruitment[];
  onRecruitmentsChange?: (r: Recruitment[]) => void;
}) {
  const [recruitments, setRecruitments] = useState(initialRecruitments);

  // Sync internal state with props, and notify parent when internal state changes
  useEffect(() => {
    setRecruitments(initialRecruitments);
  }, [initialRecruitments]);

  const handleSetRecruitments = (newRecruitments: Recruitment[]) => {
    setRecruitments(newRecruitments);
    onRecruitmentsChange?.(newRecruitments);
  };
  const [activeIdx, setActiveIdx] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [ticketVisible, setTicketVisible] = useState(true);

  useEffect(() => {
    if (slideDir == null) return;
    const id = setTimeout(() => setSlideDir(null), 320);
    return () => clearTimeout(id);
  }, [slideDir]);

  if (recruitments.length === 0) {
    return (
      <section id="recruitment-section" className="flex min-h-[100dvh] flex-col justify-center border-t border-hairline px-5 py-14 sm:px-10 sm:py-[4.5rem]">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-2xl tracking-wide text-ink sm:text-3xl">徵召公告</h2>
            {/* 測試用按鈕：恢復資料 */}
            <button
              onClick={() => handleSetRecruitments(initialRecruitments)}
              className="text-2xs tracking-widest text-cinnabar hover:underline"
            >
              [測試] 恢復徵召
            </button>
          </div>
          <div className="mt-8">
            <div className="flex min-h-[440px] flex-col items-center justify-center rounded-lg border border-dashed border-hairline bg-surface/30 px-6 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface shadow-sm ring-1 ring-hairline">
                <ScrollIcon className="h-7 w-7 text-mute/60" />
              </div>
              <h3 className="mt-6 font-serif text-xl text-ink">揭榜處空無一物</h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-mute">
                春雪社目前各行當皆已滿員，暫無新的徵召計畫。<br />
                請過幾日再來看看，或許會有新的空缺。
              </p>
            </div>
            {/* Always reserve space for CarouselNav to prevent height jumping */}
            <div className="mt-6 h-9" aria-hidden />
          </div>
        </div>
      </section>
    );
  }

  const safeIdx = Math.min(activeIdx, recruitments.length - 1);
  const active = recruitments[safeIdx];

  const goPrev = () => {
    setSlideDir('right');
    setTicketVisible(false);
    setTimeout(() => {
      setActiveIdx((i) => (i - 1 + recruitments.length) % recruitments.length);
      setTicketVisible(true);
    }, 160);
  };

  const goNext = () => {
    setSlideDir('left');
    setTicketVisible(false);
    setTimeout(() => {
      setActiveIdx((i) => (i + 1) % recruitments.length);
      setTicketVisible(true);
    }, 160);
  };

  const goTo = (idx: number) => {
    if (idx === safeIdx) return;
    setSlideDir(idx > safeIdx ? 'left' : 'right');
    setTicketVisible(false);
    setTimeout(() => {
      setActiveIdx(idx);
      setTicketVisible(true);
    }, 160);
  };

  return (
    <section id="recruitment-section" className="flex min-h-[100dvh] flex-col justify-center border-t border-hairline px-5 py-14 sm:px-10 sm:py-[4.5rem]">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-2xl tracking-wide text-ink sm:text-3xl">徵召公告</h2>
          {/* 測試用按鈕：清空資料 */}
          <button
            onClick={() => handleSetRecruitments([])}
            className="text-2xs tracking-widest text-mute hover:text-cinnabar"
          >
            [測試] 清空徵召
          </button>
        </div>

        <div className="mt-8">
          <div
            className={`transition-all duration-300 ease-out ${
              ticketVisible
                ? 'opacity-100 translate-x-0'
                : slideDir === 'left'
                  ? 'opacity-0 -translate-x-3'
                  : 'opacity-0 translate-x-3'
            }`}
          >
            <RecruitmentTicket
              key={active.id}
              recruitment={active}
              onOpenChange={setWizardOpen}
            />
          </div>

          <div
            className={`transition-opacity duration-300 ${
              wizardOpen || recruitments.length <= 1 ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
          >
            {recruitments.length > 1 ? (
              <CarouselNav
                count={recruitments.length}
                activeIdx={safeIdx}
                onPrev={goPrev}
                onNext={goNext}
                onGoTo={goTo}
              />
            ) : (
              <div className="mt-6 h-9" aria-hidden />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function CarouselNav({
  count,
  activeIdx,
  onPrev,
  onNext,
  onGoTo,
}: {
  count: number;
  activeIdx: number;
  onPrev: () => void;
  onNext: () => void;
  onGoTo: (idx: number) => void;
}) {
  return (
    <div className="mt-6 flex items-center justify-center gap-3">
      <CarouselButton label="上一則" direction="prev" onClick={onPrev} />

      <div className="flex min-w-20 items-center justify-center gap-2">
        {Array.from({ length: count }).map((_, i) => {
          const isActive = i === activeIdx;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onGoTo(i)}
              aria-label={`第 ${i + 1} 則 / ${count}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                isActive ? 'w-8 bg-cinnabar' : 'w-1.5 bg-hairline hover:bg-ink/30'
              }`}
            />
          );
        })}
      </div>

      <CarouselButton label="下一則" direction="next" onClick={onNext} />
    </div>
  );
}

function CarouselButton({
  label,
  direction,
  onClick,
}: {
  label: string;
  direction: 'prev' | 'next';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline bg-surface px-3 text-sm text-mute transition-colors hover:border-cinnabar/60 hover:bg-elevated hover:text-ink"
    >
      {direction === 'prev' ? <span aria-hidden>←</span> : null}
      <span className="text-2xs tracking-widest">{label}</span>
      {direction === 'next' ? <span aria-hidden>→</span> : null}
    </button>
  );
}

function ScrollIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6" />
      <path d="M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M4 6v12" />
      <path d="M8 6v12" />
      <line x1="12" y1="9" x2="16" y2="9" />
      <line x1="12" y1="13" x2="18" y2="13" />
      <line x1="12" y1="17" x2="15" y2="17" />
    </svg>
  );
}
