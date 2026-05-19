'use client';

import { useMemo, useState } from 'react';
import type { Character } from '@endless-story/shared';
import Link from 'next/link';
import { SubscribeCard } from '@/components/subscribe/SubscribeCard';

export type RosterFilter = 'all' | 'internal' | 'external' | 'mine';

const FILTERS: { key: RosterFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'internal', label: '春雪社' },
  { key: 'external', label: '江湖' },
  { key: 'mine', label: '我的' },
];

export interface CardData {
  character: Character;
  quote?: { text: string; chapterId?: string; chapterTitle?: string };
  tension?: { targetName: string; label: string };
  initialSubscriberCount: number;
  initialSubscribed: boolean;
  isOwner: boolean;
  nextPovHint?: string;
}

export function CharacterGrid({
  cards,
  filter,
  viewerWallet,
  internalSagaId,
}: {
  cards: CardData[];
  filter: RosterFilter;
  viewerWallet: string | null;
  internalSagaId: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedQuery = searchQuery.toLowerCase().trim();

  const visible = useMemo(
    () =>
      cards.filter(({ character: c }) => {
        if (filter === 'internal' && c.sagaId !== internalSagaId) return false;
        if (filter === 'external' && c.sagaId === internalSagaId) return false;
        if (filter === 'mine' && (!viewerWallet || c.nftOwner !== viewerWallet)) return false;
        if (normalizedQuery) return c.name.toLowerCase().includes(normalizedQuery);
        return true;
      }),
    [cards, filter, viewerWallet, internalSagaId, normalizedQuery]
  );

  const pages = useMemo(() => {
    const pageSize = 3;
    return Array.from({ length: Math.ceil(visible.length / pageSize) }, (_, i) =>
      visible.slice(i * pageSize, (i + 1) * pageSize)
    );
  }, [visible]);

  return (
    <div className="flex flex-1 flex-col">
      {/* Header & Filters (Sticky at top of the scroll container) */}
      <section className="sticky top-[57px] z-20 bg-canvas/90 px-5 pt-8 pb-4 backdrop-blur-md sm:top-[73px] sm:px-10 sm:pt-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="font-serif text-4xl tracking-wide text-ink sm:text-5xl">人物誌</h1>
            
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <SearchIcon className="h-4 w-4 text-mute" />
              </div>
              <input
                type="text"
                placeholder="搜尋角色名稱..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full rounded-full border-0 bg-surface/50 py-2 pl-10 pr-4 text-sm text-ink ring-1 ring-inset ring-hairline transition-all placeholder:text-mute focus:bg-surface focus:ring-2 focus:ring-inset focus:ring-cinnabar/60"
              />
            </div>
          </div>

          <div className="mt-6 flex items-baseline justify-between border-b border-hairline sm:mt-8">
            <div className="flex gap-6 sm:gap-8">
              {FILTERS.map((f) => {
                const isActive = f.key === filter;
                return (
                  <Link
                    key={f.key}
                    href={{ pathname: '/dossier', query: f.key === 'all' ? {} : { filter: f.key } }}
                    className={`relative pb-3 text-sm tracking-wide transition-colors ${
                      isActive ? 'text-ink' : 'text-mute hover:text-ink'
                    }`}
                  >
                    {f.label}
                    {isActive ? (
                      <span className="absolute inset-x-0 -bottom-px h-0.5 bg-cinnabar" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
            <span className="pb-3 text-sm text-mute">{visible.length} 人</span>
          </div>
        </div>
      </section>

      {/* Pages */}
      <div className="flex-1">
        {visible.length === 0 ? (
          <section className="flex min-h-[100dvh] snap-start snap-always items-center justify-center">
            <p className="text-center text-sm text-mute">這個範圍裡還沒有角色。</p>
          </section>
        ) : (
          <div>
            {pages.map((pageCards, pageIndex) => (
              <section
                key={pageCards[0]?.character.id ?? `page-${pageIndex}`}
                className="relative flex min-h-[100dvh] snap-start snap-always items-center justify-center px-5 pt-32 pb-12 sm:px-10 sm:pt-40"
              >
                <div className="mx-auto w-full max-w-6xl">
                  {/* Mobile: 1 card per snap (handled by CSS scroll snap inside this container) */}
                  <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 scroll-px-5 md:hidden">
                    {pageCards.map((card) => (
                      <div
                        key={card.character.id}
                        className="w-[85vw] max-w-[340px] flex-shrink-0 snap-center"
                      >
                        <SubscribeCard {...card} />
                      </div>
                    ))}
                  </div>

                  {/* Tablet+: Grid of up to 3 cards */}
                  <div className="hidden grid-cols-2 gap-6 md:grid xl:grid-cols-3 xl:gap-8">
                    {pageCards.map((card) => (
                      <SubscribeCard key={card.character.id} {...card} />
                    ))}
                  </div>
                </div>

                {/* Scroll Down Indicator (hidden on the last page) */}
                {pageIndex < pages.length - 1 && (
                  <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3 opacity-80 transition-opacity hover:opacity-100 sm:bottom-10">
                    <span className="text-xs tracking-[0.4em] text-cinnabar/80 font-medium">往下翻閱</span>
                    <div className="h-12 w-px overflow-hidden bg-hairline">
                      <div className="h-full w-full bg-cinnabar/90 animate-scroll-down-line" />
                    </div>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
