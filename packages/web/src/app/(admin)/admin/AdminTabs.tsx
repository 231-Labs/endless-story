'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { key: '/admin', label: '總覽' },
  { key: '/admin/deploy', label: '部署' },
  { key: '/admin/recruitments', label: '徵召' },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transition-all duration-500 ease-out">
      <div className="flex items-center gap-2 rounded-full border border-hairline/30 bg-elevated/85 px-2 py-2 backdrop-blur-xl shadow-2xl supports-[backdrop-filter]:bg-elevated/60 dark:shadow-black/60">
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto px-1">
          {TABS.map((tab) => {
            const isActive = pathname === tab.key;
            return (
              <Link
                key={tab.key}
                href={tab.key}
                className={`relative flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium tracking-wide transition-colors ${
                  isActive
                    ? 'bg-ink text-canvas dark:bg-ink dark:text-canvas'
                    : 'text-ink/65 hover:bg-surface hover:text-ink'
                }`}
              >
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
