import type { Chapter, Character } from '@endless-story/shared';
import Link from 'next/link';

export function LatestChaptersStrip({
  chapters,
  charactersById,
}: {
  chapters: Chapter[];
  charactersById: Map<string, Character>;
}) {
  return (
    <section className="border-t border-hairline px-5 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-serif text-xl tracking-wide text-ink sm:text-2xl">連載</h2>
        <ul className="mt-6 divide-y divide-hairline sm:mt-8">
          {chapters.map((chapter) => (
            <li key={chapter.id}>
              <Link
                href={`/feed/chapter/${chapter.id}`}
                className="group block py-6 transition-colors sm:py-7"
              >
                <ChapterRow chapter={chapter} charactersById={charactersById} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ChapterRow({
  chapter,
  charactersById,
}: {
  chapter: Chapter;
  charactersById: Map<string, Character>;
}) {
  const pov = chapter.povCharacterId ? charactersById.get(chapter.povCharacterId) : null;
  return (
    <article className="flex flex-col gap-2.5 sm:gap-3">
      <div className="flex items-center gap-3 text-2xs tracking-widest text-mute">
        <span>DAY {chapter.day}</span>
        {pov ? <span className="text-cinnabar">{pov.name} 視角</span> : null}
      </div>
      <h3 className="font-serif text-lg text-ink transition-colors group-hover:text-cinnabar sm:text-xl">
        {chapter.title}
      </h3>
      <p className="line-clamp-2 max-w-prose text-[15px] leading-loose text-ink/75 transition-colors group-hover:text-ink sm:text-base">
        {chapter.body}
      </p>
    </article>
  );
}
