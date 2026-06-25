'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type { BlobRef, Character } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, isDeployed, read, tx as endlessTx } from '@endless-story/sdk';
import { txUrl } from '@/lib/explorer';
import {
  appearanceSummary,
  blobKey,
  buildSettingImages,
  defaultBlobLabel,
  isWideBlob,
  type FeaturedKey,
  type LightboxItem,
} from './gallery/helpers';
import { DerivativeCard, EventMomentCard, Lightbox } from './gallery/components';
import {
  acquireWare,
  loadAcquired,
  stillWareFromBlob,
  type AcquiredMap,
} from '@/lib/chamber/shop-catalog';

/** Format ENDLESS base units (currency = 6 decimals) for display, trimming trailing zeros. */
function fmtEndless(base: bigint): string {
  const whole = base / 1_000_000n;
  const frac = base % 1_000_000n;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`;
}

export function GalleryTab({
  character,
  isOwner,
  appearanceDesc = null,
}: {
  character: Character;
  isOwner: boolean;
  /** Distilled 形貌 prose from the content road (generated at mint). When present
   *  it's the rich appearance paragraph; null → fall back to the structured facts
   *  / a mock's hand-written physicalFacts. */
  appearanceDesc?: string | null;
}) {
  const router = useRouter();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [coverUrl, setCoverUrl] = useState(character.gallery.anchor.imageUrl);
  const [pendingCoverKey, setPendingCoverKey] = useState<FeaturedKey | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverDigest, setCoverDigest] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    setCoverUrl(character.gallery.anchor.imageUrl);
    setCoverError(null);
    setCoverDigest(null);
  }, [character.id, character.gallery.anchor.imageUrl]);

  const settingImages = useMemo(
    () => buildSettingImages(character.gallery),
    [character.gallery],
  );
  const eventMoments = character.gallery.eventMoments ?? [];
  const canSetCover = isOwner || account?.address === character.nftOwner;
  const appearance = useMemo(() => appearanceSummary(character), [character]);
  // chain 形貌 (rich, evolves with the portrait) wins; else a mock's hand-written
  // physicalFacts prose; else nothing (just the structured facts line).
  const appearanceProse = appearanceDesc ?? appearance.prose;

  // 收進藏閣 — collect ANY gallery image (event moment OR 設定集 sheet) as a
  // 劇照. When the viewer's wallet is connected, the image has a real Walrus
  // anchor on an on-chain character, AND the saga's self-serve mint config is
  // live, this is a SELF-SERVE paid mint: the viewer's own wallet signs and
  // pays `mintFee` ENDLESS (still::mint_still_paid) into the saga treasury, and
  // the Still lands in their wallet. The free admin path (still::mint_still,
  // StorytellerCap) is reserved for automation / gifting and is not wired here.
  // Without a wallet / config / on-chain anchor it falls back to a demo-local
  // acquire so browsing still fills the 藏閣. The ware key matches
  // `stillWareFromBlob` either way, so the 藏閣 inventory dedups.
  const [acquired, setAcquired] = useState<AcquiredMap>({});
  const [mintingKey, setMintingKey] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintedTx, setMintedTx] = useState<Record<string, string>>({});
  // Self-serve mint fee (ENDLESS base units, 6 decimals) + pause state, read
  // from the on-chain StillMintConfig. null = config not deployed/seeded yet →
  // paid mint unavailable, collect falls back to demo-local.
  const [mintFee, setMintFee] = useState<bigint | null>(null);
  const [mintPaused, setMintPaused] = useState(false);
  useEffect(() => {
    setAcquired(loadAcquired());
  }, []);
  useEffect(() => {
    const id = ENDLESS_STORY_DEPLOYMENT.stillMintConfigId;
    if (!id || !isDeployed()) {
      setMintFee(null);
      return;
    }
    let alive = true;
    read.still
      .getMintConfigRef(suiClient, id)
      .then((cfg) => {
        if (!alive) return;
        if (cfg) {
          setMintFee(cfg.fee);
          setMintPaused(cfg.paused);
        } else {
          setMintFee(null);
        }
      })
      .catch(() => {
        if (alive) setMintFee(null);
      });
    return () => {
      alive = false;
    };
  }, [suiClient]);
  const collectImage = useCallback(
    async (blob: BlobRef, index: number) => {
      const ware = stillWareFromBlob(character, blob, index);
      setMintError(null);

      const d = ENDLESS_STORY_DEPLOYMENT;
      const chainEligible =
        isDeployed() &&
        character.id.startsWith('0x') &&
        !!blob.walrusBlobId &&
        !!blob.imageUrl;
      const paidReady =
        chainEligible &&
        !!account &&
        !!d.stillMintConfigId &&
        !!d.sagaId &&
        !!d.stillRegistryId &&
        mintFee != null &&
        !mintPaused;

      // No wallet / mock character / no live mint config → demo-local 入藏.
      // (`!account` / `mintFee == null` also narrow the types for the paid mint.)
      if (!paidReady || !account || mintFee == null) {
        setAcquired(acquireWare(ware));
        return;
      }

      setMintingKey(ware.key);
      try {
        // Self-serve paid mint — the viewer's own wallet signs and pays the fee.
        const coinType = `${d.packageId}::currency::CURRENCY`;
        const coins = await suiClient.getCoins({ owner: account.address, coinType, limit: 50 });
        const total = (coins.data ?? []).reduce((sum, c) => sum + BigInt(c.balance), 0n);
        if (!coins.data?.length || total < mintFee) {
          setMintError(`鑄造需 ${fmtEndless(mintFee)} ENDLESS,餘額不足。請先用右上「領 ENDLESS」。`);
          return;
        }

        const tx = new Transaction();
        const coinIds = coins.data.map((c) => c.coinObjectId);
        const primary = tx.object(coinIds[0]);
        if (coinIds.length > 1) {
          tx.mergeCoins(primary, coinIds.slice(1).map((id) => tx.object(id)));
        }
        const [payment] = tx.splitCoins(primary, [mintFee]);
        const still = tx.add(
          endlessTx.still.mintStillPaid({
            config: d.stillMintConfigId,
            saga: d.sagaId,
            registry: d.stillRegistryId,
            payment,
            characterId: character.id,
            walrusBlobId: blob.walrusBlobId,
            imageUrl: blob.imageUrl,
            title: ware.title,
          }),
        );
        tx.transferObjects([still], account.address);

        const res = await signAndExecute({ transaction: tx });
        const full = await suiClient.waitForTransaction({
          digest: res.digest,
          options: { showEffects: true },
        });
        if (full.effects?.status?.status !== 'success') {
          throw new Error(full.effects?.status?.error ?? '鑄造劇照失敗');
        }
        // Mirror into the local 藏閣 so it shows instantly (the on-chain read is
        // cached + lags); the vault dedups the mirror vs the real Still by image
        // url, so this never double-counts once the chain read catches up.
        setAcquired(acquireWare(ware));
        setMintedTx((m) => ({ ...m, [ware.key]: res.digest }));
      } catch (err) {
        setMintError(err instanceof Error ? err.message : String(err));
      } finally {
        setMintingKey(null);
      }
    },
    [character, account, suiClient, signAndExecute, mintFee, mintPaused],
  );

  // Show the fee on the collect button only when a real paid mint is actually
  // available for this character (on-chain + config live). Mocks / unconfigured
  // worlds collect demo-local for free, so no price is shown.
  const paidMintLive =
    isDeployed() &&
    character.id.startsWith('0x') &&
    !!ENDLESS_STORY_DEPLOYMENT.stillMintConfigId &&
    mintFee != null &&
    !mintPaused;
  const priceLabel = paidMintLive && mintFee != null ? `${fmtEndless(mintFee)} ENDLESS` : undefined;

  // One flat list spanning both sections — the lightbox pages through all of them.
  const lightboxItems = useMemo<LightboxItem[]>(() => {
    const items: LightboxItem[] = [];
    settingImages.forEach((blob, i) =>
      items.push({ blob, label: blob.label ?? defaultBlobLabel(blob, i) }),
    );
    eventMoments.forEach((blob, i) =>
      items.push({ blob, label: blob.label ?? defaultBlobLabel(blob, i) }),
    );
    return items;
  }, [settingImages, eventMoments]);

  const openLightbox = useCallback((blob: BlobRef) => {
    const key = blobKey(blob);
    setLightboxIndex((_prev) => {
      const idx = lightboxItems.findIndex((it) => blobKey(it.blob) === key);
      return idx >= 0 ? idx : 0;
    });
  }, [lightboxItems]);

  async function setCover(blob: BlobRef) {
    const key = blobKey(blob);
    if (!blob.imageUrl) return;

    if (blob.mediaIndex == null) {
      setCoverUrl(blob.imageUrl);
      setCoverError('這張圖還沒有鏈上設定集 index；目前只在本頁預覽封面。');
      return;
    }

    if (!account) {
      setCoverError('請先連接持有 OwnerCap 的錢包。');
      return;
    }

    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.packageId) {
      setCoverError('合約尚未部署，無法設定鏈上封面。');
      return;
    }

    setPendingCoverKey(key);
    setCoverError(null);
    setCoverDigest(null);
    try {
      const caps = await read.character.listOwnerCapsForAddress(
        suiClient,
        account.address,
        d.packageId,
      );
      const ownerCap = caps.find((c) => c.characterId === character.id);
      if (!ownerCap) {
        throw new Error('找不到對應的 OwnerCap；你是這位角色的 owner 嗎？');
      }

      const txb = new Transaction();
      txb.add(
        endlessTx.character.setCoverFromMedia({
          ownerCap: ownerCap.capId,
          character: character.id,
          index: BigInt(blob.mediaIndex),
        }),
      );
      const res = await signAndExecute({ transaction: txb });
      const full = await suiClient.waitForTransaction({
        digest: res.digest,
        options: { showEffects: true },
      });
      if (full.effects?.status.status !== 'success') {
        throw new Error(full.effects?.status.error ?? '設定封面失敗');
      }
      setCoverUrl(blob.imageUrl);
      setCoverDigest(res.digest);
      router.refresh();
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingCoverKey(null);
    }
  }

  return (
    <div className="space-y-20">
      <section>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-4">
            <div className="h-px w-8 bg-cinnabar/40" />
            <h2 className="whitespace-nowrap font-serif text-2xl tracking-wide text-ink">形貌</h2>
          </div>
          <p className="pl-12 text-xs tracking-widest text-mute/70 sm:pl-0">{appearance.facts}</p>
        </div>
        {appearanceProse ? (
          <p className="mt-6 pl-0 text-base leading-loose text-ink/80 sm:pl-12 sm:text-lg sm:leading-loose">
            {appearanceProse}
          </p>
        ) : null}
        <div className="mt-8 pl-0 sm:pl-12">
          {/* Wrapping grid (not a horizontal carousel) so EVERY setting image is
              visible at once — the old overflow-x scroller hid items 5+ off-screen
              behind a hidden scrollbar, reading as「只有 4 張」. */}
          <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
            {settingImages.map((blob, i) => {
              const key = blobKey(blob);
              const isCover = !!blob.imageUrl && blob.imageUrl === coverUrl;
              const wareKey = stillWareFromBlob(character, blob, i).key;
              return (
                <li key={key} className={isWideBlob(blob) ? 'col-span-2' : undefined}>
                  <DerivativeCard
                    label={blob.label ?? defaultBlobLabel(blob, i)}
                    blob={blob}
                    character={character}
                    isCover={isCover}
                    isOwner={canSetCover}
                    pending={pendingCoverKey === key}
                    canCollect={!!blob.imageUrl}
                    collected={(acquired[wareKey]?.count ?? 0) > 0}
                    minting={mintingKey === wareKey}
                    txDigest={mintedTx[wareKey] ?? null}
                    priceLabel={priceLabel}
                    onSetCover={() => setCover(blob)}
                    onCollect={() => collectImage(blob, i)}
                    onOpen={() => openLightbox(blob)}
                  />
                </li>
              );
            })}
          </ul>
          {coverError ? (
            <p className="mt-2 text-xs tracking-widest text-cinnabar">{coverError}</p>
          ) : coverDigest ? (
            <a
              href={txUrl(coverDigest)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs tracking-widest text-cinnabar hover:underline"
            >
              封面已更新 · tx
            </a>
          ) : null}
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-4">
            <div className="h-px w-8 bg-cinnabar/40" />
            <h2 className="whitespace-nowrap font-serif text-2xl tracking-wide text-ink">事件瞬間</h2>
          </div>
          <p className="pl-12 text-xs tracking-widest text-mute/70 sm:pl-0">
            每齣大戲、每次衝突、每個夜晚的回頭 — 一張圖
          </p>
        </div>
        <div className="mt-8 pl-0 sm:pl-12">
          {eventMoments.length === 0 ? (
            <div className="es-card p-12 text-center">
              <p className="text-sm tracking-wide text-mute">尚無瞬間。下一場戲還沒開鑼。</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {eventMoments.map((blob, i) => {
                const key = blobKey(blob);
                const isCover = !!blob.imageUrl && blob.imageUrl === coverUrl;
                const wareKey = stillWareFromBlob(character, blob, i).key;
                return (
                  <li key={key}>
                    <EventMomentCard
                      character={character}
                      blob={blob}
                      label={blob.label ?? defaultBlobLabel(blob, i)}
                      isCover={isCover}
                      isOwner={canSetCover}
                      pending={pendingCoverKey === key}
                      canCollect={!!blob.imageUrl}
                      collected={(acquired[wareKey]?.count ?? 0) > 0}
                      minting={mintingKey === wareKey}
                      txDigest={mintedTx[wareKey] ?? null}
                      priceLabel={priceLabel}
                      onSetCover={() => setCover(blob)}
                      onCollect={() => collectImage(blob, i)}
                      onOpen={() => openLightbox(blob)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {mintError ? (
            <p className="mt-3 text-xs tracking-widest text-cinnabar">鑄造劇照失敗：{mintError}</p>
          ) : isDeployed() && character.id.startsWith('0x') && !account && eventMoments.length > 0 ? (
            <p className="mt-3 text-2xs tracking-widest text-mute/60">
              連結錢包，即可把劇照鑄成鏈上 NFT 收進藏閣（未連結則僅本地預覽入藏）。
            </p>
          ) : null}
        </div>
      </section>

      {lightboxIndex != null ? (
        <Lightbox
          items={lightboxItems}
          index={lightboxIndex}
          characterName={character.name}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      ) : null}
    </div>
  );
}
