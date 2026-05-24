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
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-10 sm:py-14">
        <Link
          href="/feed"
          aria-label="回連載"
          className="es-icon-button h-8 w-8 mb-6"
        >
          <span aria-hidden className="text-base">←</span>
        </Link>

        <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px] lg:gap-20">
          <article className="min-w-0">
            <details className="mb-8 rounded-3xl border border-hairline/50 bg-surface/40 backdrop-blur-sm lg:hidden">
              <summary className="cursor-pointer px-6 py-4 text-sm tracking-wide text-ink">
                目錄 · {tocChapters.length} 章 · 出場 {cast.length}
              </summary>
              <div className="space-y-8 border-t border-hairline/50 px-6 py-6">
                <ChapterToc
                  chapters={tocChapters}
                  currentId={chapter.id}
                  charactersById={charactersById}
                />
                <ChapterCast cast={cast} povId={chapter.povCharacterId} />
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-3 text-xs tracking-widest text-mute/80">
              <span className="bg-canvas/50 px-2.5 py-1 rounded border border-hairline/50">DAY {chapter.day}</span>
              {pov ? (
                <>
                  <span className="text-hairline">·</span>
                  <Link
                    href={{ pathname: '/dossier', query: { id: pov.id } }}
                    className="text-cinnabar font-medium hover:underline"
                  >
                    {pov.name} 視角
                  </Link>
                </>
              ) : null}
              <span className="text-hairline">·</span>
              <span>{formatDate(chapter.createdAt)}</span>
            </div>

            <h1 className="mt-5 font-serif text-4xl leading-snug tracking-wide text-ink sm:text-5xl">
              {chapter.title}
            </h1>

            {chapter.mediaType === 'video' && chapter.videoUrl ? (
              <div className="mt-10 overflow-hidden rounded-3xl border border-hairline/50 bg-surface/40 shadow-sm backdrop-blur-sm">
                <video
                  src={chapter.videoUrl}
                  controls
                  className="w-full aspect-video bg-black"
                  preload="metadata"
                />
              </div>
            ) : chapter.mediaType === 'gallery' && chapter.coverUrl ? (
              <div className="mt-10 overflow-hidden rounded-3xl border border-hairline/50 bg-surface/40 shadow-sm backdrop-blur-sm">
                <img
                  src={chapter.coverUrl}
                  alt={chapter.title}
                  className="w-full object-cover"
                />
              </div>
            ) : null}

            <div className="mt-10">
              <LinkifiedProse
                className="chapter-prose text-lg leading-loose text-ink/85 sm:text-xl sm:leading-[2.2]"
                text={chapter.body}
                characters={sagaCharacters}
                linkifyNames={false}
              />
            </div>

            <footer className="mt-16 rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs tracking-widest text-mute/70 backdrop-blur-sm">
              <p className="font-mono">walrus blob · {truncateBlobId(chapter.walrusBlobId, 24)}</p>
              <p>visibility · {chapter.visibility}</p>
            </footer>
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-8">
              <div className="rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm">
                <ChapterToc
                  chapters={tocChapters}
                  currentId={chapter.id}
                  charactersById={charactersById}
                />
              </div>
              <div className="rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm">
                <ChapterCast cast={cast} povId={chapter.povCharacterId} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
