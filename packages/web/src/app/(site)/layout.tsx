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
 * See the on-chain architecture contract, principle 6 (strict route-group isolation).
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
