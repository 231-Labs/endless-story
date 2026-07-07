'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentAccount, useCurrentClient, useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, normalizeTxResult, read, tx as endlessTx } from '@endless-story/sdk';

type Listing = Awaited<ReturnType<typeof read.kiosk.listKioskStillListings>>[number];

/**
 * 訪客購買面板 — lists the Stills currently on sale in a vault's Kiosk and lets
 * a connected wallet buy one with SUI. Read-only otherwise; no owner controls.
 */
export function PurchasePanel({
  kioskId,
  vaultName,
}: {
  kioskId: string;
  vaultName?: string;
}) {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const dappKit = useDAppKit();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    read.kiosk
      .listKioskStillListings(client, kioskId)
      .then(setListings)
      .catch(() => setListings([]));
  }, [client, kioskId]);

  useEffect(() => {
    setListings(null);
    reload();
  }, [reload]);

  const buy = useCallback(
    async (l: Listing) => {
      if (!account) {
        setError('購買請先連結錢包');
        return;
      }
      setError(null);
      setBuyingId(l.stillId);
      try {
        const tx = new Transaction();
        const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(l.priceMist))]);
        const still = endlessTx.still.purchase(tx, {
          kiosk: kioskId,
          stillId: l.stillId,
          payment,
          transferPolicy: ENDLESS_STORY_DEPLOYMENT.stillTransferPolicyId,
        });
        tx.transferObjects([still], account.address);
        const res = normalizeTxResult(await dappKit.signAndExecuteTransaction({ transaction: tx }));
        if (!res.success) {
          throw new Error(res.error ?? '購買失敗');
        }
        reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBuyingId(null);
      }
    },
    [account, kioskId, dappKit, reload],
  );

  return (
    <aside className="absolute bottom-20 right-5 top-16 z-20 flex w-[23rem] flex-col overflow-hidden rounded-xl border border-hairline bg-surface/80 text-ink shadow-2xl backdrop-blur-xl dark:bg-[#0b0d12]/65">
      <div className="border-b border-hairline px-4 pb-3 pt-4">
        <h2 className="font-serif text-base tracking-[0.3em] text-ink">購買面板</h2>
        <p className="mt-1 text-[10px] tracking-widest text-mute">
          {vaultName ? `${vaultName} · ` : ''}此藏閣上架的劇照
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {listings === null ? (
          <p className="px-1 text-sm text-mute">載入上架中…</p>
        ) : listings.length === 0 ? (
          <p className="px-1 text-xs text-mute">此藏閣目前沒有上架的劇照。</p>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {listings.map((l) => {
              const priceSui = Number(l.priceMist) / 1e9;
              return (
                <li
                  key={l.stillId}
                  className="flex items-center gap-3 rounded-lg border border-hairline bg-canvas/40 p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={l.imageUrl}
                    alt={l.title}
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-md border border-black/20 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-serif text-[13px] text-ink">{l.title}</p>
                    <p className="mt-0.5 text-[10px] tracking-widest text-mute">
                      第 {l.edition} 版 · {priceSui} SUI
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => buy(l)}
                    disabled={buyingId === l.stillId}
                    className="shrink-0 rounded-full border border-cinnabar/50 bg-cinnabar/10 px-3 py-1 text-2xs tracking-widest text-cinnabar transition-colors hover:bg-cinnabar/20 disabled:cursor-wait disabled:opacity-50"
                  >
                    {buyingId === l.stillId ? '購買中…' : '購買'}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {error ? <p className="mt-3 px-1 text-xs tracking-widest text-cinnabar">{error}</p> : null}
        {!account ? (
          <p className="mt-3 px-1 text-[10px] tracking-widest text-mute/60">連結錢包即可用 SUI 購買。</p>
        ) : null}
      </div>
    </aside>
  );
}
