'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSagaAdmin } from '@/lib/hooks/useSagaAdmin';
import { FlowIndicator, useFlowingIndicator } from '@/components/common/ink-motion';

const TABS = [
  { key: '/admin', label: '駕駛艙' },
  { key: '/admin/troupe', label: '劇團' },
  { key: '/admin/stage', label: '戲台' },
  { key: '/admin/recruitments', label: '徵召' },
  { key: '/admin/deploy', label: '系統' },
  { key: '/admin/assets', label: '資產' },
];

function isTabActive(tabKey: string, pathname: string): boolean {
  return tabKey === '/admin'
    ? pathname === tabKey
    : pathname === tabKey || pathname.startsWith(`${tabKey}/`);
}

export function AdminTabs() {
  const pathname = usePathname();
  const { isSagaAdmin } = useSagaAdmin();
  const activeKey = TABS.find((tab) => isTabActive(tab.key, pathname))?.key ?? '';
  const { containerRef, box } = useFlowingIndicator<HTMLDivElement>(activeKey);

  // Hide the entire admin tab bar for non-admins — gating the page contents
  // alone would still leak the existence + names of admin routes.
  if (!isSagaAdmin) return null;

  return (
    <nav className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transition-all duration-500 ease-out">
      <div className="flex items-center gap-2 rounded-full border border-hairline/30 bg-elevated/85 px-2 py-2 backdrop-blur-xl shadow-2xl supports-[backdrop-filter]:bg-elevated/60 dark:shadow-black/60">
        <div ref={containerRef} className="no-scrollbar relative flex items-center gap-1 overflow-x-auto px-1">
          <FlowIndicator box={box} />
          {TABS.map((tab) => {
            const isActive = tab.key === activeKey;
            return (
              <Link
                key={tab.key}
                href={tab.key}
                data-flow-key={tab.key}
                aria-current={isActive ? 'page' : undefined}
                className={`relative z-10 flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium tracking-wide transition-colors ${
                  isActive ? 'text-canvas' : 'text-ink/65 hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
