'use client';

import { useEffect, useState } from 'react';
import type { Recruitment } from '@endless-story/shared';
import { RecruitmentTicket } from './RecruitmentTicket';

export function RecruitmentSection({ recruitments }: { recruitments: Recruitment[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [ticketVisible, setTicketVisible] = useState(true);

  useEffect(() => {
    if (slideDir == null) return;
    const id = setTimeout(() => setSlideDir(null), 320);
    return () => clearTimeout(id);
  }, [slideDir]);

  if (recruitments.length === 0) return null;

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
    <section className="border-t border-hairline px-5 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-2xl tracking-wide text-ink sm:text-3xl">徵召公告</h2>
          {recruitments.length > 1 ? (
            <span className="font-mono text-sm tracking-widest text-mute">
              {safeIdx + 1} / {recruitments.length}
            </span>
          ) : null}
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

          {recruitments.length > 1 && !wizardOpen ? (
            <CarouselNav
              count={recruitments.length}
              activeIdx={safeIdx}
              onPrev={goPrev}
              onNext={goNext}
              onGoTo={goTo}
            />
          ) : null}
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
    <div className="mt-6 flex items-center justify-between">
      <button
        type="button"
        onClick={onPrev}
        aria-label="上一則"
        className="flex h-9 w-9 items-center justify-center rounded-full text-mute transition-colors hover:bg-stone-100 hover:text-ink"
      >
        ←
      </button>

      <div className="flex items-center gap-2">
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

      <button
        type="button"
        onClick={onNext}
        aria-label="下一則"
        className="flex h-9 w-9 items-center justify-center rounded-full text-mute transition-colors hover:bg-stone-100 hover:text-ink"
      >
        →
      </button>
    </div>
  );
}
