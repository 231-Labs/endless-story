'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ConnectModal,
  useCurrentAccount,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
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

  // ── Real wallet (dapp-kit) ───────────────────────────────────────
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const { mutate: signAndExecute, isPending: isDripping } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();
  const [connectOpen, setConnectOpen] = useState(false);
  const [balance, setBalance] = useState<string>('—');
  const [balanceTick, setBalanceTick] = useState(0);
  const [dripError, setDripError] = useState<string | null>(null);

  const packageId = ENDLESS_STORY_DEPLOYMENT.packageId;
  const faucetId = ENDLESS_STORY_DEPLOYMENT.faucetId;

  useEffect(() => {
    if (!account || !packageId) {
      setBalance('—');
      return;
    }
    let cancelled = false;
    const coinType = `${packageId}::currency::CURRENCY`;
    suiClient
      .getBalance({ owner: account.address, coinType })
      .then((b) => {
        if (cancelled) return;
        const whole = Number(BigInt(b.totalBalance) / BigInt(10 ** 6));
        setBalance(`${whole.toLocaleString()} ENDLESS`);
      })
      .catch(() => {
        if (!cancelled) setBalance('—');
      });
    return () => {
      cancelled = true;
    };
  }, [account, suiClient, packageId, balanceTick]);

  const handleDrip = () => {
    if (!faucetId) {
      setDripError('faucet 尚未種子化');
      return;
    }
    setDripError(null);
    const tx = new Transaction();
    tx.add(endlessTx.faucet.drip({ faucet: faucetId }));
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: () => setBalanceTick((n) => n + 1),
        onError: (err) => setDripError(err instanceof Error ? err.message : String(err)),
      },
    );
  };

  // ── Mock persona (demo data filter) ──────────────────────────────
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

  // ── Pill display priority: real wallet > mock persona ───────────
  const isConnected = !!account;
  const pillAddress = isConnected ? account.address : active.wallet;
  const pillLabel = isConnected ? truncateAddress(account.address, 4, 4) : active.label;

  return (
    <>
      <details className="group/menu relative">
        <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-full bg-canvas/55 px-3 text-2xs tracking-widest text-ink/75 ring-1 ring-hairline transition-colors hover:text-ink hover:ring-ink/25 max-sm:w-8 max-sm:justify-center max-sm:px-0 [&::-webkit-details-marker]:hidden">
          <span
            className={`h-2 w-2 rounded-full ${
              pillAddress ? 'bg-jade shadow-[0_0_12px_rgba(142,172,138,0.35)]' : 'bg-mute/50'
            }`}
          />
          <span className="max-sm:hidden">{pillLabel}</span>
        </summary>

        <div className="absolute right-0 top-10 z-50 w-72 rounded-lg border border-hairline bg-elevated p-2 text-sm text-ink shadow-2xl shadow-black/20 max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-16 max-sm:w-auto">
          {/* ── 錢包區塊 ── */}
          <div className="px-3 py-2">
            <p className="text-2xs tracking-widest text-mute">錢包</p>
            {isConnected ? (
              <>
                <p className="mt-1 font-mono text-xs text-ink">{truncateAddress(account.address)}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-jade">{balance}</span>
                  {faucetId && (
                    <button
                      type="button"
                      onClick={handleDrip}
                      disabled={isDripping}
                      className="rounded-full bg-cinnabar/15 px-2.5 py-0.5 text-2xs tracking-widest text-cinnabar transition-colors hover:bg-cinnabar/25 disabled:opacity-50"
                    >
                      {isDripping ? '領取中…' : '領 ENDLESS'}
                    </button>
                  )}
                </div>
                {dripError && (
                  <p className="mt-1.5 truncate text-2xs text-cinnabar" title={dripError}>
                    {dripError}
                  </p>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConnectOpen(true)}
                className="mt-1 w-full rounded-md bg-cinnabar/10 px-3 py-2 text-2xs tracking-widest text-cinnabar transition-colors hover:bg-cinnabar/20"
              >
                連結錢包
              </button>
            )}
          </div>

          <div className="my-1 h-px bg-hairline" />

          {/* ── 視角 / 內容導覽 ── */}
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

          {(active.key === 'owner' || isConnected) && (
            <Link
              href="/admin"
              className="flex items-center justify-between rounded-md px-3 py-2 text-cinnabar/90 transition-colors hover:bg-canvas/70 hover:text-cinnabar"
            >
              <span>班主後台</span>
              <span className="font-mono text-xs text-mute">Admin</span>
            </Link>
          )}

          <div className="my-1 h-px bg-hairline" />

          {/* ── Demo 視角切換 ── */}
          <p className="px-3 py-1 text-2xs tracking-widest text-mute">Demo 視角（mock 資料）</p>
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

          {isConnected && (
            <>
              <div className="my-1 h-px bg-hairline" />
              <button
                type="button"
                onClick={() => disconnect()}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-mute transition-colors hover:bg-canvas/70 hover:text-cinnabar"
              >
                <span>斷開錢包</span>
              </button>
            </>
          )}
        </div>
      </details>

      <ConnectModal
        trigger={<span style={{ display: 'none' }} />}
        open={connectOpen}
        onOpenChange={setConnectOpen}
      />
    </>
  );
}
