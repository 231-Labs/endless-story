'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSagaTabs } from './SagaTabsContext';
import { SagaTabBar } from './SagaTabBar';

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
 * Saga 頁下半：頁籤切換（星圖 / 江湖 / 規章）。view 由 SagaTabsContext 共用，所以第一屏
 * 手卷底部的膠囊也能切到這裡的頁。星圖只在大螢幕掛載（手機改顯示提示）；江湖與規章是
 * 卡片／文字，手機桌面皆可看。
 *
 * 另外掛一個 IntersectionObserver：使用者直接捲動（非點膠囊）在兩屏之間移動時，把 view
 * 同步到目前所在那一屏，膠囊高亮才不會錯亂。
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
  const { view, setView } = useSagaTabs();

  // 捲動 → view 同步（避免高亮錯亂）。用 ref 讀目前 view，effect 不必隨 view 重綁。
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const handscroll = document.getElementById('saga-handscroll');
    const details = document.getElementById('saga-details');
    if (!handscroll || !details) return;
    // 門檻取 0.9：只在某一屏「停穩」（幾乎佔滿視窗）時才同步 view，不在捲動過程中觸發，
    // 否則會跟點膠囊的導航搶（過場時手卷還露一半就把 view 改回 handscroll）。
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.9) continue;
          if (e.target.id === 'saga-handscroll') {
            if (viewRef.current !== 'handscroll') setView('handscroll');
          } else if (viewRef.current === 'handscroll') {
            // 從手卷捲進第二屏，但沒指定面板 → 預設星圖。
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

  // 第二屏實際面板：手卷不是面板，落在第二屏時預設星圖。
  const panel = view === 'handscroll' ? 'constellation' : view;

  return (
    <section
      id="saga-details"
      className={`relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-canvas ${BOTTOM_CAPSULE_GAP}`}
    >
      <div className="relative h-full w-full pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:pt-4">
        {/* 星圖 — 僅大螢幕掛載，手機顯示提示 */}
        <TabPanel active={panel === 'constellation'}>
          {smUp === true ? constellationContent : <ConstellationMobileNotice />}
        </TabPanel>

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

function ConstellationMobileNotice() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-[max(env(safe-area-inset-left,0px),1.5rem)] text-center">
      <p className="font-serif text-base leading-relaxed tracking-wide text-ink">
        「人物星圖」適合較大螢幕閱覽
      </p>
      <p className="mt-2 text-2xs leading-relaxed tracking-widest text-mute">
        請以平板直立、電腦或橫屏再瀏覽星圖。<br />
        「在外」與「規章」手機亦可閱覽。
      </p>
    </div>
  );
}
