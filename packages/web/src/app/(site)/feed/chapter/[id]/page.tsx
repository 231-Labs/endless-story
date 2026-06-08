import Link from 'next/link';
import { chaptersApi, charactersApi } from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { ChapterToc } from '@/components/feed/ChapterToc';
import { ChapterCast } from '@/components/feed/ChapterCast';
import { LinkifiedProse } from '@/components/common/CharacterLinkifier';
import { formatDate, truncateBlobId } from '@/lib/format';
import { txUrl, objectUrl } from '@/lib/explorer';

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

  // On-stage cast: POV first, then involved (deduped)
  const castIds = Array.from(
    new Set([
      ...(chapter.povCharacterId ? [chapter.povCharacterId] : []),
      ...chapter.involvedCharacterIds,
    ])
  );
  const cast = castIds
    .map((cid) => charactersById.get(cid))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  // Same on-chain event, other characters' angles — the verifiable multi-POV.
  const eventTx = chapter.provenance?.eventTx;
  const siblingPovs = eventTx
    ? sagaChapters.filter((c) => c.id !== chapter.id && c.provenance?.eventTx === eventTx)
    : [];

  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="px-5 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/feed"
            aria-label="回梨園章回"
            className="es-icon-button mb-6 h-8 w-8"
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

            {chapter.provenance?.eventLabel ? (
              <div className="mt-6 rounded-2xl border border-cinnabar/25 bg-cinnabar/[0.04] px-5 py-4">
                <div className="text-2xs uppercase tracking-[0.25em] text-cinnabar/70">
                  鏈上事件 · 已證實發生
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink">
                  本章是
                  {pov ? <span className="text-cinnabar"> {pov.name} </span> : ' 角色 '}
                  對「{chapter.provenance.eventLabel}」的視角
                  {chapter.provenance.sceneName ? ` · ${chapter.provenance.sceneName}` : ''}
                  {chapter.provenance.day ? ` · 第 ${chapter.provenance.day} 日` : ''}。
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-2xs tracking-widest">
                  {chapter.provenance.eventTx ? (
                    <a
                      href={txUrl(chapter.provenance.eventTx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cinnabar hover:underline"
                    >
                      在區塊鏈瀏覽器查驗此事件 ↗
                    </a>
                  ) : null}
                  <a
                    href={objectUrl(chapter.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-mute hover:text-ink hover:underline"
                  >
                    此章上鏈承諾 ↗
                  </a>
                </div>
                {siblingPovs.length > 0 ? (
                  <div className="mt-3 border-t border-hairline/50 pt-3 text-2xs tracking-widest">
                    <span className="text-mute">同一事件的其他視角：</span>
                    {siblingPovs.map((s) => {
                      const sp = s.povCharacterId ? charactersById.get(s.povCharacterId) : undefined;
                      return (
                        <Link
                          key={s.id}
                          href={`/feed/chapter/${s.id}`}
                          className="ml-2 text-cinnabar hover:underline"
                        >
                          {sp?.name ?? '另一視角'}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

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
      </div>
    </main>
  );
}
