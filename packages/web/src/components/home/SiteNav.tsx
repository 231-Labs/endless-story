import { Suspense } from 'react';
import { MockWalletMenu, type WalletPersona } from '@/components/common/MockWalletMenu';
import { ThemeToggle } from '@/components/common/ThemeToggle';
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
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-10 sm:py-5">
        <a href="/" className="font-serif text-lg font-medium tracking-wide text-ink sm:text-xl">
          無盡敘界
        </a>
        <div className="flex items-center gap-4 text-sm font-medium text-ink/70 sm:gap-8">
          <a href="/" className="transition-colors hover:text-ink">首頁</a>
          <a href="/saga/saga_chunxue_demo" className="transition-colors hover:text-ink">春雪社</a>
          <a href="/dossier" className="transition-colors hover:text-ink">人物誌</a>
          <a href="/feed" className="transition-colors hover:text-ink">連載</a>
          <Suspense fallback={<div className="h-8 w-24 rounded-full bg-canvas/60 ring-1 ring-hairline" />}>
            <MockWalletMenu personas={personas} />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
