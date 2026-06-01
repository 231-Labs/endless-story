'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type { BlobRef, Character } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, read, tx as endlessTx } from '@endless-story/sdk';
import { BlobImage } from '@/components/common/BlobImage';
import { truncateBlobId } from '@/lib/format';
import { txUrl } from '@/lib/explorer';

type FeaturedKey = string;

export function GalleryTab({
  character,
  isOwner,
}: {
  character: Character;
  isOwner: boolean;
}) {
  const router = useRouter();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [coverUrl, setCoverUrl] = useState(character.gallery.anchor.imageUrl);
  const [pendingCoverKey, setPendingCoverKey] = useState<FeaturedKey | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverDigest, setCoverDigest] = useState<string | null>(null);

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
        <div className="flex items-center gap-4">
          <div className="h-px w-8 bg-cinnabar/40" />
          <h2 className="font-serif text-2xl tracking-wide text-ink">角色設定集</h2>
        </div>
        <div className="mt-8 pl-0 sm:pl-12">
          <ul className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 py-2 pb-8 scroll-px-5 sm:mx-[-2px] sm:px-0.5 sm:scroll-px-0.5">
            {settingImages.map((blob, i) => {
              const key = blobKey(blob);
              const isCover = !!blob.imageUrl && blob.imageUrl === coverUrl;
              return (
                <li
                  key={key}
                  className="w-[72vw] max-w-[320px] shrink-0 snap-start sm:w-auto sm:basis-[calc((100%_-_3rem)/3)] sm:max-w-none lg:basis-[calc((100%_-_4.5rem)/4)]"
                >
                  <DerivativeCard
                    label={blob.label ?? defaultBlobLabel(blob, i)}
                    blob={blob}
                    character={character}
                    isCover={isCover}
                    isOwner={canSetCover}
                    pending={pendingCoverKey === key}
                    onSetCover={() => setCover(blob)}
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
            <div className="rounded-3xl border border-hairline/50 bg-surface/40 p-12 text-center backdrop-blur-sm">
              <p className="text-sm tracking-wide text-mute">尚無瞬間。下一場戲還沒開鑼。</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {eventMoments.map((blob, i) => {
                const key = blobKey(blob);
                const isCover = !!blob.imageUrl && blob.imageUrl === coverUrl;
                return (
                  <li key={key}>
                    <EventMomentCard
                      character={character}
                      blob={blob}
                      label={blob.label ?? defaultBlobLabel(blob, i)}
                      isCover={isCover}
                      isOwner={canSetCover}
                      pending={pendingCoverKey === key}
                      onSetCover={() => setCover(blob)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function buildSettingImages(gallery: Character['gallery']): BlobRef[] {
  const variants = gallery.variants ?? [];
  const fallback = [gallery.anchor, gallery.costume, gallery.makeup].filter(
    (blob): blob is BlobRef => !!blob?.imageUrl,
  );
  const base = variants.length > 0 ? variants : fallback;
  const out = [...base];
  if (
    gallery.anchor.imageUrl &&
    !out.some((blob) => blob.imageUrl === gallery.anchor.imageUrl)
  ) {
    out.unshift(gallery.anchor);
  }
  const seen = new Set<string>();
  return out
    .filter((blob) => blob.kind !== 'event_moment' && blob.kind !== 'scene_clip')
    .filter((blob) => {
      const key = blobKey(blob);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function DerivativeCard({
  label,
  blob,
  character,
  isCover,
  isOwner,
  pending,
  onSetCover,
}: {
  label: string;
  blob: BlobRef;
  character: Character;
  isCover: boolean;
  isOwner: boolean;
  pending: boolean;
  onSetCover: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <AspectFrame
        aspect="2/3"
        character={character}
        blob={blob}
        isCover={isCover}
        label={label}
        action={
          isOwner && !isCover ? (
            <CoverButton pending={pending} onClick={onSetCover} />
          ) : null
        }
      />
    </div>
  );
}

function EventMomentCard({
  character,
  blob,
  label,
  isCover,
  isOwner,
  pending,
  onSetCover,
}: {
  character: Character;
  blob: BlobRef;
  label: string;
  isCover: boolean;
  isOwner: boolean;
  pending: boolean;
  onSetCover: () => void;
}) {
  return (
    <article className="flex flex-col gap-3">
      <AspectFrame
        aspect="2/3"
        character={character}
        blob={blob}
        isCover={isCover}
        label={label}
        action={
          isOwner && !isCover ? (
            <CoverButton pending={pending} onClick={onSetCover} />
          ) : null
        }
      />
      <div className="flex items-center justify-between gap-3">
        {blob.sourceChapterId ? (
          <a
            href={`/feed/chapter/${blob.sourceChapterId}`}
            className="text-sm text-cinnabar hover:underline"
          >
            讀對應章回 →
          </a>
        ) : (
          <span />
        )}
      </div>
    </article>
  );
}

function CoverButton({
  pending,
  onClick,
}: {
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-full bg-elevated/90 px-2.5 py-1 text-2xs tracking-widest text-ink shadow-sm backdrop-blur transition-colors hover:bg-cinnabar hover:text-canvas disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? '設定中' : '設為封面'}
    </button>
  );
}

function AspectFrame({
  aspect,
  character,
  blob,
  isCover,
  label,
  action,
}: {
  aspect: '2/3' | '4/3' | '16/9' | '1/1';
  character: Character;
  blob?: BlobRef;
  isCover: boolean;
  label: string;
  action?: ReactNode;
}) {
  const aspectClass =
    aspect === '2/3' ? 'aspect-[2/3]' :
    aspect === '4/3' ? 'aspect-[4/3]' :
    aspect === '1/1' ? 'aspect-square' : 'aspect-video';
  const initial = character.name[0];
  const frame = isCover
    ? 'ring-1 ring-inset ring-cinnabar/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-cinnabar/5'
    : 'ring-1 ring-inset ring-hairline/50 shadow-sm';

  return (
    <div className={`group relative overflow-hidden rounded-2xl bg-surface/80 backdrop-blur-sm transition-all duration-500 hover:shadow-md dark:bg-elevated/45 ${frame} ${aspectClass}`}>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-serif text-6xl text-mute/20">{initial}</span>
      </div>
      {blob ? (
        <BlobImage
          src={blob.imageUrl}
          alt={`${character.name} ${blob.kind}`}
          className="absolute inset-0 h-full w-full object-contain transition-transform duration-700 group-hover:scale-[1.02]"
        />
      ) : null}
      {isCover ? (
        <div className="absolute right-3 top-3 rounded-full bg-cinnabar/90 px-3 py-1 text-[10px] tracking-widest text-canvas shadow-sm backdrop-blur-md">
          ✦ 封面
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-canvas/95 via-canvas/80 to-transparent p-4 pt-16 opacity-100 transition-all duration-500 sm:translate-y-4 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:group-focus-within:translate-y-0 sm:group-focus-within:opacity-100">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <p className="truncate text-sm font-medium tracking-wide text-ink">{label}</p>
            </div>
            {blob ? (
              <p className="mt-1.5 truncate font-mono text-2xs tracking-widest text-mute/70">
                {blob.walrusBlobId
                  ? `walrus · ${truncateBlobId(blob.walrusBlobId)}`
                  : blob.mediaIndex != null
                    ? `media #${blob.mediaIndex}`
                    : '設定集'}
              </p>
            ) : (
              <p className="mt-1.5 text-2xs tracking-widest text-mute/70">未生成</p>
            )}
          </div>
          {action ? <div className="pointer-events-auto shrink-0">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

function blobKey(blob: BlobRef): FeaturedKey {
  if (blob.mediaIndex != null) return `media-${blob.mediaIndex}`;
  if (blob.walrusBlobId) return blob.walrusBlobId;
  return blob.imageUrl;
}

function defaultBlobLabel(blob: BlobRef, index: number): string {
  if (blob.label) return blob.label;
  if (blob.kind === 'anchor') return index === 0 ? '初始形象' : '封面';
  if (blob.kind === 'setting_sheet') return '設定形象';
  if (blob.kind === 'costume') return '服裝設定';
  if (blob.kind === 'makeup') return '戲妝設定';
  if (blob.kind === 'event_moment') return '事件瞬間';
  return `圖像 ${String(index + 1).padStart(2, '0')}`;
}
