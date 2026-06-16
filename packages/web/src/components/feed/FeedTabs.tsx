'use client';

import Link from 'next/link';
import { InkUnderline } from '@/components/common/ink-motion';

// IA (docs/CONTENT_PIPELINE.md §8.1): 全部 landing · 公報 free funnel ·
// 章回 the woven cuts · 影像.
export type FeedMode = 'all' | 'gazette' | 'chapter' | 'visual';

const MODES: { key: FeedMode; label: string; shortLabel: string }[] = [
  { key: 'all', label: '全部', shortLabel: '全部' },
  { key: 'gazette', label: '公報', shortLabel: '公報' },
  { key: 'chapter', label: '章回 · 合本', shortLabel: '章回' },
  { key: 'visual', label: '影像與畫冊', shortLabel: '影像' },
];

export function FeedTabs({ mode }: { mode: FeedMode }) {
  return (
    <div className="-mx-5 mt-6 flex gap-4 overflow-x-auto border-b border-hairline px-5 pb-px sm:mx-0 sm:mt-8 sm:flex-wrap sm:gap-8 sm:overflow-visible sm:px-0">
      {MODES.map((m) => {
        const isActive = m.key === mode;
        return (
          <Link
            key={m.key}
            href={{ pathname: '/feed', query: m.key === 'all' ? {} : { mode: m.key } }}
            aria-current={isActive ? 'page' : undefined}
            className={`relative shrink-0 whitespace-nowrap pb-3 text-sm tracking-wide transition-colors ${
              isActive ? 'text-ink' : 'text-mute hover:text-ink'
            }`}
          >
            <span className="sm:hidden">{m.shortLabel}</span>
            <span className="hidden sm:inline">{m.label}</span>
            {isActive ? <InkUnderline groupId="feed-tabs" /> : null}
          </Link>
        );
      })}
    </div>
  );
}
