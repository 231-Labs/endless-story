'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Saga 頁的「目前視圖」狀態，提升到頁層級共用 —— 兩屏底部用同一顆膠囊。
 *
 * 四個 view：手卷（第一屏）+ 第二屏的三頁（星圖 / 江湖 / 規章）。膠囊高亮 = 目前 view，
 * 點手卷 → 捲回第一屏；點其他 → 捲到第二屏並切到該頁。手動捲動時由 IntersectionObserver
 * （見 SagaDetailsTabs）把 view 同步到目前所在的那一屏，避免高亮錯亂。
 */

export type SagaView = 'handscroll' | 'constellation' | 'offturf' | 'charter';

/** 第二屏實際渲染的面板（手卷不是面板，落在第二屏時預設星圖）。 */
export type SagaDetailPanel = 'constellation' | 'offturf' | 'charter';

export const SAGA_TABS: { key: SagaView; label: string }[] = [
  { key: 'handscroll', label: '場景' },
  { key: 'constellation', label: '人物' },
  { key: 'offturf', label: '在外' },
  { key: 'charter', label: '規章' },
];

interface SagaTabsValue {
  view: SagaView;
  setView: (v: SagaView) => void;
}

const SagaTabsCtx = createContext<SagaTabsValue | null>(null);

export function SagaTabsProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<SagaView>('handscroll');
  return <SagaTabsCtx.Provider value={{ view, setView }}>{children}</SagaTabsCtx.Provider>;
}

export function useSagaTabs(): SagaTabsValue {
  const ctx = useContext(SagaTabsCtx);
  if (!ctx) throw new Error('useSagaTabs must be used within <SagaTabsProvider>');
  return ctx;
}
