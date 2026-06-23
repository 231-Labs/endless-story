import { AdminTabs } from './admin/AdminTabs';
import { ensureEventStoreRegistered } from '@/lib/server/event-store';

/**
 * (admin) route group layout.
 *
 * Houses every operator-facing route ( /admin/* — deploy, world inspector,
 * recruitment override, runner controls when Phase 2+ lands ).
 *
 * Currently a pass-through. Future additions:
 *   - AdminNav with deploy status badge
 *   - Connection state to active devnet/testnet
 *   - Wallet gate (only allow specific addresses via middleware)
 *
 * See the on-chain architecture contract, principle 6 (strict route-group isolation).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Register the durable event store on the worker serving this admin page, so
  // storyteller / roster reads come from Postgres instead of live RPC.
  await ensureEventStoreRegistered();
  return (
    <div data-route-group="admin">
      {/* TODO: AdminNav once first real admin page (deploy) ships. */}
      {children}
      <AdminTabs />
    </div>
  );
}
