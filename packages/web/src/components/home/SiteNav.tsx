import { ThemeToggle } from '@/components/common/ThemeToggle';

export function SiteNav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-10 sm:py-5">
        <a href="/" className="font-serif text-lg font-medium tracking-wide text-ink sm:text-xl">
          無盡敘界
        </a>
        <div className="flex items-center gap-5 text-sm font-medium text-ink/70 sm:gap-8">
          <a href="/" className="transition-colors hover:text-ink">今日</a>
          <a href="/dossier" className="transition-colors hover:text-ink">人物誌</a>
          <a href="/feed" className="transition-colors hover:text-ink">連載</a>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
