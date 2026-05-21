import Link from 'next/link';
import type { Character } from '@endless-story/shared';
import { characterPortraitTone } from '@/components/common/CharacterPortrait';
import { BlobImage } from '@/components/common/BlobImage';

export function ChapterCast({
  cast,
  povId,
}: {
  cast: Character[];
  povId?: string | null;
}) {
  if (cast.length === 0) return null;

  return (
    <nav aria-label="本章人物">
      <h3 className="text-xs tracking-widest text-ink font-serif text-center mb-6">出場</h3>
      <ul className="space-y-2">
        {cast.map((char) => (
          <li key={char.id}>
            <CastRow char={char} isPov={char.id === povId} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CastRow({ char, isPov }: { char: Character; isPov: boolean }) {
  const tone = characterPortraitTone(char.role);
  const imageUrl = char.gallery?.anchor?.imageUrl;

  return (
    <Link
      href={{ pathname: '/dossier', query: { id: char.id } }}
      prefetch={false}
      className="group flex items-center gap-2.5 rounded px-1.5 py-1.5 transition-colors hover:bg-ink/5 dark:hover:bg-elevated/40"
    >
      <span
        className={`relative h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ${tone.ring} ${tone.bg}`}
      >
        <span
          className={`absolute inset-0 flex items-center justify-center font-serif text-xs ${tone.text}`}
        >
          {char.name[0]}
        </span>
        {imageUrl ? (
          <BlobImage
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-serif text-sm text-ink transition-colors group-hover:text-cinnabar">
            {char.name}
          </span>
          {isPov ? (
            <span
              aria-label="本回視角"
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-cinnabar"
            />
          ) : null}
        </span>
        <span className="mt-0.5 truncate text-2xs tracking-widest text-mute">
          {char.role}
        </span>
      </span>
    </Link>
  );
}
