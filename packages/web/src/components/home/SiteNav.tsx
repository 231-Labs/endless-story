import { Suspense } from 'react';
import { MockWalletMenu } from '@/components/common/MockWalletMenu';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { SiteNavLinks } from '@/components/home/SiteNavLinks';

export function SiteNav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3.5 sm:gap-4 sm:px-10 sm:py-5">
        <a href="/" className="flex shrink-0 items-center gap-2.5 font-serif text-base font-medium tracking-wide text-ink transition-colors hover:text-cinnabar sm:text-xl">
          {/* logo.png 是 256×256 正方 — 直接給固定尺寸的 mask 容器，
              省掉先前那張 opacity-0 純撐尺寸的隱形圖片請求 */}
          <div
            aria-hidden
            className="-my-2 h-10 w-10 shrink-0 bg-cinnabar transition-colors sm:-my-4 sm:h-14 sm:w-14"
            style={{
              maskImage: 'url(/logo.png)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
              WebkitMaskImage: 'url(/logo.png)',
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
            }}
          />
          春雪社
        </a>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs font-medium text-ink/75 sm:gap-6 sm:text-sm md:gap-8">
          <Suspense fallback={<div className="h-4 w-24 animate-pulse rounded bg-hairline/40" />}>
            <SiteNavLinks />
          </Suspense>
          <Suspense fallback={<div className="h-8 w-24 rounded-full bg-canvas/60 ring-1 ring-hairline" />}>
            <MockWalletMenu />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
