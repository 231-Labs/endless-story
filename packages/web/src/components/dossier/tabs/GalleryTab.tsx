'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type { BlobRef, Character } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, isDeployed, read, tx as endlessTx } from '@endless-story/sdk';
import { txUrl } from '@/lib/explorer';
import { mintStillAction } from '@/lib/actions/mint-still';
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
  // 劇照. When the viewer's wallet is connected and the image has a real Walrus
  // anchor on an on-chain character, this mints a REAL Still NFT to that wallet
  // (admin/StorytellerCap signs server-side, per still.move). Otherwise it falls
  // back to a demo-local acquire so browsing without a wallet still fills the
  // 藏閣. Either way the ware key matches `stillWareFromBlob`, so the 藏閣
  // inventory dedups.
  const [acquired, setAcquired] = useState<AcquiredMap>({});
  const [mintingKey, setMintingKey] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintedTx, setMintedTx] = useState<Record<string, string>>({});
  useEffect(() => {
    setAcquired(loadAcquired());
  }, []);
  const collectImage = useCallback(
    async (blob: BlobRef, index: number) => {
      const ware = stillWareFromBlob(character, blob, index);
      setMintError(null);

      const chainEligible =
        isDeployed() &&
        character.id.startsWith('0x') &&
        !!blob.walrusBlobId &&
        !!blob.imageUrl;

      // no wallet / mock character / no Walrus anchor → demo-local 入藏.
      // (`!account` also narrows the type for the mint call below.)
      if (!chainEligible || !account) {
        setAcquired(acquireWare(ware));
        return;
      }

      setMintingKey(ware.key);
      try {
        const res = await mintStillAction({
          characterId: character.id,
          walrusBlobId: blob.walrusBlobId,
          imageUrl: blob.imageUrl,
          title: ware.title,
          recipient: account.address,
        });
        if (!res.ok) {
          setMintError(res.error ?? '鑄造劇照失敗');
          return;
        }
        // Mirror into the local 藏閣 so it shows instantly (the on-chain read is
        // cached + lags); the vault dedups the mirror vs the real Still by image
        // url, so this never double-counts once the chain read catches up.
        setAcquired(acquireWare(ware));
        if (res.digest) setMintedTx((m) => ({ ...m, [ware.key]: res.digest as string }));
      } catch (err) {
        setMintError(err instanceof Error ? err.message : String(err));
      } finally {
        setMintingKey(null);
      }
    },
    [character, account],
  );

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
