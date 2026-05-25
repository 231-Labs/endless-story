import { Suspense } from 'react';
import { MockWalletMenu, type WalletPersona } from '@/components/common/MockWalletMenu';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { WalletConnect } from '@/components/common/WalletConnect';
import { charactersApi, subscriptionsApi } from '@/lib/api/index';
import { DEMO_OWNERS } from '@/mocks/characters';
import { DEMO_VIEWER_WALLET } from '@/mocks/subscriptions';

export async function SiteNav() {
  const [ownerCharacters, ownerSubscriptions, viewerSubscriptions] = await Promise.all([
    charactersApi.listOwnedCharacters(DEMO_OWNERS.OWNER_A),
    subscriptionsApi.listMySubscriptions(DEMO_OWNERS.OWNER_A),
    subscriptionsApi.listMySubscriptions(DEMO_VIEWER_WALLET),
  ]);

  const personas: WalletPersona[] = [
    {
      key: 'owner',
      label: '班主視角',
      wallet: DEMO_OWNERS.OWNER_A,
      queryValue: DEMO_OWNERS.OWNER_A,
      ownedCount: ownerCharacters.length,
      subscriptionCount: ownerSubscriptions.length,
    },
    {
      key: 'viewer',
      label: '看客視角',
      wallet: DEMO_VIEWER_WALLET,
      queryValue: 'viewer',
      ownedCount: 0,
      subscriptionCount: viewerSubscriptions.length,
    },
  ];

  return (
    <nav className="sticky top-0 z-40 border-b border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3.5 sm:gap-4 sm:px-10 sm:py-5">
        <a href="/" className="flex shrink-0 items-center gap-2.5 font-serif text-base font-medium tracking-wide text-ink transition-colors hover:text-cinnabar sm:text-xl">
          <div className="relative h-10 w-auto -my-2 shrink-0 sm:h-14 sm:-my-4">
            <img src="/logo.png" alt="Endless Story Logo" className="h-full w-auto opacity-0" />
            <div 
              className="absolute inset-0 bg-cinnabar transition-colors"
              style={{
                maskImage: 'url(/logo.png)',
                maskSize: 'contain',
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
                WebkitMaskImage: 'url(/logo.png)',
                WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
              }}
            />
          </div>
          無盡敘界
        </a>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs font-medium text-ink/75 sm:gap-6 sm:text-sm md:gap-8">
          <a href="/" className="shrink-0 whitespace-nowrap transition-colors hover:text-ink">
            首頁
          </a>
          <a
            href="/saga/spring-snow"
            className="shrink-0 whitespace-nowrap transition-colors hover:text-ink"
            title="梨園手卷 — 春雪社沉浸式展卷"
          >
            手卷
          </a>
          <a
            href="/dossier"
            className="shrink-0 whitespace-nowrap transition-colors hover:text-ink"
            title="班底名冊 — 人物、徵召與訂閱"
          >
            名冊
          </a>
          <a
            href="/feed"
            className="shrink-0 whitespace-nowrap transition-colors hover:text-ink"
            title="梨園章回 — 公開章回連載"
          >
            章回
          </a>
          <WalletConnect />
          <Suspense fallback={<div className="h-8 w-24 rounded-full bg-canvas/60 ring-1 ring-hairline" />}>
            <MockWalletMenu personas={personas} />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
