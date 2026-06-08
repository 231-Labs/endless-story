'use client';

import { useMemo, useState } from 'react';
import type { SVGProps } from 'react';
import type { Character } from '@endless-story/shared';
import Link from 'next/link';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SubscribeCard } from '@/components/subscribe/SubscribeCard';

export type RosterFilter = 'all' | 'internal' | 'external' | 'mine';

const FILTERS: { key: RosterFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'internal', label: '春雪社' },
  { key: 'external', label: '江湖' },
  { key: 'mine', label: '我的' },
];

function rosterMembership(character: Character, internalSagaId: string): 'internal' | 'external' {
  return character.membership ?? (character.sagaId === internalSagaId ? 'internal' : 'external');
}

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

  // Prefer the connected wallet for the "mine" filter — server-derived
  // viewerWallet comes from `?as=` URL param which falls back to a
  // mock address when absent, so we'd never match the real owner.
  // Server-side path is kept as fallback for non-wallet flows (e.g.
  // backend HTTP API w/ session cookie in the future).
  const account = useCurrentAccount();
  const effectiveViewerWallet = account?.address ?? viewerWallet;

  const visible = useMemo(
    () =>
      cards.filter(({ character: c }) => {
        const membership = rosterMembership(c, internalSagaId);
        if (filter === 'internal' && membership !== 'internal') return false;
        if (filter === 'external' && membership !== 'external') return false;
        if (filter === 'mine' && (!effectiveViewerWallet || c.nftOwner !== effectiveViewerWallet)) return false;
        if (normalizedQuery) return c.name.toLowerCase().includes(normalizedQuery);
        return true;
      }),
    [cards, filter, effectiveViewerWallet, internalSagaId, normalizedQuery]
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
      <section className="sticky top-[var(--es-site-nav-h)] z-30 bg-canvas/95 px-5 pb-4 pt-8 backdrop-blur-md sm:px-10 sm:pb-6 sm:pt-11">
        <div className="mx-auto max-w-6xl">
          <PageLeadTitleBlock
            eyebrow="班底、徵召與訂閱"
            eyebrowMobile="班底與訂閱"
            title="人物誌"
          />

          {/* 篩選 + 搜尋 + 人數：桌面與章回 sub-tab 同層次；手機搜尋在篩選下全寬 */}
          <div className="mt-6 border-b border-hairline sm:mt-8">
            <div className="flex flex-col gap-4 pb-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
              <div className="-mx-5 flex min-w-0 gap-6 overflow-x-auto px-5 pb-px [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
                {FILTERS.map((f) => {
                  const isActive = f.key === filter;
                  return (
                    <Link
                      key={f.key}
                      href={{ pathname: '/dossier', query: f.key === 'all' ? {} : { filter: f.key } }}
                      className={`relative shrink-0 pb-3 text-sm tracking-wide transition-colors ${
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
              <div className="flex w-full flex-row flex-wrap items-center gap-x-4 gap-y-2 sm:w-auto sm:flex-nowrap">
                <label className="relative block min-w-0 flex-1 sm:w-52 lg:w-64 sm:flex-none">
                  <span className="sr-only">搜尋角色名稱</span>
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <SearchIcon className="h-4 w-4 text-mute" />
                  </div>
                  <input
                    type="search"
                    placeholder="搜尋角色…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoComplete="off"
                    enterKeyHint="search"
                    className="es-field block w-full rounded-full border-0 bg-surface/50 py-2.5 pl-10 pr-4 text-sm text-ink shadow-none ring-1 ring-inset ring-hairline transition-all placeholder:text-mute focus:bg-surface focus:ring-2 focus:ring-inset focus:ring-cinnabar/60"
                  />
                </label>
                <span className="shrink-0 text-sm tabular-nums text-mute">{visible.length} 人</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pages */}
      <div className="flex-1">
        {visible.length === 0 ? (
          <section className="flex min-h-[calc(100dvh-265px)] md:min-h-[calc(100dvh-245px)] snap-start snap-always items-center justify-center scroll-mt-[calc(var(--es-site-nav-h)+16rem)] md:scroll-mt-[calc(var(--es-site-nav-h)+13.5rem)]">
            <p className="text-center text-sm text-mute">這個範圍裡還沒有角色。</p>
          </section>
        ) : (
          <>
            {/* Mobile: Single horizontal scroll for all cards */}
            <section className="flex md:hidden min-h-[calc(100dvh-265px)] snap-start snap-always scroll-mt-[calc(var(--es-site-nav-h)+16rem)] flex-col px-0 pb-4 pt-0">
              <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-start pt-2 pb-2">
                <div className="no-scrollbar flex w-full snap-x snap-mandatory gap-4 overflow-x-auto px-5 scroll-px-5">
                  {visible.map((card) => (
                    <div
                      key={card.character.id}
                      className="w-[min(85vw,340px,calc((100dvh-340px)*3/4))] flex-shrink-0 snap-center"
                    >
                      <SubscribeCard {...card} />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Desktop: Paginated grid */}
            <div className="hidden md:block">
              {pages.map((pageCards, pageIndex) => (
                <section
                  key={pageCards[0]?.character.id ?? `page-${pageIndex}`}
                  className="flex min-h-[calc(100dvh-245px)] snap-start snap-always flex-col scroll-mt-[calc(var(--es-site-nav-h)+13.5rem)] px-5 pb-6 pt-0 sm:px-10"
                >
                  <div className="mx-auto flex w-full min-h-0 flex-1 flex-col items-center justify-start pt-8 pb-2 max-w-6xl">
                    <div className="w-full grid-cols-2 gap-6 md:grid xl:grid-cols-3 xl:gap-8">
                      {pageCards.map((card) => (
                        <SubscribeCard key={card.character.id} {...card} />
                      ))}
                    </div>
                  </div>

                  {/* Scroll hint */}
                  {pageIndex < pages.length - 1 ? (
                    <div
                      className="pointer-events-none flex shrink-0 flex-col items-center gap-1 pt-1 pb-0.5 opacity-75 [@media(max-height:520px)]:hidden"
                      aria-hidden
                    >
                      <span className="text-2xs tracking-[0.35em] text-cinnabar/80">往下翻閱</span>
                      <div className="h-5 w-px overflow-hidden bg-hairline">
                        <div className="h-full w-full bg-cinnabar/90 animate-scroll-down-line" />
                      </div>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
