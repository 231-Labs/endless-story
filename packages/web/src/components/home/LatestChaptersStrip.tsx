import type { Chapter, Character } from '@endless-story/shared';

export function LatestChaptersStrip({
  chapters,
  charactersById,
}: {
  chapters: Chapter[];
  charactersById: Map<string, Character>;
}) {
  return (
    <section className="border-b border-ink/10 px-8 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-serif tracking-widest text-ink">連載 · 近章</h2>
          <span className="text-xs text-ink/50">每章存於 Walrus · 可訂閱角色視角</span>
        </header>
        <ul className="mt-6 divide-y divide-ink/10">
          {chapters.map((chapter) => (
            <li key={chapter.id} className="py-5">
              <ChapterRow chapter={chapter} charactersById={charactersById} />
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
    <article className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-[10px] tracking-widest text-ink/50">
        <span className="text-jade">DAY {chapter.day}</span>
        {pov ? (
          <span className="text-cinnabar">{pov.name} 視角</span>
        ) : (
          <span>第三人稱</span>
        )}
        <span className="ml-auto font-mono text-[9px] text-ink/30">
          walrus · {chapter.walrusBlobId.slice(-12)}
        </span>
      </div>
      <h3 className="text-base font-serif text-ink">{chapter.title}</h3>
      <p className="line-clamp-2 text-sm leading-relaxed text-ink/70">
        {chapter.body}
      </p>
    </article>
  );
}
