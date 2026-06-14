'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type { BlobRef, Character } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, read, tx as endlessTx } from '@endless-story/sdk';
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
  stillWareFromMoment,
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

  // 收藏到藏閣 (demo-local) — a moment is collected as a 劇照 here, where it
  // lives, instead of being re-listed in 戲坊. Mirrors ShopTab's acquire flow
  // so the 藏閣 inventory dedups by the same ware key.
  const [acquired, setAcquired] = useState<AcquiredMap>({});
  useEffect(() => {
    setAcquired(loadAcquired());
  }, []);
  const collectMoment = useCallback(
    (moment: BlobRef, index: number) => {
      setAcquired(acquireWare(stillWareFromMoment(character, moment, index)));
    },
    [character],
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
              return (
                <li key={key} className={isWideBlob(blob) ? 'col-span-2' : undefined}>
                  <DerivativeCard
                    label={blob.label ?? defaultBlobLabel(blob, i)}
                    blob={blob}
                    character={character}
                    isCover={isCover}
                    isOwner={canSetCover}
                    pending={pendingCoverKey === key}
                    onSetCover={() => setCover(blob)}
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
                const wareKey = stillWareFromMoment(character, blob, i).key;
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
                      onSetCover={() => setCover(blob)}
                      onCollect={() => collectMoment(blob, i)}
                      onOpen={() => openLightbox(blob)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
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
