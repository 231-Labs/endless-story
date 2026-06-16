import { InkFluid } from './InkFluid';
import { SiteNav } from '@/components/home/SiteNav';

// 水墨 loading screen: SiteNav stays at the top, the wash fills the content area
// below it (a route load never blanks the navbar). Day mode is flat page colour.
export function InkFluidLoader({ label = '載入中' }: { label?: string }) {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-canvas">
      <SiteNav />
      <div className="relative flex-1 overflow-hidden">
        <InkFluid className="absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[14%] z-10 flex justify-center">
          <p className="flex items-center gap-2 font-serif text-2xs tracking-[0.5em] text-ink/55">
            <span className="pl-[0.5em]">{label}</span>
            <WaitDots />
          </p>
        </div>
        <span role="status" className="sr-only">
          {label}
        </span>
      </div>
    </main>
  );
}

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
