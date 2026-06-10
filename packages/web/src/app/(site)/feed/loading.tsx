import { SiteNav } from '@/components/home/SiteNav';

export default function FeedLoading() {
  return (
    <main className="min-h-screen bg-canvas">
      <SiteNav />
      <div className="px-5 pb-2 pt-8 sm:px-10 sm:pb-3 sm:pt-11">
        <div className="mx-auto max-w-6xl animate-pulse">
          <div className="h-3 w-28 rounded bg-hairline/50" />
          <div className="mt-3 h-10 w-44 rounded bg-hairline/60 sm:h-12 sm:w-64" />
          <div className="mt-6 flex gap-4 border-b border-hairline pb-3 sm:mt-8 sm:gap-8">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-4 w-12 rounded bg-hairline/40" />
            ))}
          </div>
        </div>
      </div>
      <div className="px-5 pb-8 pt-4 sm:px-10 sm:pb-14 sm:pt-5">
        <div className="mx-auto max-w-6xl space-y-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-3xl border border-hairline/50 bg-surface/40 p-6 sm:p-8"
            >
              <div className="flex items-center gap-3">
                <div className="h-6 w-16 rounded bg-hairline/50" />
                <div className="h-4 w-24 rounded bg-hairline/40" />
              </div>
              <div className="mt-4 h-7 w-3/5 rounded bg-hairline/60" />
              <div className="mt-3 h-4 w-full rounded bg-hairline/40" />
              <div className="mt-2 h-4 w-4/5 rounded bg-hairline/40" />
            </div>
          ))}
          <p className="pt-2 text-center font-serif text-2xs tracking-[0.35em] text-mute/60">
            取章回中
          </p>
        </div>
      </div>
    </main>
  );
}
