'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCurrentAccount } from '@mysten/dapp-kit';
import type { Character } from '@endless-story/shared';
import { BlobImage } from '@/components/common/BlobImage';
import {
  acquireWare,
  loadAcquired,
  shopWaresFor,
  type AcquiredMap,
  type ShopWare,
} from '@/lib/chamber/shop-catalog';

/**
 * 戲坊 — the character IP's merch stall: stage stills + 3D mementos of their
 * craft. Editions mirror the still.move ledger (首演原件 = edition limit 1,
 * 量產版 = open mint); purchase is demo-local until redeploy, and acquired
 * wares surface immediately in the collector's 藏閣.
 */

const GLYPH: Record<string, string> = { fan: '扇', huqin: '琴', vase: '盞' };

export function ShopTab({ character }: { character: Character }) {
  const account = useCurrentAccount();
  const chamberHref = account ? `/chamber?id=${account.address}` : null;
  const wares = useMemo(() => shopWaresFor(character), [character]);
  const [acquired, setAcquired] = useState<AcquiredMap>({});
  const [justBought, setJustBought] = useState<string | null>(null);

  useEffect(() => {
    setAcquired(loadAcquired());
  }, []);

  const buy = (ware: ShopWare) => {
    setAcquired(acquireWare(ware));
    setJustBought(ware.key);
  };

  const curios = wares.filter((w) => w.kind === 'curio');
  const stills = wares.filter((w) => w.kind === 'still');

  return (
    <div className="space-y-16">
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
              characterId={character.id}
              owned={acquired[w.key]?.count ?? 0}
              justBought={justBought === w.key}
              onBuy={() => buy(w)}
            />
          ))}
        </ul>
      </section>

      {stills.length > 0 ? (
        <section>
          <div className="flex items-center gap-4">
            <div className="h-px w-8 bg-cinnabar/40" />
            <h2 className="font-serif text-2xl tracking-wide text-ink">戲坊 · 劇照</h2>
          </div>
          <ul className="mt-8 grid grid-cols-1 gap-6 pl-0 sm:grid-cols-2 sm:pl-12 lg:grid-cols-3">
            {stills.map((w) => (
              <WareCard
                key={w.key}
                ware={w}
                characterId={character.id}
                owned={acquired[w.key]?.count ?? 0}
                justBought={justBought === w.key}
                onBuy={() => buy(w)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="pl-0 text-2xs tracking-widest text-mute/60 sm:pl-12">
        示意販售 — 鏈上鑄造接 still.move 版次帳本（首演原件＝版次上限 1，量產版＝開放鑄造），待重新部署後上線。
      </p>
    </div>
  );
}

function WareCard({
  ware,
  characterId,
  owned,
  justBought,
  onBuy,
}: {
  ware: ShopWare;
  characterId: string;
  owned: number;
  justBought: boolean;
  onBuy: () => void;
}) {
  const soldOut = ware.limit != null && owned >= ware.limit;
  return (
    <li className="es-card flex flex-col overflow-hidden">
      {/* preview */}
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
        <div className="relative grid aspect-[4/3] w-full place-items-center bg-gradient-to-b from-[#17151a] to-[#0c0b10]">
          <span className="font-serif text-6xl text-[#caa64a]/90 drop-shadow-[0_2px_14px_rgba(202,166,74,0.35)]">
            {GLYPH[ware.tag ?? ''] ?? '珍'}
          </span>
          <span className="absolute bottom-2 right-3 text-2xs tracking-widest text-white/35">
            入藏後於藏閣中以 3D 呈現
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
            {ware.priceSui} SUI
            {owned > 0 ? (
              <span className="ml-2 text-2xs tracking-widest text-cinnabar">已入藏 ×{owned}</span>
            ) : null}
          </span>
          {soldOut ? (
            <span className="rounded-full bg-surface px-4 py-1.5 text-xs tracking-widest text-mute">
              已售出
            </span>
          ) : (
            <button
              type="button"
              onClick={onBuy}
              className="rounded-full border border-cinnabar/50 bg-cinnabar/10 px-4 py-1.5 text-xs tracking-widest text-cinnabar transition-colors hover:bg-cinnabar/20"
            >
              購入
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
