import Link from 'next/link';
import { chaptersApi, charactersApi } from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { ChapterToc } from '@/components/feed/ChapterToc';
import { ChapterCast } from '@/components/feed/ChapterCast';
import { LinkifiedProse } from '@/components/common/CharacterLinkifier';
import { formatDate, truncateBlobId } from '@/lib/format';

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const chapter = await chaptersApi.getChapter(id);

  if (!chapter) {
    return (
      <main className="min-h-screen">
        <SiteNav />
        <section className="px-5 py-20 text-center text-mute sm:px-10">
          找不到這個章回。
        </section>
      </main>
    );
  }

  const [pov, sagaChapters, sagaCharacters] = await Promise.all([
    chapter.povCharacterId ? charactersApi.getCharacter(chapter.povCharacterId) : null,
    chaptersApi.listChapters(chapter.sagaId),
    charactersApi.listSagaCharacters(chapter.sagaId),
  ]);
  const charactersById = new Map(sagaCharacters.map((c) => [c.id, c]));
  const tocChapters = sagaChapters
    .filter((c) => c.visibility === 'public_chapter')
    .sort((a, b) => a.day - b.day || a.createdAt.localeCompare(b.createdAt));

  // 出場 cast：POV 優先，後接 involved（去重）
  const castIds = Array.from(
    new Set([
      ...(chapter.povCharacterId ? [chapter.povCharacterId] : []),
      ...chapter.involvedCharacterIds,
    ])
  );
  const cast = castIds
    .map((cid) => charactersById.get(cid))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-10 sm:py-14">
        <Link
          href="/feed"
          aria-label="回連載"
          className="es-icon-button h-8 w-8"
        >
          <span aria-hidden className="text-base">←</span>
        </Link>

        <div className="mt-6 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_minmax(0,36rem)_1fr] lg:gap-0">
          <aside className="hidden lg:block lg:justify-self-end lg:pr-8">
            <div className="sticky top-20 w-40 space-y-10">
              <ChapterToc
                chapters={tocChapters}
                currentId={chapter.id}
                charactersById={charactersById}
              />
              <ChapterCast cast={cast} povId={chapter.povCharacterId} />
            </div>
          </aside>

          <article className="lg:col-start-2">
            <details className="mb-8 rounded-md border border-hairline bg-surface/80 dark:bg-elevated/40 lg:hidden">
              <summary className="cursor-pointer px-4 py-3 text-sm tracking-wide text-ink">
                目錄 · {tocChapters.length} 章 · 出場 {cast.length}
              </summary>
              <div className="space-y-8 border-t border-hairline px-4 py-4">
                <ChapterToc
                  chapters={tocChapters}
                  currentId={chapter.id}
                  charactersById={charactersById}
                />
                <ChapterCast cast={cast} povId={chapter.povCharacterId} />
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest text-mute">
              <span>DAY {chapter.day}</span>
              {pov ? (
                <>
                  <span className="text-hairline">·</span>
                  <Link
                    href={{ pathname: '/dossier', query: { id: pov.id } }}
                    className="text-cinnabar hover:underline"
                  >
                    {pov.name} 視角
                  </Link>
                </>
              ) : null}
              <span className="text-hairline">·</span>
              <span>{formatDate(chapter.createdAt)}</span>
            </div>

            <h1 className="mt-3 font-serif text-3xl leading-snug text-ink sm:text-4xl">
              {chapter.title}
            </h1>

            <LinkifiedProse
              className="chapter-prose mt-8 text-lg leading-loose text-ink/85"
              text={chapter.body}
              characters={sagaCharacters}
              linkifyNames={false}
            />

            <footer className="mt-12 border-t border-hairline pt-6 text-2xs tracking-widest text-mute">
              <p className="font-mono">walrus blob · {truncateBlobId(chapter.walrusBlobId, 24)}</p>
              <p className="mt-1">visibility · {chapter.visibility}</p>
            </footer>
          </article>
        </div>
      </div>
    </main>
  );
}
