/**
 * (site) route group layout.
 *
 * Houses every user-facing route ( / · /dossier · /feed · /saga ·
 * /subscriptions ). Currently a pass-through so existing pages keep their
 * own SiteNav rendering (the homepage in particular hides nav during the
 * recruitment wizard, so we can't hoist SiteNav here without coordinating
 * that state).
 *
 * Future: hoist SiteNav + ThemeToggle + footer here once homepage's
 * nav-hide behaviour is refactored into a context.
 *
 * See AGENTS.md → 「鏈上架構」原則 6 (route group 嚴格隔離).
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
