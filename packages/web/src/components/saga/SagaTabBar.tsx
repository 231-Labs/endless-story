'use client';

import { FlowIndicator, useFlowingIndicator } from '@/components/common/ink-motion';
import { SAGA_TABS, useSagaTabs } from './SagaTabsContext';

/**
 * Shared capsule tab bar (handscroll / constellation / off-turf / charter),
 * anchored bottom-center of its section. Used by both the first-screen
 * handscroll and the second-screen details, sharing one view (SagaTabsContext).
 *
 * Clicking scrolls to the matching screen: handscroll → first; others → second + that tab.
 */
export function SagaTabBar() {
  const { view, setView } = useSagaTabs();
  const { containerRef, box } = useFlowingIndicator<HTMLDivElement>(view);
  return (
    <nav
      className="pointer-events-none absolute bottom-[max(1.5rem,env(safe-area-inset-bottom,0px)+1.5rem)] left-1/2 z-[60] w-[min(calc(100vw-1.5rem),24rem)] -translate-x-1/2 sm:bottom-[max(2rem,env(safe-area-inset-bottom,0px)+2rem)] sm:w-auto sm:max-w-none"
      aria-label="場景、人物、在外與規章"
    >
      <div
        ref={containerRef}
        className="pointer-events-auto relative flex w-full flex-1 touch-manipulation items-center gap-1 rounded-full border border-hairline/30 bg-elevated/90 px-1 py-1 shadow-2xl backdrop-blur-xl dark:bg-elevated/85 dark:shadow-black/60 supports-[backdrop-filter]:bg-elevated/65"
      >
        <FlowIndicator box={box} />
        {SAGA_TABS.map((tab) => {
          const isActive = tab.key === view;
          return (
            <button
              key={tab.key}
              type="button"
              data-flow-key={tab.key}
              aria-pressed={isActive}
              onClick={() => {
                setView(tab.key);
                const id =
                  tab.key === 'handscroll'
                    ? 'saga-handscroll'
                    : tab.key === 'charter'
                      ? 'saga-charter'
                      : 'saga-constellation';
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`relative z-10 flex min-h-[44px] flex-1 items-center justify-center rounded-full px-3 py-2.5 text-sm font-medium tracking-wide transition-colors active:opacity-95 sm:flex-none sm:px-6 sm:py-2 ${
                isActive ? 'text-canvas' : 'text-ink/65 hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
