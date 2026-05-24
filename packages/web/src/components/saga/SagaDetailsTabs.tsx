'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type SagaTab = 'constellation' | 'charter';

const TABS: { key: SagaTab; label: string }[] = [
  { key: 'constellation', label: '人物星圖' },
  { key: 'charter', label: '戲班規章' },
];

/** 為區塊底部膠囊導覽留白 */
const BOTTOM_CAPSULE_GAP = 'pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]';

const SM_MIN = '(min-width: 640px)';

function useIsSmUp() {
  const [smUp, setSmUp] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(SM_MIN);
    const sync = () => setSmUp(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return smUp;
}

/**
 * Saga 頁下半：桌面雙頁籤；膠囊錨定在**本區（第二屏）**底部，進入 Section 2 時才看得到（非 fixed 視窗）。
 * 手機不掛載星圖 — 只顯示規章並提示請用大螢幕。
 */
export function SagaDetailsTabs({
  constellationContent,
  charterContent,
}: {
  constellationContent: ReactNode;
  charterContent: ReactNode;
}) {
  const smUp = useIsSmUp();
  const [active, setActive] = useState<SagaTab>('constellation');

  const showDesktopTabs = smUp === true;

  if (!showDesktopTabs) {
    return (
      <section className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-canvas pb-[env(safe-area-inset-bottom,0)]">
        <div className="flex h-full flex-col pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
          <div className="border-b border-hairline/50 bg-surface/70 px-[max(env(safe-area-inset-left,0px),1rem)] py-3 backdrop-blur-sm dark:bg-elevated/50">
            <p className="text-center font-serif text-xs leading-relaxed tracking-wide text-ink">
              「人物方位」圖適合較大螢幕閱覽
            </p>
            <p className="mt-1 text-center text-2xs leading-relaxed tracking-widest text-mute">
              手機僅開放戲班規章｜請以平板直立、電腦或橫屏再瀏覽星圖
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[max(env(safe-area-inset-left,0px),1rem)] pb-[max(env(safe-area-inset-bottom,0px),1rem)] pr-[max(env(safe-area-inset-right,0px),1rem)] pt-6">
            <div className="flex min-h-[min(100%,32rem)] flex-col justify-start border-t border-hairline/30 pt-4">
              {charterContent}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="saga-details"
      className={`relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-canvas ${BOTTOM_CAPSULE_GAP}`}
    >
      <div className="relative h-full w-full pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:pt-4">
        <div
          className={`absolute inset-0 transition-all duration-500 ease-out ${
            active === 'constellation'
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0 scale-[0.98]'
          }`}
        >
          {constellationContent}
        </div>

        <div
          className={`absolute inset-0 overflow-y-auto transition-all duration-500 ease-out ${
            active === 'charter'
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0 scale-[0.98]'
          }`}
        >
          <div
            className={`flex min-h-[calc(100dvh-env(safe-area-inset-bottom,0px)-6rem)] flex-col justify-center border-t border-hairline/50 px-[max(env(safe-area-inset-left,0px),1rem)] py-16 sm:py-20 sm:pl-[max(env(safe-area-inset-left,0px),1.25rem)] sm:pr-[max(env(safe-area-inset-right,0px),1.25rem)]`}
          >
            {charterContent}
          </div>
        </div>
      </div>

      {/* DOM 放在內容之後以免 inset-0 層遮住；僅錨定在第二屏，非 fixed */}
      <nav
        className="pointer-events-none absolute bottom-[max(0.5rem,env(safe-area-inset-bottom,0px)+0.5rem)] left-1/2 z-[60] w-[min(calc(100vw-2rem),22rem)] -translate-x-1/2 sm:bottom-[max(0.75rem,env(safe-area-inset-bottom,0px)+0.75rem)] sm:w-auto sm:max-w-none"
        aria-label="人物星圖與戲班規章"
      >
        <div className="pointer-events-auto flex w-full flex-1 touch-manipulation items-center gap-1 rounded-full border border-hairline/30 bg-elevated/90 px-1 py-1 shadow-2xl backdrop-blur-xl dark:bg-elevated/85 dark:shadow-black/60 supports-[backdrop-filter]:bg-elevated/65">
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActive(tab.key)}
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
    </section>
  );
}
