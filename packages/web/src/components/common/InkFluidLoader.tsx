import { InkFluid } from './InkFluid';
import { SiteNav } from '@/components/home/SiteNav';
import type { InkVariant } from '@/lib/ink/palette';

interface InkFluidLoaderProps {
  /** Which ink program runs in the content area. Default 墨綻 (bloom). */
  variant?: InkVariant;
  /** Loading copy — kept quiet so the ink is the subject. Also the SR announcement. */
  label?: string;
  /** Let the viewer push the ink around while they wait. */
  interactive?: boolean;
}

/**
 * 水墨 loading screen — the ink itself is the imagery (墨染意象), no seal/wordmark.
 * The SiteNav stays put at the top and the wash lives in the content area below it
 * (so a route load never blanks the navbar). In day mode the canvas is flat page
 * colour, so the ink reads as floating on the page. Drop-in for a route `loading.tsx`.
 */
export function InkFluidLoader({ variant = 'bloom', label = '載入中', interactive = false }: InkFluidLoaderProps) {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-canvas">
      <SiteNav />
      <div className="relative flex-1 overflow-hidden">
        <InkFluid variant={variant} interactive={interactive} className="absolute inset-0" />

        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[14%] z-10 flex justify-center">
          <p className="flex items-center gap-2 font-serif text-2xs tracking-[0.5em] text-ink/55">
            <span className="pl-[0.5em]">{label}</span>
            <WaitDots />
          </p>
        </div>

        {/* role=status scoped to the announcer keeps <main> a landmark during loads */}
        <span role="status" className="sr-only">
          {label}
        </span>
      </div>
    </main>
  );
}

/** 等待中的三點墨痕. */
function WaitDots() {
  return (
    <span aria-hidden className="inline-flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-[3px] w-[3px] rounded-full bg-ink/70"
          style={{ animation: `es-wait-dot 1.4s ease-in-out ${i * 0.18}s infinite` }}
        />
      ))}
    </span>
  );
}
