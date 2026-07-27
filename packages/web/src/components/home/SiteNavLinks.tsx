'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { InkUnderline } from '@/components/common/ink-motion';

interface NavLink {
  href: string;
  label: string;
  title?: string;
  match: (pathname: string) => boolean;
}

/** Primary IA: 春雪社. Chain surfaces only when ?chain=1. */
const PRIMARY: NavLink[] = [
  { href: '/', label: '春雪社', match: (p) => p === '/' },
];

const CHAIN_TEST: NavLink[] = [
  { href: '/saga/spring-snow', label: '手卷', title: '鏈測 · 梨園手卷', match: (p) => p.startsWith('/saga') },
  { href: '/dossier', label: '名冊', title: '鏈測 · 班底名冊', match: (p) => p.startsWith('/dossier') },
  { href: '/feed', label: '章回', title: '鏈測 · 梨園章回', match: (p) => p.startsWith('/feed') },
];

export function SiteNavLinks() {
  const pathname = usePathname();
  const search = useSearchParams();
  const showChain = search?.get('chain') === '1' || pathname.startsWith('/saga') || pathname.startsWith('/dossier') || pathname.startsWith('/feed');
  const links = showChain ? [...PRIMARY, ...CHAIN_TEST] : PRIMARY;

  return (
    <>
      {links.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            title={l.title}
            aria-current={active ? 'page' : undefined}
            className={`relative shrink-0 whitespace-nowrap pb-0.5 transition-colors ${
              active ? 'text-ink' : 'hover:text-ink'
            }`}
          >
            {l.label}
            {active ? <InkUnderline groupId="site-nav" /> : null}
          </Link>
        );
      })}
      {!showChain ? (
        <Link
          href="/?chain=1"
          title="顯示鏈上測試導覽"
          className="relative shrink-0 whitespace-nowrap pb-0.5 text-mute/70 transition-colors hover:text-ink"
        >
          鏈測
        </Link>
      ) : null}
    </>
  );
}
