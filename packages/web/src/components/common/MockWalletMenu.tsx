'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { truncateAddress } from '@/lib/format';

export interface WalletPersona {
  key: string;
  label: string;
  wallet: string;
  queryValue: string;
  ownedCount: number;
  subscriptionCount: number;
}

const DISCONNECTED = {
  key: 'none',
  label: '未連接',
  wallet: null,
  queryValue: 'none',
  ownedCount: 0,
  subscriptionCount: 0,
};

export function MockWalletMenu({ personas }: { personas: WalletPersona[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const as = searchParams.get('as');
  const defaultPersona = personas[0];
  const active =
    as === 'none'
      ? DISCONNECTED
      : personas.find((persona) => persona.queryValue === as || persona.wallet === as) ??
        defaultPersona;

  const buildHref = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const dossierHref = buildHref({
    filter: 'mine',
    as: active.queryValue === defaultPersona.queryValue ? defaultPersona.queryValue : active.queryValue,
  });

  const subscriptionsHref = active.wallet
    ? `/subscriptions?as=${active.queryValue}`
    : '/subscriptions';

  return (
    <details className="group/menu relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-full bg-canvas/55 px-3 text-2xs tracking-widest text-ink/75 ring-1 ring-hairline transition-colors hover:text-ink hover:ring-ink/25 max-sm:w-8 max-sm:justify-center max-sm:px-0 [&::-webkit-details-marker]:hidden">
        <span
          className={`h-2 w-2 rounded-full ${
            active.wallet ? 'bg-jade shadow-[0_0_12px_rgba(142,172,138,0.35)]' : 'bg-mute/50'
          }`}
        />
        <span className="max-sm:hidden">
          {active.wallet ? truncateAddress(active.wallet, 4, 4) : active.label}
        </span>
      </summary>

      <div className="absolute right-0 top-10 z-50 w-72 rounded-lg border border-hairline bg-elevated p-2 text-sm text-ink shadow-2xl shadow-black/20 max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-16 max-sm:w-auto">
        <div className="px-3 py-2">
          <p className="text-2xs tracking-widest text-mute">目前視角</p>
          <p className="mt-1 font-serif text-base text-ink">{active.label}</p>
          {active.wallet ? (
            <p className="mt-1 font-mono text-2xs text-mute">{truncateAddress(active.wallet)}</p>
          ) : null}
        </div>

        <div className="my-1 h-px bg-hairline" />

        <Link
          href={dossierHref}
          className="flex items-center justify-between rounded-md px-3 py-2 text-ink/75 transition-colors hover:bg-canvas/70 hover:text-ink"
        >
          <span>我的角色</span>
          <span className="font-mono text-xs text-mute">{active.ownedCount}</span>
        </Link>
        <Link
          href={subscriptionsHref}
          className="flex items-center justify-between rounded-md px-3 py-2 text-ink/75 transition-colors hover:bg-canvas/70 hover:text-ink"
        >
          <span>我的訂閱</span>
          <span className="font-mono text-xs text-mute">{active.subscriptionCount}</span>
        </Link>

        {active.key === 'owner' && (
          <Link
            href="/admin"
            className="flex items-center justify-between rounded-md px-3 py-2 text-cinnabar/90 transition-colors hover:bg-canvas/70 hover:text-cinnabar"
          >
            <span>班主後台</span>
            <span className="font-mono text-xs text-mute">Admin</span>
          </Link>
        )}

        <div className="my-1 h-px bg-hairline" />

        <p className="px-3 py-1 text-2xs tracking-widest text-mute">切換視角</p>
        {personas.map((persona) => (
          <Link
            key={persona.key}
            href={buildHref({ as: persona.queryValue })}
            className="flex items-center justify-between rounded-md px-3 py-2 text-ink/75 transition-colors hover:bg-canvas/70 hover:text-ink"
          >
            <span>{persona.label}</span>
            {active.queryValue === persona.queryValue ? (
              <span className="h-1.5 w-1.5 rounded-full bg-cinnabar" />
            ) : null}
          </Link>
        ))}
        <Link
          href={buildHref({ as: 'none' })}
          className="flex items-center justify-between rounded-md px-3 py-2 text-mute transition-colors hover:bg-canvas/70 hover:text-ink"
        >
          <span>斷開錢包</span>
        </Link>
      </div>
    </details>
  );
}
