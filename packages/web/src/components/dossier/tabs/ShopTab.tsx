'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type { Character } from '@endless-story/shared';
import { tx as endlessTx } from '@endless-story/sdk';
import { BlobImage } from '@/components/common/BlobImage';
import { KioskPriceTag } from '@/components/dossier/shop/KioskPriceTag';
import {
  getShopChainStatusAction,
  prepareStillPurchase,
} from '@/lib/actions/shop-kiosk';
import type { ShopChainStatus } from '@/lib/chamber/shop-kiosk-config';
import {
  acquireWare,
  loadAcquired,
  shopWaresFor,
  type AcquiredMap,
  type ShopWare,
} from '@/lib/chamber/shop-catalog';

const CurioPreview = dynamic(
  () => import('@endless-story/chamber-3d').then((m) => m.CurioPreview),
  { ssr: false, loading: () => <div className="absolute inset-0 animate-pulse bg-stone-900/80" /> },
);

/**
 * 戲坊 — character IP merch stall. 劇照 uses Kiosk when chain-ready;
 * 珍玩 stays demo-local until curio NFT lands.
 */

export function ShopTab({ character }: { character: Character }) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const chamberHref = account ? `/chamber?id=${account.address}` : null;
  const wares = useMemo(() => shopWaresFor(character), [character]);
  const [acquired, setAcquired] = useState<AcquiredMap>({});
  const [justBought, setJustBought] = useState<string | null>(null);
  const [chainStatus, setChainStatus] = useState<ShopChainStatus | null>(null);
  const [buyingKey, setBuyingKey] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  useEffect(() => {
    setAcquired(loadAcquired());
    getShopChainStatusAction().then(setChainStatus).catch(() => setChainStatus(null));
  }, []);

  const buyLocal = useCallback((ware: ShopWare) => {
    setAcquired(acquireWare(ware));
    setJustBought(ware.key);
  }, []);

  const buy = useCallback(
    async (ware: ShopWare) => {
      setBuyError(null);
      setBuyingKey(ware.key);

      // 珍玩 — demo-local until curio.move
      if (ware.kind === 'curio') {
        buyLocal(ware);
        setBuyingKey(null);
        return;
      }

      try {
        const plan = await prepareStillPurchase({ ware, characterId: character.id });

        if (!plan.ok) {
          setBuyError(plan.error);
          setBuyingKey(null);
          return;
        }

        if (plan.mode === 'demo') {
          buyLocal(ware);
          setBuyingKey(null);
          return;
        }

        if (!account) {
          setBuyError('Kiosk 購買需連結錢包');
          setBuyingKey(null);
          return;
        }

        const { listing } = plan;
        const priceMist = BigInt(listing.priceMist);

        const tx = new Transaction();
        const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(priceMist)]);
        const still = endlessTx.still.purchase(tx, {
          kiosk: listing.kioskId,
          stillId: listing.stillId,
          payment,
          transferPolicy: listing.transferPolicyId,
        });
        tx.transferObjects([still], account.address);

        const res = await signAndExecute({ transaction: tx });
        const full = await suiClient.waitForTransaction({
          digest: res.digest,
          options: { showEffects: true },
        });
        if (full.effects?.status?.status !== 'success') {
          throw new Error(full.effects?.status?.error ?? 'Kiosk 購買失敗');
        }

        // Mirror into local vault inventory for immediate 藏閣 display.
        buyLocal(ware);
      } catch (err) {
        setBuyError(err instanceof Error ? err.message : String(err));
      } finally {
        setBuyingKey(null);
      }
    },
    [account, character.id, buyLocal, signAndExecute, suiClient],
  );

  const curios = wares.filter((w) => w.kind === 'curio');
  const stillChainReady = chainStatus?.chainReady ?? false;

  return (
    <div className="space-y-16">
      {buyError ? (
        <p className="rounded-lg border border-cinnabar/30 bg-cinnabar/5 px-4 py-2 text-xs text-cinnabar">
          {buyError}
        </p>
      ) : null}

      <section>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-4">
            <div className="h-px w-8 bg-cinnabar/40" />
            <h2 className="whitespace-nowrap font-serif text-2xl tracking-wide text-ink">戲坊 · 紀念珍玩</h2>
          </div>
          <p className="pl-12 text-xs tracking-widest text-mute/70 sm:pl-0">
            {character.name}的隨身之物 — 首演原件僅此一件，量產版人人可藏
          </p>
        </div>
        <ul className="mt-8 grid grid-cols-1 gap-6 pl-0 sm:grid-cols-2 sm:pl-12">
          {curios.map((w) => (
            <WareCard
              key={w.key}
              ware={w}
              owned={acquired[w.key]?.count ?? 0}
              justBought={justBought === w.key}
              chamberHref={chamberHref}
              buying={buyingKey === w.key}
              chainListing={false}
              onBuy={() => buy(w)}
            />
          ))}
        </ul>
      </section>

      <p className="pl-0 text-2xs leading-relaxed tracking-widest text-mute/60 sm:pl-12">
        劇照不在此重列 — 每一瞬都在「設定集 · 事件瞬間」就地收進藏閣。
        {stillChainReady ? (
          <> 上架後即走 Kiosk 鏈上交易（SUI 結帳）。{!account ? ' 購買請先連結錢包。' : null}</>
        ) : (
          <>
            {' '}劇照版次帳本已接好 — redeploy 並設定 SHOP_KIOSK_ID / SHOP_KIOSK_CAP_ID 後改走 Kiosk。
            {chainStatus?.blockers.length ? (
              <span className="mt-1 block text-mute/50">待辦：{chainStatus.blockers.join(' · ')}</span>
            ) : null}
          </>
        )}
      </p>
    </div>
  );
}

function WareCard({
  ware,
  owned,
  justBought,
  chamberHref,
  buying,
  chainListing,
  onBuy,
}: {
  ware: ShopWare;
  owned: number;
  justBought: boolean;
  chamberHref: string | null;
  buying: boolean;
  chainListing: boolean;
  onBuy: () => void;
}) {
  const soldOut = ware.limit != null && owned >= ware.limit;
  return (
    <li className="es-card relative flex flex-col overflow-hidden">
      <KioskPriceTag priceSui={ware.priceSui} chain={chainListing && ware.kind === 'still'} />

      {ware.kind === 'still' && ware.url ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-900">
          <BlobImage
            src={ware.url}
            alt={ware.title}
            sizes="(max-width: 640px) 100vw, 33vw"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#0c0b10]">
          <CurioPreview
            assetUrl={ware.assetUrl}
            tag={ware.tag}
            fitHeight={ware.fitHeight}
            className="absolute inset-0"
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-2xs tracking-widest text-white/40">
            拖曳旋轉預覽 · 入藏後可佈置
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 truncate font-serif text-base text-ink">{ware.title}</h3>
          <span
            className={[
              'shrink-0 rounded-full border px-2 py-0.5 text-2xs tracking-widest',
              ware.limit != null
                ? 'border-cinnabar/40 text-cinnabar'
                : 'border-hairline text-mute',
            ].join(' ')}
          >
            {ware.subtitle}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-mute">{ware.blurb}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-sm text-ink/80">
            {owned > 0 ? (
              <span className="text-2xs tracking-widest text-cinnabar">已入藏 ×{owned}</span>
            ) : (
              <span className="text-2xs tracking-widest text-mute">
                {chainListing && ware.kind === 'still' ? 'Kiosk 標價' : '示意價'}
              </span>
            )}
          </span>
          {soldOut ? (
            <span className="rounded-full bg-surface px-4 py-1.5 text-xs tracking-widest text-mute">
              已售出
            </span>
          ) : (
            <button
              type="button"
              onClick={onBuy}
              disabled={buying}
              className="rounded-full border border-cinnabar/50 bg-cinnabar/10 px-4 py-1.5 text-xs tracking-widest text-cinnabar transition-colors hover:bg-cinnabar/20 disabled:opacity-50"
            >
              {buying ? '結帳中…' : chainListing && ware.kind === 'still' ? 'Kiosk 購入' : '購入'}
            </button>
          )}
        </div>
        {justBought && chamberHref ? (
          <Link
            href={chamberHref}
            className="text-2xs tracking-widest text-cinnabar hover:underline"
          >
            已入藏 → 去藏閣佈置
          </Link>
        ) : null}
      </div>
    </li>
  );
}
