'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type SagaTab = 'constellation' | 'offturf' | 'charter';

const TABS: { key: SagaTab; label: string }[] = [
  { key: 'constellation', label: '人物星圖' },
  { key: 'offturf', label: '江湖在外' },
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
 * Saga 頁下半：頁籤切換（人物星圖 / 江湖在外 / 戲班規章），膠囊錨定在本區（第二屏）底部。
 * 星圖只在大螢幕掛載（手機改顯示提示）；江湖在外與規章是卡片／文字，手機桌面皆可看。
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
  const smUp = useIsSmUp();
  const [active, setActive] = useState<SagaTab>('constellation');

  return (
    <section
      id="saga-details"
      className={`relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-canvas ${BOTTOM_CAPSULE_GAP}`}
    >
      <div className="relative h-full w-full pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:pt-4">
        {/* 人物星圖 — 僅大螢幕掛載，手機顯示提示 */}
        <TabPanel active={active === 'constellation'}>
          {smUp === true ? constellationContent : <ConstellationMobileNotice />}
        </TabPanel>

        {/* 江湖在外 — 分鏡板，手機桌面皆可 */}
        <TabPanel active={active === 'offturf'}>{offTurfContent}</TabPanel>

        {/* 戲班規章 */}
        <TabPanel active={active === 'charter'} scroll>
          <div className="flex min-h-[calc(100dvh-env(safe-area-inset-bottom,0px)-6rem)] flex-col justify-center border-t border-hairline/50 px-[max(env(safe-area-inset-left,0px),1rem)] py-16 sm:py-20 sm:pl-[max(env(safe-area-inset-left,0px),1.25rem)] sm:pr-[max(env(safe-area-inset-right,0px),1.25rem)]">
            {charterContent}
          </div>
        </TabPanel>
      </div>

      {/* 膠囊導覽 — 放在內容之後以免 inset-0 層遮住；僅錨定在第二屏，非 fixed */}
      <nav
        className="pointer-events-none absolute bottom-[max(0.5rem,env(safe-area-inset-bottom,0px)+0.5rem)] left-1/2 z-[60] w-[min(calc(100vw-1.5rem),26rem)] -translate-x-1/2 sm:bottom-[max(0.75rem,env(safe-area-inset-bottom,0px)+0.75rem)] sm:w-auto sm:max-w-none"
        aria-label="人物星圖、江湖在外與戲班規章"
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
                className={`relative flex min-h-[44px] flex-1 items-center justify-center rounded-full px-2.5 py-2.5 text-sm font-medium tracking-wide transition-colors active:opacity-95 sm:flex-none sm:px-5 sm:py-2 ${
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

function ConstellationMobileNotice() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-[max(env(safe-area-inset-left,0px),1.5rem)] text-center">
      <p className="font-serif text-base leading-relaxed tracking-wide text-ink">
        「人物星圖」適合較大螢幕閱覽
      </p>
      <p className="mt-2 text-2xs leading-relaxed tracking-widest text-mute">
        請以平板直立、電腦或橫屏再瀏覽星圖。<br />
        「江湖在外」與「戲班規章」手機亦可閱覽。
      </p>
    </div>
  );
}
