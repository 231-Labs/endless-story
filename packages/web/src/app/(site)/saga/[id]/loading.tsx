import { SiteNav } from '@/components/home/SiteNav';

/**
 * /saga route loading — a handscroll-shaped placeholder: title block up top,
 * painted-panel columns with a fan row beneath, mirroring the real layout so
 * the wait reads as「卷軸正在展開」rather than a generic spinner.
 */
export default function SagaLoading() {
  return (
    <main className="relative flex h-[100dvh] flex-col overflow-hidden bg-canvas">
      <SiteNav />
      <header className="shrink-0 px-[max(1rem,env(safe-area-inset-left))] pt-4 sm:px-10">
        <div className="animate-pulse">
          <div className="h-3 w-16 rounded bg-hairline/50" />
          <div className="mt-3 h-8 w-44 rounded bg-hairline/60 sm:h-9" />
          <div className="mt-2.5 h-3 w-56 max-w-[70vw] rounded bg-hairline/40" />
        </div>
      </header>
      <div className="mt-6 flex min-h-0 flex-1 items-stretch overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex h-full w-[clamp(330px,69vh,780px)] shrink-0 flex-col border-r border-black/[0.08] last:border-r-0 dark:border-white/[0.05]"
          >
            <div
              className="h-[clamp(220px,46vh,520px)] w-full shrink-0 animate-pulse bg-gradient-to-b from-surface to-canvas dark:from-elevated/50 dark:to-canvas"
              style={{ animationDelay: `${i * 0.25}s` }}
            />
            <div className="flex flex-1 content-start justify-center gap-x-4 gap-y-3 px-3 pt-5">
              {[0, 1, 2].map((k) => (
                <span
                  key={k}
                  className="h-[60px] w-[60px] animate-pulse rounded-full bg-hairline/40 dark:bg-hairline/25"
                  style={{ animationDelay: `${(i * 3 + k) * 0.12}s` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-[10%] z-10 text-center font-serif text-2xs tracking-[0.5em] text-ink/55"
      >
        <span className="pl-[0.5em]">展卷中</span>
      </p>
      <span role="status" className="sr-only">
        展卷中
      </span>
    </main>
  );
}
