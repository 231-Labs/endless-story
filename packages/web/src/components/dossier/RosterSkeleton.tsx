import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import type { RosterFilter } from './CharacterGrid';

const FILTERS: { key: RosterFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'internal', label: '春雪社' },
  { key: 'external', label: '江湖' },
  { key: 'mine', label: '我的' },
];

/**
 * Roster (人物誌) skeleton — mirrors `CharacterGrid`, NOT the character-detail
 * `DossierSkeleton`. The header (title + filter tabs + search) renders for real
 * since it needs no data; only the character CARDS (the per-card chain fan-out)
 * show pulsing image placeholders. Used as the in-page <Suspense> fallback while
 * the roster cards load, and (with chrome) as the route loading.tsx.
 */
export function RosterSkeletonInner({ filter = 'all' }: { filter?: RosterFilter }) {
  return (
    <div className="flex flex-1 flex-col">
      {/* Header & filters — real, needs no data */}
      <section className="sticky top-[var(--es-site-nav-h)] z-30 bg-canvas/95 px-5 pb-4 pt-8 backdrop-blur-md sm:px-10 sm:pb-6 sm:pt-11">
        <div className="mx-auto max-w-6xl">
          <PageLeadTitleBlock eyebrow="班底、徵召與訂閱" eyebrowMobile="班底與訂閱" title="人物誌" />

          <div className="mt-6 border-b border-hairline sm:mt-8">
            <div className="flex flex-col gap-4 pb-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
              <div className="-mx-5 flex min-w-0 gap-6 overflow-x-auto px-5 pb-px sm:mx-0 sm:overflow-visible sm:px-0">
                {FILTERS.map((f) => (
                  <span
                    key={f.key}
                    className={`relative shrink-0 pb-3 text-sm tracking-wide ${
                      f.key === filter ? 'text-ink' : 'text-mute'
                    }`}
                  >
                    {f.label}
                    {f.key === filter ? (
                      <span className="absolute inset-x-0 -bottom-px h-0.5 bg-cinnabar" />
                    ) : null}
                  </span>
                ))}
              </div>
              <div className="flex w-full flex-row flex-wrap items-center gap-x-4 gap-y-2 sm:w-auto sm:flex-nowrap">
                <div className="h-[42px] w-full rounded-full bg-surface/50 ring-1 ring-inset ring-hairline sm:w-52 lg:w-64" />
                <span className="shrink-0 text-sm tabular-nums text-mute">— 人</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cards — only the images are skeletons */}
      <div className="flex-1">
        <div className="mx-auto max-w-6xl px-5 pb-6 pt-8 sm:px-10">
          <div className="grid grid-cols-2 gap-6 xl:grid-cols-3 xl:gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] animate-pulse rounded-lg bg-hairline/40 ring-1 ring-hairline dark:bg-hairline/60"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Full-screen roster skeleton (with SiteNav) for the route loading.tsx. */
export function RosterSkeleton() {
  return (
    <main className="h-[100dvh] overflow-hidden">
      <SiteNav />
      <RosterSkeletonInner />
    </main>
  );
}
