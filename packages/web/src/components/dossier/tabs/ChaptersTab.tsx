import type { Chapter, Character } from '@endless-story/shared';
import Link from 'next/link';
import { truncateBlobId } from '@/lib/format';

export function ChaptersTab({
  chapters,
  character,
}: {
  chapters: Chapter[];
  character: Character;
}) {
  if (chapters.length === 0) {
    return (
      <div className="py-12 text-center text-mute">
        她還沒出場到任何已公開的章回。
      </div>
    );
  }

  const povChapters = chapters.filter((c) => c.povCharacterId === character.id);
  const involvedChapters = chapters.filter((c) => c.povCharacterId !== character.id);

  return (
    <div className="space-y-12">
      {povChapters.length > 0 ? (
        <Section title={`${character.name} 視角`} chapters={povChapters} highlight />
      ) : null}
      {involvedChapters.length > 0 ? (
        <Section title="同場群像" chapters={involvedChapters} />
      ) : null}
    </div>
  );
}

function Section({
  title,
  chapters,
  highlight,
}: {
  title: string;
  chapters: Chapter[];
  highlight?: boolean;
}) {
  return (
    <section>
      <h2 className={`font-serif text-xl ${highlight ? 'text-cinnabar' : 'text-ink'}`}>
        {title}
      </h2>
      <ul className="mt-6 divide-y divide-hairline">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <Link
              href={`/feed/chapter/${chapter.id}`}
              className="group block py-6 transition-colors"
            >
              <ChapterRow chapter={chapter} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChapterRow({ chapter }: { chapter: Chapter }) {
  return (
    <article className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest text-mute">
        <span>DAY {chapter.day}</span>
        <span className="font-mono">walrus · {truncateBlobId(chapter.walrusBlobId)}</span>
      </div>
      <h3 className="font-serif text-lg text-ink transition-colors group-hover:text-cinnabar sm:text-xl">
        {chapter.title}
      </h3>
      <p className="line-clamp-3 max-w-prose text-[15px] leading-loose text-ink/75 transition-colors group-hover:text-ink sm:text-base">
        {chapter.body}
      </p>
    </article>
  );
}
