'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

/** A flattened gallery entry the lightbox can page through. */
interface LightboxItem {
  blob: BlobRef;
  label: string;
}

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
  onOpen,
}: {
  label: string;
  blob: BlobRef;
  character: Character;
  isCover: boolean;
  isOwner: boolean;
  pending: boolean;
  onSetCover: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <AspectFrame
        character={character}
        blob={blob}
        isCover={isCover}
        label={label}
        onOpen={onOpen}
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
  onOpen,
}: {
  character: Character;
  blob: BlobRef;
  label: string;
  isCover: boolean;
  isOwner: boolean;
  pending: boolean;
  onSetCover: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="flex flex-col gap-3">
      <AspectFrame
        character={character}
        blob={blob}
        isCover={isCover}
        label={label}
        onOpen={onOpen}
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
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={pending}
      className="rounded-full bg-elevated/90 px-2.5 py-1 text-2xs tracking-widest text-ink shadow-sm backdrop-blur transition-colors hover:bg-cinnabar hover:text-canvas disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? '設定中' : '設為封面'}
    </button>
  );
}

/**
 * Every gallery card is a fixed 2/3 vertical skeleton — keeps the carousel and
 * grid tidy regardless of the source image's shape. The source image is drawn
 * `object-contain` (never cropped) over a blurred, scaled `object-cover` copy of
 * itself, so a horizontal art sheet sits centred with a soft matte filling the
 * letterbox bands instead of leaving dead space. The whole frame is clickable to
 * open the full-resolution lightbox.
 */
function AspectFrame({
  character,
  blob,
  isCover,
  label,
  action,
  onOpen,
}: {
  character: Character;
  blob?: BlobRef;
  isCover: boolean;
  label: string;
  action?: ReactNode;
  onOpen?: () => void;
}) {
  const initial = character.name[0];
  const frame = isCover
    ? 'ring-1 ring-inset ring-cinnabar/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-cinnabar/5'
    : 'ring-1 ring-inset ring-hairline/50 shadow-sm';
  const clickable = !!blob?.imageUrl && !!onOpen;

  return (
    <div
      className={`group relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface/80 backdrop-blur-sm transition-all duration-500 hover:shadow-md dark:bg-elevated/45 ${frame} ${clickable ? 'cursor-zoom-in' : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-serif text-6xl text-mute/20">{initial}</span>
      </div>
      {blob?.imageUrl ? (
        <>
          {/* blurred matte — fills the letterbox bands for non-2/3 images */}
          <div
            aria-hidden
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-30 blur-2xl saturate-150"
            style={{ backgroundImage: `url("${blob.imageUrl}")` }}
          />
          <BlobImage
            src={blob.imageUrl}
            alt={`${character.name} ${blob.kind}`}
            className="absolute inset-0 h-full w-full object-contain transition-transform duration-700 group-hover:scale-[1.02]"
          />
        </>
      ) : null}
      {clickable ? (
        <div className="pointer-events-none absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-ink/35 text-canvas opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <ZoomIcon />
        </div>
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

/**
 * Full-resolution overlay. Shows the image at its NATURAL aspect (object-contain,
 * so a 16:9 art sheet fills the width and a 2/3 portrait fills the height), with
 * keyboard nav (← → Esc), backdrop-click to close, and prev/next paging through
 * the whole gallery.
 */
function Lightbox({
  items,
  index,
  characterName,
  onClose,
  onNavigate,
}: {
  items: LightboxItem[];
  index: number;
  characterName: string;
  onClose: () => void;
  onNavigate: (next: number) => void;
}) {
  const count = items.length;
  const current = items[index];

  const go = useCallback(
    (delta: number) => {
      if (count === 0) return;
      onNavigate((index + delta + count) % count);
    },
    [count, index, onNavigate],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  if (!current?.blob.imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-md sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`${characterName} 設定集圖`}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="關閉"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-canvas/10 text-canvas backdrop-blur transition-colors hover:bg-canvas/25 sm:right-6 sm:top-6"
      >
        <CloseIcon />
      </button>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="上一張"
            className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-canvas/10 text-canvas backdrop-blur transition-colors hover:bg-canvas/25 sm:left-6"
          >
            <ChevronIcon dir="left" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="下一張"
            className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-canvas/10 text-canvas backdrop-blur transition-colors hover:bg-canvas/25 sm:right-6"
          >
            <ChevronIcon dir="right" />
          </button>
        </>
      ) : null}

      <figure
        className="flex max-h-full max-w-full flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.blob.imageUrl}
          alt={`${characterName} ${current.label}`}
          className="max-h-[80vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
        />
        <figcaption className="flex flex-col items-center gap-1 text-center">
          <span className="font-serif text-base tracking-wide text-canvas">{current.label}</span>
          <span className="font-mono text-2xs tracking-widest text-canvas/55">
            {current.blob.walrusBlobId
              ? `walrus · ${truncateBlobId(current.blob.walrusBlobId)}`
              : current.blob.mediaIndex != null
                ? `media #${current.blob.mediaIndex}`
                : '設定集'}
            {count > 1 ? `　·　${index + 1} / ${count}` : ''}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}

function ZoomIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
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
