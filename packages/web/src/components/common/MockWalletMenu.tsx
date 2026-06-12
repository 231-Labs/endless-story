'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ConnectModal,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, read as endlessRead, tx as endlessTx } from '@endless-story/sdk';
import { truncateAddress } from '@/lib/format';
import { getMySubscriptionsPageData } from '@/lib/actions/subscriptions-page';
import { useSagaAdmin } from '@/lib/hooks/useSagaAdmin';
import { useToast } from '@/components/common/Toaster';

export function MockWalletMenu() {
  // ── Real wallet (dapp-kit) ───────────────────────────────────────
  const { account, isSagaAdmin } = useSagaAdmin();
  const { mutate: disconnect } = useDisconnectWallet();
  const { mutate: signAndExecute, isPending: isDripping } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();
  const [connectOpen, setConnectOpen] = useState(false);
  const toast = useToast();
  const [balance, setBalance] = useState<string>('—');
  const [balanceTick, setBalanceTick] = useState(0);
  const [dripError, setDripError] = useState<string | null>(null);
  // Real on-chain character count for the connected wallet — replaces the
  // mock persona's ownedCount once a wallet is in. Null until first fetch.
  const [chainOwnedCount, setChainOwnedCount] = useState<number | null>(null);
  const [subscriptionCount, setSubscriptionCount] = useState<number | null>(null);

  const packageId = ENDLESS_STORY_DEPLOYMENT.packageId;
  const faucetId = ENDLESS_STORY_DEPLOYMENT.faucetId;
  const faucetAdminCapId = ENDLESS_STORY_DEPLOYMENT.faucetAdminCapId;

  // Detect whether the connected wallet owns the FaucetAdminCap — if so we
  // can admin_mint (no cooldown) instead of drip (24h cooldown per address).
  const [isFaucetAdmin, setIsFaucetAdmin] = useState(false);
  useEffect(() => {
    if (!account || !faucetAdminCapId) {
      setIsFaucetAdmin(false);
      return;
    }
    let cancelled = false;
    suiClient
      .getObject({ id: faucetAdminCapId, options: { showOwner: true } })
      .then((res) => {
        if (cancelled) return;
        const owner = res.data?.owner;
        if (owner && typeof owner === 'object' && 'AddressOwner' in owner) {
          setIsFaucetAdmin(owner.AddressOwner === account.address);
        } else {
          setIsFaucetAdmin(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsFaucetAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, suiClient, faucetAdminCapId]);

  // Count of Character NFTs owned by the connected wallet — via OwnerCap
  // pagination (single round-trip when ≤50 caps). Cleared on disconnect.
  useEffect(() => {
    if (!account || !packageId) {
      setChainOwnedCount(null);
      return;
    }
    let cancelled = false;
    endlessRead.character
      .listOwnerCapsForAddress(suiClient, account.address, packageId)
      .then((caps) => {
        if (!cancelled) setChainOwnedCount(caps.length);
      })
      .catch(() => {
        if (!cancelled) setChainOwnedCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account, suiClient, packageId, balanceTick]);

  useEffect(() => {
    if (!account) {
      setSubscriptionCount(null);
      return;
    }
    let cancelled = false;
    getMySubscriptionsPageData(account.address)
      .then(({ subscriptions, characters }) => {
        if (cancelled) return;
        const charIds = new Set(characters.map((c) => c.id));
        setSubscriptionCount(subscriptions.filter((s) => charIds.has(s.characterId)).length);
      })
      .catch(() => {
        if (!cancelled) setSubscriptionCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account, balanceTick]);

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
    if (isFaucetAdmin && faucetAdminCapId) {
      // Admin → admin_mint to self. Bypasses the 24h cooldown that drip
      // enforces per-address. 1000 ENDLESS = ~10 vouchers at typical prices.
      // Salt the amount so consecutive clicks produce distinct tx payloads
      // (avoids Sui's tx-digest dedup returning cached effects).
      const baseAmount = 1_000_000_000n; // 1000 ENDLESS at 6 decimals
      const salt = BigInt(Date.now() % 100_000);
      tx.add(
        endlessTx.faucet.adminMint({
          admin: faucetAdminCapId,
          faucet: faucetId,
          amount: baseAmount + salt,
          recipient: account!.address,
        }),
      );
    } else {
      // Regular user → drip (10 ENDLESS, then 24h cooldown).
      tx.add(endlessTx.faucet.drip({ faucet: faucetId }));
    }
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: () => {
          setBalanceTick((n) => n + 1);
          toast('銀子到帳，餘額更新中', 'success');
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          setDripError(msg);
          toast(`領銀沒成：${msg.slice(0, 60)}`, 'error');
        },
      },
    );
  };

  const isConnected = !!account;
  // Real wallet drives every viewer-scoped link. When disconnected we hide
  // the personal-content links entirely (see render below), so no fallback
  // address is needed.
  const dossierHref = isConnected
    ? `/dossier?filter=mine&as=${account.address}`
    : '/dossier';
  const chamberHref = isConnected
    ? `/chamber?id=${account.address}`
    : '/chamber';
  const subscriptionsHref = '/subscriptions';

  const pillLabel = isConnected ? truncateAddress(account.address, 4, 4) : '未連接';

  return (
    <>
      <details className="group/menu relative">
        <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-full bg-canvas/55 px-3 text-2xs tracking-widest text-ink/75 ring-1 ring-hairline transition-colors hover:text-ink hover:ring-ink/25 max-sm:w-8 max-sm:justify-center max-sm:px-0 [&::-webkit-details-marker]:hidden">
          <span
            className={`h-2 w-2 rounded-full ${
              isConnected ? 'bg-jade shadow-[0_0_12px_rgba(142,172,138,0.35)]' : 'bg-mute/50'
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
                      {isDripping ? '領取中…' : isFaucetAdmin ? 'Admin 補水' : '領 ENDLESS'}
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

          {isConnected && (
            <>
              <div className="my-1 h-px bg-hairline" />

              {/* ── 視角 / 內容導覽 ── */}
              <Link
                href={dossierHref}
                className="flex items-center justify-between rounded-md px-3 py-2 text-ink/75 transition-colors hover:bg-canvas/70 hover:text-ink"
              >
                <span>我的角色</span>
                <span className="font-mono text-xs text-mute">{chainOwnedCount ?? '—'}</span>
              </Link>
              <Link
                href={chamberHref}
                className="flex items-center justify-between rounded-md px-3 py-2 text-ink/75 transition-colors hover:bg-canvas/70 hover:text-ink"
              >
                <span>我的藏閣</span>
                <span className="font-serif text-xs text-mute">藏</span>
              </Link>
              <Link
                href={subscriptionsHref}
                className="flex items-center justify-between rounded-md px-3 py-2 text-ink/75 transition-colors hover:bg-canvas/70 hover:text-ink"
              >
                <span>我的訂閱</span>
                <span className="font-mono text-xs text-mute">{subscriptionCount ?? '—'}</span>
              </Link>

              {isSagaAdmin && (
                <Link
                  href="/admin"
                  className="flex items-center justify-between rounded-md px-3 py-2 text-cinnabar/90 transition-colors hover:bg-canvas/70 hover:text-cinnabar"
                >
                  <span>班主後台</span>
                  <span className="font-mono text-xs text-mute">Admin</span>
                </Link>
              )}

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
