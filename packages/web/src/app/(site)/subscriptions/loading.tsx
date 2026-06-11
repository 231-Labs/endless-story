import { SiteNav } from '@/components/home/SiteNav';

export default function SubscriptionsLoading() {
  return (
    <main className="min-h-screen bg-canvas">
      <SiteNav />
      <section className="mx-auto max-w-4xl animate-pulse px-5 py-12 sm:px-10 sm:py-16">
        <div className="h-3 w-20 rounded bg-hairline/50" />
        <div className="mt-3 h-9 w-28 rounded bg-hairline/60" />
        <div className="mt-12 h-3 w-16 rounded bg-hairline/40" />
        <div className="mt-5 space-y-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-md border border-hairline bg-surface/70 p-3 sm:gap-5 sm:p-4"
            >
              <div className="h-16 w-16 rounded bg-hairline/50 sm:h-20 sm:w-20" />
              <div className="flex-1">
                <div className="h-5 w-24 rounded bg-hairline/50" />
                <div className="mt-2 h-3 w-40 rounded bg-hairline/40" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
