'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * "Current view" state for the saga page, lifted to page level so both screens
 * share one capsule.
 *
 * Four views: handscroll (first screen) + the second screen's three tabs
 * (constellation / off-turf / charter). Highlight = current view. Handscroll →
 * scroll to first screen; others → scroll to second screen and switch tab.
 * Manual scrolls are synced back by an IntersectionObserver (see SagaDetailsTabs).
 */

export type SagaView = 'handscroll' | 'constellation' | 'offturf' | 'charter';

/** Panel actually rendered on the second screen (handscroll isn't one; defaults to constellation). */
export type SagaDetailPanel = 'constellation' | 'offturf' | 'charter';

export const SAGA_TABS: { key: SagaView; label: string }[] = [
  { key: 'handscroll', label: '場景' },
  { key: 'constellation', label: '人物' },
  // 在外（江湖）—— hidden until there are other sagas to be "外" of.
  // { key: 'offturf', label: '在外' },
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
