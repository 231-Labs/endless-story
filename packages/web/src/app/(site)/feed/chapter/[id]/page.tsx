import Link from 'next/link';
import { chaptersApi, charactersApi } from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { ChapterToc } from '@/components/feed/ChapterToc';
import { ChapterCast } from '@/components/feed/ChapterCast';
import { LinkifiedProse } from '@/components/common/CharacterLinkifier';
import { formatDate } from '@/lib/format';
import { txUrl, objectUrl } from '@/lib/explorer';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chapter = await chaptersApi.getChapter(id).catch(() => null);
  if (!chapter) return { title: '找不到章回' };
  const description = chapter.body.replace(/\s+/g, ' ').slice(0, 120);
  return {
    title: chapter.title,
    description,
    openGraph: {
      title: chapter.title,
      description,
      ...(chapter.coverUrl ? { images: [{ url: chapter.coverUrl }] } : {}),
    },
  };
}

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
        <section className="flex flex-col items-center px-5 py-24 text-center sm:px-10">
          <p className="font-serif text-xl tracking-[0.2em] text-ink">找不到這個章回</p>
          <p className="mt-3 text-sm text-mute">可能已下檔，或網址抄錯了一個字。</p>
          <Link
            href="/feed"
            className="mt-8 rounded-full border border-hairline bg-surface px-6 py-2.5 text-sm tracking-widest text-mute transition-colors hover:border-cinnabar/50 hover:text-cinnabar"
          >
            回梨園章回
          </Link>
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

  // 連載迴圈：讀完這章接得上下一章。POV-only 章（不在公開目錄）只給返回。
  const tocIdx = tocChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = tocIdx > 0 ? tocChapters[tocIdx - 1] : null;
  const nextChapter =
    tocIdx >= 0 && tocIdx < tocChapters.length - 1 ? tocChapters[tocIdx + 1] : null;

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

            {/* 章末迴圈：追視角 + 上一章 / 下一章。鏈上佐證在上方 provenance 區，不在此重複。 */}
            <footer className="mt-16 space-y-6">
              {pov ? (
                <div className="rounded-3xl border border-hairline/50 bg-surface/40 p-6 text-center backdrop-blur-sm sm:p-8">
                  <p className="text-sm leading-relaxed text-mute">
                    這是 <span className="font-serif text-ink">{pov.name}</span> 眼中的春雪社。
                  </p>
                  <Link
                    href={{ pathname: '/dossier', query: { id: pov.id } }}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-cinnabar/50 px-5 py-2 text-sm tracking-widest text-cinnabar transition-colors hover:bg-cinnabar hover:text-canvas"
                  >
                    追 {pov.name} 的視角 →
                  </Link>
                </div>
              ) : null}

              <nav aria-label="章回導覽" className="grid grid-cols-2 gap-3">
                {prevChapter ? (
                  <Link
                    href={`/feed/chapter/${prevChapter.id}`}
                    className="group rounded-2xl border border-hairline/60 bg-surface/40 p-4 backdrop-blur-sm transition-colors hover:border-cinnabar/40 sm:p-5"
                  >
                    <p className="text-2xs tracking-[0.3em] text-mute">← 上一章</p>
                    <p className="mt-2 truncate font-serif text-sm text-ink transition-colors group-hover:text-cinnabar sm:text-base">
                      {prevChapter.title}
                    </p>
                  </Link>
                ) : (
                  <span aria-hidden />
                )}
                {nextChapter ? (
                  <Link
                    href={`/feed/chapter/${nextChapter.id}`}
                    className="group rounded-2xl border border-hairline/60 bg-surface/40 p-4 text-right backdrop-blur-sm transition-colors hover:border-cinnabar/40 sm:p-5"
                  >
                    <p className="text-2xs tracking-[0.3em] text-mute">下一章 →</p>
                    <p className="mt-2 truncate font-serif text-sm text-ink transition-colors group-hover:text-cinnabar sm:text-base">
                      {nextChapter.title}
                    </p>
                  </Link>
                ) : (
                  <p className="flex items-center justify-end pr-2 text-2xs tracking-[0.3em] text-mute/60">
                    已是最新一章 · 戲還在演
                  </p>
                )}
              </nav>
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
