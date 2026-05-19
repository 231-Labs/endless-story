'use client';

import { useState } from 'react';
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

  const trio: { key: FeaturedKey; label: string; blob?: BlobRef }[] = [
    { key: 'anchor', label: '素顏 anchor', blob: anchor },
    { key: 'costume', label: '行當戲服', blob: costume },
    { key: 'makeup', label: '戲妝定裝', blob: makeup },
  ];

  return (
    <div className="space-y-12">
      <section>
        <h2 className="font-serif text-lg text-ink sm:text-xl">定裝三件</h2>
        <p className="mt-1 text-2xs tracking-widest text-mute">
          每張圖都是一個 Walrus blob — owner 改變、戲妝增加、定裝更新都可追溯
          {isOwner ? ' · 點「設為封面」決定角色對外展示哪一張' : ''}
        </p>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {trio.map((slot) => (
            <DerivativeSlot
              key={slot.key}
              slotKey={slot.key}
              label={slot.label}
              blob={slot.blob}
              character={character}
              isFeatured={featured === slot.key}
              isOwner={isOwner}
              onSetFeatured={setFeatured}
            />
          ))}
        </div>
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
      />
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-ink">{label}</p>
          {isFeatured ? (
            <span className="text-2xs tracking-widest text-cinnabar">✦ 角色封面</span>
          ) : null}
        </div>
        {blob ? (
          <p className="mt-1 font-mono text-2xs tracking-widest text-mute">
            walrus · {truncateBlobId(blob.walrusBlobId)}
          </p>
        ) : (
          <p className="mt-1 text-2xs tracking-widest text-mute">未生成</p>
        )}
        {isOwner && blob && !isFeatured ? (
          <button
            type="button"
            onClick={() => onSetFeatured(slotKey)}
            className="mt-2 rounded border border-hairline px-2.5 py-1 text-2xs tracking-widest text-mute transition-colors hover:border-cinnabar hover:text-cinnabar"
          >
            設為封面
          </button>
        ) : null}
      </div>
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
      />
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xs tracking-widest text-mute">
          {blob.sourceEventId ? (
            <span className="font-mono">event · {blob.sourceEventId.slice(-12)}</span>
          ) : (
            '事件瞬間'
          )}
        </p>
        <p className="font-mono text-2xs tracking-widest text-mute">
          walrus · {truncateBlobId(blob.walrusBlobId)}
        </p>
      </div>
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
        {isFeatured ? (
          <span className="text-2xs tracking-widest text-cinnabar">✦ 角色封面</span>
        ) : isOwner ? (
          <button
            type="button"
            onClick={() => onSetFeatured(blob.walrusBlobId)}
            className="rounded border border-hairline px-2.5 py-1 text-2xs tracking-widest text-mute transition-colors hover:border-cinnabar hover:text-cinnabar"
          >
            設為封面
          </button>
        ) : null}
      </div>
    </article>
  );
}

function AspectFrame({
  aspect,
  character,
  blob,
  isFeatured,
}: {
  aspect: '3/4' | '4/3' | '16/9' | '1/1';
  character: Character;
  blob?: BlobRef;
  isFeatured: boolean;
}) {
  const aspectClass =
    aspect === '3/4' ? 'aspect-[3/4]' :
    aspect === '4/3' ? 'aspect-[4/3]' :
    aspect === '1/1' ? 'aspect-square' : 'aspect-video';
  const initial = character.name[0];
  const ring = isFeatured ? 'ring-2 ring-cinnabar' : 'ring-1 ring-hairline';

  return (
    <div className={`relative overflow-hidden rounded-md bg-stone-50 dark:bg-stone-900 ${ring} ${aspectClass}`}>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-serif text-6xl text-stone-300">{initial}</span>
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
    </div>
  );
}
