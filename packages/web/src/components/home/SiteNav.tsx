export function SiteNav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-10 sm:py-5">
        <a href="/" className="font-serif text-lg tracking-wider text-ink sm:text-xl">
          無盡敘界
        </a>
        <div className="flex items-center gap-5 text-sm text-mute sm:gap-8">
          <a href="/" className="hover:text-ink">今日</a>
          <a href="/dossier" className="hover:text-ink">人物誌</a>
          <a href="/feed" className="hover:text-ink">連載</a>
          <a href="/subscribe" className="hover:text-ink">訂閱</a>
        </div>
      </div>
    </nav>
  );
}
