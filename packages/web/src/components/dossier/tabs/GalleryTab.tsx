'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { BlobRef, Character } from '@endless-story/shared';
import { BlobImage } from '@/components/common/BlobImage';
import { truncateBlobId } from '@/lib/format';

type FeaturedKey = string; // 'anchor' | 'costume' | 'makeup' | event blob id

export function GalleryTab({
  character,
  isOwner,
}: {
  character: Character;
  isOwner: boolean;
}) {
  const { anchor, costume, makeup, eventMoments } = character.gallery;
  const [featured, setFeatured] = useState<FeaturedKey>('anchor');

  const portraitSlots: { key: FeaturedKey; label: string; blob?: BlobRef }[] = [
    { key: 'anchor', label: '圖像 01', blob: anchor },
    { key: 'costume', label: '圖像 02', blob: costume },
    { key: 'makeup', label: '圖像 03', blob: makeup },
  ];

  return (
    <div className="space-y-20">
      <section>
        <div className="flex items-center gap-4">
          <div className="h-px w-8 bg-cinnabar/40" />
          <h2 className="font-serif text-2xl tracking-wide text-ink">角色圖集</h2>
        </div>
        <div className="mt-8 pl-0 sm:pl-12">
          <ul className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 py-2 pb-8 scroll-px-5 sm:mx-[-2px] sm:px-0.5 sm:scroll-px-0.5">
            {portraitSlots.map((slot) => (
              <li
                key={slot.key}
                className="w-[78vw] max-w-[360px] shrink-0 snap-start sm:w-auto sm:basis-[calc((100%_-_3rem)/3)] sm:max-w-none"
              >
                <DerivativeSlot
                  slotKey={slot.key}
                  label={slot.label}
                  blob={slot.blob}
                  character={character}
                  isFeatured={featured === slot.key}
                  isOwner={isOwner}
                  onSetFeatured={setFeatured}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-4">
            <div className="h-px w-8 bg-cinnabar/40" />
            <h2 className="font-serif text-2xl tracking-wide text-ink whitespace-nowrap">事件瞬間</h2>
          </div>
          <p className="text-xs tracking-widest text-mute/70 pl-12 sm:pl-0">
            每齣大戲、每次衝突、每個夜晚的回頭 — 一張圖
          </p>
        </div>
        <div className="mt-8 pl-0 sm:pl-12">
          {eventMoments.length === 0 ? (
            <div className="rounded-3xl bg-surface/40 border border-hairline/50 p-12 text-center backdrop-blur-sm">
              <p className="text-sm text-mute tracking-wide">尚無瞬間。下一場戲還沒開鑼。</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2">
              {eventMoments.map((blob) => (
                <li key={blob.walrusBlobId}>
                  <EventMomentCard
                    character={character}
                    blob={blob}
                    isFeatured={featured === blob.walrusBlobId}
                    isOwner={isOwner}
                    onSetFeatured={setFeatured}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function DerivativeSlot({
  slotKey,
  label,
  blob,
  character,
  isFeatured,
  isOwner,
  onSetFeatured,
}: {
  slotKey: FeaturedKey;
  label: string;
  blob?: BlobRef;
  character: Character;
  isFeatured: boolean;
  isOwner: boolean;
  onSetFeatured: (key: FeaturedKey) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <AspectFrame
        aspect="3/4"
        character={character}
        blob={blob}
        isFeatured={isFeatured}
        label={label}
        action={
          isOwner && blob && !isFeatured ? (
            <button
              type="button"
              onClick={() => onSetFeatured(slotKey)}
              className="rounded-full bg-elevated/90 px-2.5 py-1 text-2xs tracking-widest text-ink shadow-sm backdrop-blur transition-colors hover:bg-cinnabar hover:text-canvas"
            >
              設為封面
            </button>
          ) : null
        }
      />
    </div>
  );
}

function EventMomentCard({
  character,
  blob,
  isFeatured,
  isOwner,
  onSetFeatured,
}: {
  character: Character;
  blob: BlobRef;
  isFeatured: boolean;
  isOwner: boolean;
  onSetFeatured: (key: FeaturedKey) => void;
}) {
  return (
    <article className="flex flex-col gap-3">
      <AspectFrame
        aspect="4/3"
        character={character}
        blob={blob}
        isFeatured={isFeatured}
        label={blob.sourceEventId ? `event · ${blob.sourceEventId.slice(-12)}` : '事件瞬間'}
        action={
          isOwner && !isFeatured ? (
            <button
              type="button"
              onClick={() => onSetFeatured(blob.walrusBlobId)}
              className="rounded-full bg-elevated/90 px-2.5 py-1 text-2xs tracking-widest text-ink shadow-sm backdrop-blur transition-colors hover:bg-cinnabar hover:text-canvas"
            >
              設為封面
            </button>
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

function AspectFrame({
  aspect,
  character,
  blob,
  isFeatured,
  label,
  action,
}: {
  aspect: '3/4' | '4/3' | '16/9' | '1/1';
  character: Character;
  blob?: BlobRef;
  isFeatured: boolean;
  label: string;
  action?: ReactNode;
}) {
  const aspectClass =
    aspect === '3/4' ? 'aspect-[3/4]' :
    aspect === '4/3' ? 'aspect-[4/3]' :
    aspect === '1/1' ? 'aspect-square' : 'aspect-video';
  const initial = character.name[0];
  const frame = isFeatured
    ? 'ring-1 ring-inset ring-cinnabar/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-cinnabar/5'
    : 'ring-1 ring-inset ring-hairline/50 shadow-sm';

  return (
    <div className={`group relative overflow-hidden rounded-2xl bg-surface/80 dark:bg-elevated/45 backdrop-blur-sm transition-all duration-500 hover:shadow-md ${frame} ${aspectClass}`}>
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
      {isFeatured ? (
        <div className="absolute right-3 top-3 rounded-full bg-cinnabar/90 backdrop-blur-md px-3 py-1 text-[10px] tracking-widest text-canvas shadow-sm">
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
                walrus · {truncateBlobId(blob.walrusBlobId)}
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
