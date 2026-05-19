import Link from 'next/link';
import type { Chapter, Character } from '@endless-story/shared';
import { shortChapterTitle } from '@/lib/format';

export function ChapterToc({
  chapters,
  currentId,
  charactersById,
}: {
  chapters: Chapter[];
  currentId: string;
  charactersById: Map<string, Character>;
}) {
  return (
    <nav aria-label="章回目錄">
      <h3 className="text-2xs tracking-widest text-mute">目錄</h3>
      <ol className="mt-3 space-y-4 text-sm">
        {chapters.map((chapter) => {
          const isCurrent = chapter.id === currentId;
          const pov = chapter.povCharacterId
            ? charactersById.get(chapter.povCharacterId)
            : null;
          return (
            <li key={chapter.id}>
              <Link
                href={`/feed/chapter/${chapter.id}`}
                aria-current={isCurrent ? 'page' : undefined}
                className={`group block border-l-2 pl-3 transition-colors ${
                  isCurrent
                    ? 'border-cinnabar text-ink'
                    : 'border-transparent text-mute hover:border-hairline hover:text-ink'
                }`}
              >
                <div className="flex items-baseline gap-2 text-2xs tracking-widest">
                  <span>DAY {chapter.day}</span>
                  {pov ? <span className="text-cinnabar">{pov.name}</span> : null}
                </div>
                <div
                  className="mt-0.5 font-serif leading-snug"
                  style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
                >
                  {shortChapterTitle(chapter.title)}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
