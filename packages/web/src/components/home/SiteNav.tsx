export function SiteNav() {
  return (
    <nav className="border-b border-ink/10 px-8 py-4">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <a href="/" className="font-serif text-lg tracking-widest text-cinnabar">
          無盡梨園
        </a>
        <div className="flex items-center gap-6 text-xs tracking-widest text-ink/60">
          <a href="/" className="hover:text-ink">今日</a>
          <a href="/dossier" className="hover:text-ink">人物誌</a>
          <a href="/feed" className="hover:text-ink">連載</a>
          <a href="/subscribe" className="hover:text-ink">訂閱</a>
        </div>
      </div>
    </nav>
  );
}
