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
    <div className="space-y-12">
      <section>
        <h2 className="font-serif text-lg text-ink sm:text-xl">角色圖集</h2>
        <ul className="no-scrollbar -mx-5 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 py-0.5 pb-4 scroll-px-5 sm:mx-[-2px] sm:gap-6 sm:px-0.5 sm:scroll-px-0.5">
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
      </section>

      <section>
        <h2 className="font-serif text-lg text-ink sm:text-xl">事件瞬間</h2>
        <p className="mt-1 text-2xs tracking-widest text-mute">
          每齣大戲、每次衝突、每個夜晚的回頭 — 一張圖
        </p>
        {eventMoments.length === 0 ? (
          <p className="mt-6 text-sm text-mute">尚無瞬間。下一場戲還沒開鑼。</p>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
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
    ? 'ring-1 ring-inset ring-cinnabar/45 shadow-md shadow-cinnabar/15'
    : 'ring-1 ring-inset ring-hairline';

  return (
    <div className={`group relative overflow-hidden rounded-md bg-surface dark:bg-elevated/45 ${frame} ${aspectClass}`}>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-serif text-6xl text-mute/40">{initial}</span>
      </div>
      {blob ? (
        <BlobImage
          src={blob.imageUrl}
          alt={`${character.name} ${blob.kind}`}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}
      {isFeatured ? (
        <div className="absolute right-2 top-2 rounded-full bg-cinnabar px-2 py-0.5 text-2xs tracking-widest text-canvas">
          ✦ 封面
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-canvas via-canvas/85 to-transparent p-3 pt-14 opacity-100 transition-all duration-300 sm:translate-y-3 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:group-focus-within:translate-y-0 sm:group-focus-within:opacity-100">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <p className="truncate text-sm text-ink">{label}</p>
              {isFeatured ? (
                <span className="shrink-0 text-2xs tracking-widest text-cinnabar">✦ 角色封面</span>
              ) : null}
            </div>
            {blob ? (
              <p className="mt-1 truncate font-mono text-2xs tracking-widest text-mute">
                walrus · {truncateBlobId(blob.walrusBlobId)}
              </p>
            ) : (
              <p className="mt-1 text-2xs tracking-widest text-mute">未生成</p>
            )}
          </div>
          {action ? <div className="pointer-events-auto shrink-0">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
