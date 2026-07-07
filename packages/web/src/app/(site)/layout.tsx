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
import { ensureEventStoreRegistered } from '@/lib/server/event-store';
import { ensureRuntimeDeploymentLoaded } from '@/lib/server/deployment-manifest';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // Register the durable event store on the worker serving this reader page, so
  // chapter / feed / dossier reads come from Postgres instead of live RPC.
  // Idempotent + best-effort; no-op without DATABASE_URL. Runs before the child
  // page renders, so the page's reads see the registered store.
  await ensureEventStoreRegistered();
  // Apply the runtime deployment override (post-upgrade ids) before the page
  // builds any tx. No-op without DEPLOYMENT_MANIFEST_PATH.
  ensureRuntimeDeploymentLoaded();
  return <>{children}</>;
}
