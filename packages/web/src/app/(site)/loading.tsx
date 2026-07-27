/**
 * Cold-nav loading for (site) routes — shaped like the 春雪社 guest shell
 * (brand + clock skeleton), not the retired marketing hero strip.
 */
export default function SiteLoading() {
  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-canvas">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center opacity-40 bg-[url('/hero/saga-day.webp')] dark:bg-[url('/hero/saga-night.webp')] dark:opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/70 to-canvas/40" />
      <header className="relative z-10 border-b border-hairline/40 px-4 pb-3 pt-5 sm:px-8">
        <div className="h-2 w-24 animate-pulse rounded bg-cinnabar/25" />
        <div className="mt-3 h-7 w-48 animate-pulse rounded bg-hairline/50 sm:w-64" />
        <div className="mt-4 flex gap-4">
          <div className="h-4 w-12 animate-pulse rounded bg-hairline/40" />
          <div className="h-4 w-14 animate-pulse rounded bg-hairline/40" />
          <div className="h-4 w-14 animate-pulse rounded bg-hairline/40" />
        </div>
      </header>
      <div className="relative z-10 flex flex-1 items-end px-6 pb-16 sm:px-10">
        <div className="w-full max-w-xl space-y-4">
          <div className="h-3 w-20 animate-pulse rounded bg-cinnabar/20" />
          <div className="h-10 w-[70%] animate-pulse rounded bg-hairline/45" />
          <div className="h-3 w-[85%] animate-pulse rounded bg-hairline/30" />
          <div className="h-3 w-[60%] animate-pulse rounded bg-hairline/30" />
        </div>
      </div>
      <span role="status" className="sr-only">
        展卷中
      </span>
    </main>
  );
}
