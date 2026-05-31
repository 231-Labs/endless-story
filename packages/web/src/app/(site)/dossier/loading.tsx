import { SiteNav } from '@/components/home/SiteNav';

/**
 * Route skeleton for /dossier. The page's server component awaits a fan-out
 * of chain reads (character, saga, scene, relationships, memories, persona,
 * live-state…) before it can paint, so on a cold navigation the screen sat
 * blank. This streams instantly as the Suspense fallback while that data
 * loads, mirroring the DossierHeader layout (portrait + name/meta + the
 * live-state bar) so the transition doesn't jump.
 */
function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-hairline/60 dark:bg-hairline ${className}`} />;
}

export default function DossierLoading() {
  return (
    <main className="h-[100dvh] overflow-hidden bg-canvas">
      <SiteNav />
      <div className="flex min-h-[calc(100dvh-var(--es-site-nav-h))] flex-col justify-center pb-16">
        <div className="w-full px-5 sm:px-10">
          <div className="mx-auto max-w-6xl animate-pulse">
            {/* back link */}
            <Bar className="mb-10 h-4 w-32" />

            <div className="flex flex-col gap-8 md:flex-row md:items-center md:gap-12 lg:gap-16">
              {/* portrait */}
              <div className="w-40 shrink-0 sm:w-56 lg:w-[320px]">
                <div className="aspect-[4/5] w-full rounded-xl bg-hairline/60 dark:bg-hairline" />
              </div>

              {/* name + meta */}
              <div className="flex flex-1 flex-col justify-center py-2 lg:py-8">
                <Bar className="h-4 w-40" /> {/* role · saga eyebrow */}
                <Bar className="mt-4 h-14 w-72 sm:h-16 lg:h-20" /> {/* name */}
                <Bar className="mt-6 h-4 w-56" /> {/* gender · age · owner */}

                {/* chips */}
                <div className="mt-6 flex gap-3">
                  <Bar className="h-8 w-28 rounded-full" />
                  <Bar className="h-8 w-20 rounded-full" />
                </div>

                {/* live-state bar */}
                <div className="mt-12 border-t border-hairline pt-6 sm:pt-8">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="min-w-0">
                        <Bar className="h-3 w-16" />
                        <Bar className="mt-3 h-5 w-full max-w-[12rem]" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
