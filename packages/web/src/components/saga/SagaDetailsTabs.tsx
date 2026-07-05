'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useSagaTabs, type SagaView } from './SagaTabsContext';
import { SagaTabBar } from './SagaTabBar';

/** Bottom padding to clear the floating capsule nav */
const BOTTOM_CAPSULE_GAP = 'pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]';

/**
 * Lower screens of the saga page: 人物 (constellation) and 規章 (charter), each a
 * full-height snap section so scrolling flows 場景 → 人物 → 規章 consistently
 * (the capsule jumps to the same sections). An IntersectionObserver syncs the
 * shared `view` to whichever section has settled, so the capsule highlight tracks
 * manual scrolls too.
 */
export function SagaDetailsTabs({
  constellationContent,
  charterContent,
}: {
  constellationContent: ReactNode;
  /** Kept for when other sagas exist; 在外 is hidden for now (see SAGA_TABS). */
  offTurfContent?: ReactNode;
  charterContent: ReactNode;
}) {
  const { view, setView } = useSagaTabs();

  // Scroll → sync view. Read current view via ref so the effect needn't rebind on view.
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const idToView: Record<string, SagaView> = {
      'saga-handscroll': 'handscroll',
      'saga-constellation': 'constellation',
      'saga-charter': 'charter',
    };
    const els = Object.keys(idToView)
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;
    // Threshold 0.9: only sync once a section has settled (nearly fills the
    // viewport), not mid-scroll — otherwise it races the capsule navigation.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.9) continue;
          const v = idToView[e.target.id];
          if (v && viewRef.current !== v) setView(v);
        }
      },
      { threshold: [0.9] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [setView]);

  return (
    <>
      {/* 人物 — 星圖（手機為可橫向平移的寬畫布，桌面整幅置中） */}
      <section
        id="saga-constellation"
        className={`relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-canvas ${BOTTOM_CAPSULE_GAP}`}
      >
        <div className="relative h-full w-full pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:pt-4">
          {constellationContent}
        </div>
        <SagaTabBar />
      </section>

      {/* 規章 — 一屏內置中的牌記 */}
      <section
        id="saga-charter"
        className={`relative h-[100dvh] w-full snap-start snap-always overflow-y-auto bg-canvas ${BOTTOM_CAPSULE_GAP}`}
      >
        <div className="flex min-h-[calc(100dvh-env(safe-area-inset-bottom,0px)-6rem)] flex-col justify-center px-[max(env(safe-area-inset-left,0px),1rem)] py-8 sm:pl-[max(env(safe-area-inset-left,0px),1.25rem)] sm:pr-[max(env(safe-area-inset-right,0px),1.25rem)]">
          {charterContent}
        </div>
        <SagaTabBar />
      </section>
    </>
  );
}
