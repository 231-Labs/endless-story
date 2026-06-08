import { SiteNav } from '@/components/home/SiteNav';

/**
 * Route skeleton for /saga/[id]. The handscroll page awaits a fan-out of
 * chain reads (saga, cast, scenes, locations, relationships) before it can
 * paint the immersive first screen, so cold navigation sat blank. This
 * streams instantly: the canvas + nav + a faint title block and a couple of
 * pulsing scene anchors, mirroring the handscroll's first-screen overlay.
 */
function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-hairline/60 dark:bg-hairline ${className}`} />;
}

export default function SagaLoading() {
  return (
    <main className="h-[100dvh] overflow-hidden bg-canvas">
      <div className="absolute top-0 inset-x-0 z-50">
        <SiteNav />
      </div>

      <div className="relative h-[100dvh] w-full animate-pulse">
        {/* title block (top-left, matches FixedOverlay) */}
        <div className="absolute left-6 top-[calc(var(--es-site-nav-h)+1.5rem)] flex flex-col gap-3 sm:left-10">
          <Bar className="h-3 w-20" /> {/* handscroll eyebrow */}
          <Bar className="h-9 w-56 sm:w-72" /> {/* saga name */}
          <Bar className="h-3 w-40" /> {/* location label */}
        </div>

        {/* world-time (top-right) */}
        <div className="absolute right-6 top-[calc(var(--es-site-nav-h)+1.5rem)] flex flex-col items-end gap-2 sm:right-10">
          <Bar className="h-3 w-24" />
          <Bar className="h-3 w-16" />
        </div>

        {/* faint scene anchors scattered across the scroll */}
        <Bar className="absolute left-[16%] top-[52%] h-3 w-3 rounded-full" />
        <Bar className="absolute left-[30%] top-[44%] h-3 w-3 rounded-full" />
        <Bar className="absolute left-[44%] top-[58%] h-3 w-3 rounded-full" />
        <Bar className="absolute left-[62%] top-[48%] h-3 w-3 rounded-full" />
        <Bar className="absolute left-[74%] top-[60%] h-3 w-3 rounded-full" />

        {/* unroll hint */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
          <Bar className="h-3 w-48" />
        </div>
      </div>
    </main>
  );
}
