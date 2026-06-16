'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { InkUnderline } from '@/components/common/ink-motion';

interface NavLink {
  href: string;
  label: string;
  title?: string;
  match: (pathname: string) => boolean;
}

const LINKS: NavLink[] = [
  { href: '/', label: '首頁', match: (p) => p === '/' },
  { href: '/saga/spring-snow', label: '手卷', title: '梨園手卷 — 春雪社沉浸式展卷', match: (p) => p.startsWith('/saga') },
  { href: '/dossier', label: '名冊', title: '班底名冊 — 人物、徵召與訂閱', match: (p) => p.startsWith('/dossier') },
  { href: '/feed', label: '章回', title: '梨園章回 — 公開章回連載', match: (p) => p.startsWith('/feed') },
];

/** Nav links with the shared 墨韻 "you are here" underline. Soft Link navigation
 *  (was full-reload <a>) so route changes feel continuous. */
export function SiteNavLinks() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((l) => {
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
    </>
  );
}
