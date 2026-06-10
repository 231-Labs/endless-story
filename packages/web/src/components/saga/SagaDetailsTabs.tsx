'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useSagaTabs } from './SagaTabsContext';
import { SagaTabBar } from './SagaTabBar';

/** Bottom padding to clear the floating capsule nav */
const BOTTOM_CAPSULE_GAP = 'pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]';

/**
 * Lower half of the saga page: tabbed views (constellation / off-turf / charter).
 * `view` is shared via SagaTabsContext so the first-screen handscroll capsule can
 * switch tabs here too. Constellation mounts on large screens only (mobile shows a
 * hint); off-turf and charter are cards/text, fine on any size.
 *
 * An IntersectionObserver syncs `view` to whichever screen the user scrolls to
 * directly (not via the capsule) so the capsule highlight stays correct.
 */
export function SagaDetailsTabs({
  constellationContent,
  offTurfContent,
  charterContent,
}: {
  constellationContent: ReactNode;
  offTurfContent: ReactNode;
  charterContent: ReactNode;
}) {
  const { view, setView } = useSagaTabs();

  // Scroll → sync view. Read current view via ref so the effect needn't rebind on view.
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const handscroll = document.getElementById('saga-handscroll');
    const details = document.getElementById('saga-details');
    if (!handscroll || !details) return;
    // Threshold 0.9: only sync view once a screen has settled (nearly fills the
    // viewport), not mid-scroll — otherwise it races the capsule navigation.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.9) continue;
          if (e.target.id === 'saga-handscroll') {
            if (viewRef.current !== 'handscroll') setView('handscroll');
          } else if (viewRef.current === 'handscroll') {
            // Scrolled from handscroll into the second screen with no panel chosen → default to constellation.
            setView('constellation');
          }
        }
      },
      { threshold: [0.9] },
    );
    io.observe(handscroll);
    io.observe(details);
    return () => io.disconnect();
  }, [setView]);

  // Actual second-screen panel: handscroll isn't a panel, so default to constellation.
  const panel = view === 'handscroll' ? 'constellation' : view;

  return (
    <section
      id="saga-details"
      className={`relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-canvas ${BOTTOM_CAPSULE_GAP}`}
    >
      <div className="relative h-full w-full pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:pt-4">
        {/* 星圖 — 手機為可橫向平移的寬畫布（見 CastConstellation），桌面整幅置中 */}
        <TabPanel active={panel === 'constellation'}>{constellationContent}</TabPanel>

        {/* 江湖 — 分鏡板，手機桌面皆可 */}
        <TabPanel active={panel === 'offturf'}>{offTurfContent}</TabPanel>

        {/* 規章 */}
        <TabPanel active={panel === 'charter'} scroll>
          <div className="flex min-h-[calc(100dvh-env(safe-area-inset-bottom,0px)-6rem)] flex-col justify-center border-t border-hairline/50 px-[max(env(safe-area-inset-left,0px),1rem)] py-16 sm:py-20 sm:pl-[max(env(safe-area-inset-left,0px),1.25rem)] sm:pr-[max(env(safe-area-inset-right,0px),1.25rem)]">
            {charterContent}
          </div>
        </TabPanel>
      </div>

      {/* 膠囊導覽 — 放在內容之後以免 inset-0 層遮住；僅錨定在第二屏，非 fixed */}
      <SagaTabBar />
    </section>
  );
}

function TabPanel({
  active,
  scroll = false,
  children,
}: {
  active: boolean;
  scroll?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute inset-0 transition-all duration-500 ease-out ${
        scroll ? 'overflow-y-auto' : ''
      } ${
        active
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0 scale-[0.98]'
      }`}
    >
      {children}
    </div>
  );
}

