import { SiteNav } from '@/components/home/SiteNav';

/** Prose-shaped skeleton — replaces the feed-shaped fallback so clicking into
 *  a chapter paints something chapter-like immediately. */
export default function ChapterLoading() {
  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="px-5 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-6xl animate-pulse">
          <div className="h-8 w-8 rounded-full bg-hairline/50" />
          <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px] lg:gap-20">
            <div>
              <div className="flex gap-3">
                <div className="h-6 w-16 rounded bg-hairline/50" />
                <div className="h-6 w-24 rounded bg-hairline/40" />
              </div>
              <div className="mt-5 h-10 w-3/4 rounded bg-hairline/60" />
              <div className="mt-8 space-y-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-4 rounded bg-hairline/40" style={{ width: `${96 - (i % 3) * 7}%` }} />
                ))}
              </div>
              <p className="mt-10 text-center text-2xs tracking-[0.35em] text-mute">取章回中</p>
            </div>
            <div className="hidden lg:block">
              <div className="h-64 rounded-3xl bg-hairline/30" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
