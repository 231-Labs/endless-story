'use client';

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
  return (
    <nav
      className="pointer-events-none absolute bottom-[max(0.5rem,env(safe-area-inset-bottom,0px)+0.5rem)] left-1/2 z-[60] w-[min(calc(100vw-1.5rem),24rem)] -translate-x-1/2 sm:bottom-[max(0.75rem,env(safe-area-inset-bottom,0px)+0.75rem)] sm:w-auto sm:max-w-none"
      aria-label="場景、人物、在外與規章"
    >
      <div className="pointer-events-auto flex w-full flex-1 touch-manipulation items-center gap-1 rounded-full border border-hairline/30 bg-elevated/90 px-1 py-1 shadow-2xl backdrop-blur-xl dark:bg-elevated/85 dark:shadow-black/60 supports-[backdrop-filter]:bg-elevated/65">
        {SAGA_TABS.map((tab) => {
          const isActive = tab.key === view;
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                setView(tab.key);
                const id = tab.key === 'handscroll' ? 'saga-handscroll' : 'saga-details';
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`relative flex min-h-[44px] flex-1 items-center justify-center rounded-full px-3 py-2.5 text-sm font-medium tracking-wide transition-colors active:opacity-95 sm:flex-none sm:px-6 sm:py-2 ${
                isActive
                  ? 'bg-ink text-canvas dark:bg-ink dark:text-canvas'
                  : 'text-ink/65 hover:bg-surface hover:text-ink'
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
