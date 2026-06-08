import type { Chapter, Character } from '@endless-story/shared';
import Link from 'next/link';
import { truncateBlobId } from '@/lib/format';
import type { PovChapterEntry } from '@/lib/chain/pov-read';
import { ChainPovSection } from './ChainPovSection';

export function ChaptersTab({
  chapters,
  character,
  chainPovChapters = [],
}: {
  chapters: Chapter[];
  character: Character;
  /**
   * On-chain POV chapters anchored via `commitment.move`. Rendered as
   * the topmost section ("on-chain POV") above the legacy mock sections.
   * When runner R3+ wires the gazette + memory tier, this becomes the
   * primary surface and mock sections get retired.
   */
  chainPovChapters?: PovChapterEntry[];
}) {
  const hasAny = chapters.length > 0 || chainPovChapters.length > 0;
  if (!hasAny) {
    return (
      <div className="py-12 text-center text-mute">
        還沒出場到任何已公開的章回。
      </div>
    );
  }

  const povChapters = chapters.filter((c) => c.povCharacterId === character.id);
  const involvedChapters = chapters.filter((c) => c.povCharacterId !== character.id);

  return (
    <div className="space-y-12">
      {chainPovChapters.length > 0 ? (
        <ChainPovSection chapters={chainPovChapters} character={character} />
      ) : null}
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
      <div className="flex items-center gap-4">
        <div className={`h-px w-8 ${highlight ? 'bg-cinnabar' : 'bg-cinnabar/40'}`} />
        <h2 className={`font-serif text-2xl tracking-wide ${highlight ? 'text-cinnabar' : 'text-ink'}`}>
          {title}
        </h2>
      </div>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:gap-6 pl-0 sm:pl-12">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <Link
              href={`/feed/chapter/${chapter.id}`}
              className="group block rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm transition-all duration-300 hover:bg-surface hover:border-cinnabar/30 hover:shadow-sm"
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
    <article className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs tracking-widest text-mute/80">
        <span className="bg-canvas/50 px-2 py-1 rounded border border-hairline/50">DAY {chapter.day}</span>
        <span className="font-mono text-2xs">walrus · {truncateBlobId(chapter.walrusBlobId)}</span>
      </div>
      <h3 className="mt-2 font-serif text-xl tracking-wide text-ink transition-colors group-hover:text-cinnabar sm:text-2xl">
        {chapter.title}
      </h3>
      <p className="mt-1 line-clamp-3 max-w-prose text-base leading-loose text-ink/70 transition-colors group-hover:text-ink/90">
        {chapter.body}
      </p>
    </article>
  );
}
