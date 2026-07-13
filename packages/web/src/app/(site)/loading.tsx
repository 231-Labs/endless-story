import { SiteNav } from '@/components/home/SiteNav';

/**
 * Generic cold-nav loading for (site) routes without their own loading.tsx —
 * in practice the home stage. Shaped like it: a full-bleed dark hero with
 * title lines and a clip strip below, so the first paint already reads as
 * the theatre instead of an unanchored spinner.
 */
export default function SiteLoading() {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-canvas">
      <SiteNav />
      <div className="relative flex-1 overflow-hidden bg-surface/70 dark:bg-elevated/30">
        <div className="absolute left-8 top-1/4 animate-pulse space-y-4 sm:left-16 lg:left-24">
          <div className="h-12 w-48 rounded bg-hairline/50 sm:h-16 sm:w-72" />
          <div className="h-3 w-40 rounded bg-hairline/40" />
          <div className="mt-6 space-y-2.5">
            <div className="h-3 w-[60vw] max-w-md rounded bg-hairline/30" />
            <div className="h-3 w-[55vw] max-w-sm rounded bg-hairline/30" />
            <div className="h-3 w-[40vw] max-w-xs rounded bg-hairline/30" />
          </div>
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden px-5 py-6 sm:px-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-video w-52 shrink-0 animate-pulse rounded-lg bg-hairline/30"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <span role="status" className="sr-only">
        開卷中
      </span>
    </main>
  );
}
