import type { BlobRef, Character } from '@endless-story/shared';
import { BlobImage } from '@/components/common/BlobImage';
import { truncateBlobId } from '@/lib/format';

export function GalleryTab({ character }: { character: Character }) {
  const { anchor, costume, makeup, eventMoments } = character.gallery;
  const trio: { label: string; blob?: BlobRef }[] = [
    { label: '素顏 anchor', blob: anchor },
    { label: '行當戲服', blob: costume },
    { label: '戲妝定裝', blob: makeup },
  ];

  return (
    <div className="space-y-12">
      <section>
        <h2 className="font-serif text-lg text-ink sm:text-xl">定裝三件</h2>
        <p className="mt-1 text-2xs tracking-widest text-mute">
          每張圖都是一個 Walrus blob — owner 改變、戲妝增加、定裝更新都可追溯
        </p>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {trio.map((slot) => (
            <DerivativeSlot
              key={slot.label}
              label={slot.label}
              blob={slot.blob}
              character={character}
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
                <EventMomentCard character={character} blob={blob} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DerivativeSlot({
  label,
  blob,
  character,
}: {
  label: string;
  blob?: BlobRef;
  character: Character;
}) {
  return (
    <div className="flex flex-col gap-3">
      <AspectFrame aspect="3/4" character={character} blob={blob} />
      <div>
        <p className="text-sm text-ink">{label}</p>
        {blob ? (
          <p className="mt-1 font-mono text-2xs tracking-widest text-mute">
            walrus · {truncateBlobId(blob.walrusBlobId)}
          </p>
        ) : (
          <p className="mt-1 text-2xs tracking-widest text-mute">未生成</p>
        )}
      </div>
    </div>
  );
}

function EventMomentCard({ character, blob }: { character: Character; blob: BlobRef }) {
  return (
    <article className="flex flex-col gap-3">
      <AspectFrame aspect="4/3" character={character} blob={blob} />
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
      {blob.sourceChapterId ? (
        <a
          href={`/feed/chapter/${blob.sourceChapterId}`}
          className="text-sm text-cinnabar hover:underline"
        >
          讀對應章回 →
        </a>
      ) : null}
    </article>
  );
}

function AspectFrame({
  aspect,
  character,
  blob,
}: {
  aspect: '3/4' | '4/3' | '16/9' | '1/1';
  character: Character;
  blob?: BlobRef;
}) {
  const aspectClass =
    aspect === '3/4' ? 'aspect-[3/4]' :
    aspect === '4/3' ? 'aspect-[4/3]' :
    aspect === '1/1' ? 'aspect-square' : 'aspect-video';
  const initial = character.name[0];

  return (
    <div className={`relative overflow-hidden rounded-md bg-stone-50 ring-1 ring-hairline ${aspectClass}`}>
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
    </div>
  );
}
