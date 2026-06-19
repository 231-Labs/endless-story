import { SiteNav } from '@/components/home/SiteNav';

/** Prose-shaped skeleton so entering a 戲折 paints instantly. */
export default function ProductionLoading() {
  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="px-5 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-3xl animate-pulse">
          <div className="h-8 w-8 rounded-full bg-hairline/50" />
          <div className="mt-6 flex gap-3">
            <div className="h-6 w-16 rounded bg-hairline/50" />
            <div className="h-6 w-24 rounded bg-hairline/40" />
          </div>
          <div className="mt-10 space-y-4">
            <div className="h-7 w-2/3 rounded bg-hairline/60" />
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-4 rounded bg-hairline/40" style={{ width: `${96 - (i % 3) * 7}%` }} />
            ))}
          </div>
          <p className="mt-10 text-center text-2xs tracking-[0.35em] text-mute">取戲折中</p>
        </div>
      </div>
    </main>
  );
}
