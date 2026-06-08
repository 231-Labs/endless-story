import { AdminTabs } from './admin/AdminTabs';

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
 * See AGENTS.md → "on-chain architecture" principle 6 (strict route-group isolation).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-route-group="admin">
      {/* TODO: AdminNav once first real admin page (deploy) ships. */}
      {children}
      <AdminTabs />
    </div>
  );
}
