import Link from 'next/link';
import { Suspense } from 'react';
import type { Chapter, Character } from '@endless-story/shared';
import { chaptersApi, charactersApi, cutsApi } from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { LinkifiedProse } from '@/components/common/CharacterLinkifier';
import { formatDate } from '@/lib/format';
import { txUrl, objectUrl } from '@/lib/explorer';
import { CHAPTER_COPY } from '@/lib/copy/chapters';

/**
 * 視角（POV）閱讀頁 — a single character's first-person raw material.
 *
 * IA (docs/CONTENT_PIPELINE.md §2): the canonical public "回" is the woven
 * event cut (/feed/cut/[id]); this page is one character's angle on it, so it
 * declares itself as 視角原料 and links UP to the cut when one exists.
 *
 * Perf: the prose needs only immutable cached reads (commitment + blob) plus
 * the saga roster — it renders immediately. Prev/next nav streams in via
 * Suspense so navigation never blocks on a saga-wide chapter scan.
 */

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
            className="mt-8 es-button-ghost"
          >
            回梨園章回
          </Link>
        </section>
      </main>
    );
  }

  // Fast path only: the roster read is short-TTL cached; no body scans here.
  const sagaCharacters = await charactersApi
    .listSagaCharacters(chapter.sagaId)
    .catch(() => [] as Character[]);
  const charactersById = new Map(sagaCharacters.map((c) => [c.id, c]));
  const pov = chapter.povCharacterId
    ? charactersById.get(chapter.povCharacterId) ??
      (await charactersApi.getCharacter(chapter.povCharacterId).catch(() => null))
    : null;

  const eventTx = chapter.provenance?.eventTx;

  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="px-5 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/feed"
            aria-label="回梨園章回"
            className="es-icon-button mb-6 h-8 w-8"
          >
            <span aria-hidden className="text-base">←</span>
          </Link>

          <article className="min-w-0">
            {/* Clean opening: a slim eyebrow + title + prose. The technical
                provenance (tx links / cross-links) lives in the footer. */}
            <div className="flex flex-wrap items-center gap-3 text-xs tracking-widest text-mute/80">
              <span className="bg-canvas/50 px-2.5 py-1 rounded border border-hairline/50">DAY {chapter.day}</span>
              {/* IA: this surface is the per-character raw material, not the woven 回 */}
              <span className="rounded border border-cinnabar/30 bg-cinnabar/[0.06] px-2.5 py-1 text-cinnabar/90">
                {pov ? CHAPTER_COPY.pov.eyebrowWithName(pov.name) : CHAPTER_COPY.pov.eyebrow}
              </span>
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
              <p className="mt-5 text-sm leading-relaxed text-mute">
                本篇是
                {pov ? <span className="text-ink"> {pov.name} </span> : ' 角色 '}
                對「<span className="text-ink">{chapter.provenance.eventLabel}</span>」的視角
                {chapter.provenance.sceneName ? ` · ${chapter.provenance.sceneName}` : ''}
                {chapter.provenance.day ? ` · 第 ${chapter.provenance.day} 日` : ''}。
              </p>
            ) : null}

            {chapter.mediaType === 'video' && chapter.videoUrl ? (
              <div className="mt-10 overflow-hidden es-card shadow-sm">
                <video
                  src={chapter.videoUrl}
                  controls
                  className="w-full aspect-video bg-black"
                  preload="metadata"
                />
              </div>
            ) : chapter.mediaType === 'gallery' && chapter.coverUrl ? (
              <div className="mt-10 overflow-hidden es-card shadow-sm">
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

            {/* 章末迴圈：鏈上查驗（footer 行）→ 同事件互鏈 → 追視角 → 上一章 / 下一章。 */}
            <footer className="mt-16 space-y-6">
              {/* Tidy on-chain verification line — moved out of the opening. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline/50 pt-6 text-2xs tracking-widest text-mute/70">
                <span className="text-mute/80">{CHAPTER_COPY.provenance.footerLead}</span>
                {chapter.provenance?.eventTx ? (
                  <a
                    href={txUrl(chapter.provenance.eventTx)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-cinnabar"
                  >
                    {CHAPTER_COPY.provenance.verifyEvent}
                  </a>
                ) : null}
                <a
                  href={objectUrl(chapter.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-cinnabar"
                >
                  {CHAPTER_COPY.provenance.chapterCommitment}
                </a>
              </div>

              {eventTx ? (
                <Suspense fallback={null}>
                  <EventCrossLinks
                    sagaId={chapter.sagaId}
                    currentId={chapter.id}
                    eventTx={eventTx}
                    charactersById={charactersById}
                  />
                </Suspense>
              ) : null}

              {pov ? (
                <div className="es-card p-6 text-center sm:p-8">
                  <p className="text-sm leading-relaxed text-mute">
                    這是 <span className="font-serif text-ink">{pov.name}</span> 眼中的世界。
                  </p>
                  <Link
                    href={{ pathname: '/dossier', query: { id: pov.id } }}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-cinnabar/50 px-5 py-2 text-sm tracking-widest text-cinnabar transition-colors hover:bg-cinnabar hover:text-canvas"
                  >
                    {CHAPTER_COPY.crossLink.followPov(pov.name)}
                  </Link>
                </div>
              ) : null}

              <Suspense fallback={<NavSkeleton />}>
                <ChapterPagerNav sagaId={chapter.sagaId} currentId={chapter.id} />
              </Suspense>
            </footer>
          </article>
        </div>
      </div>
    </main>
  );
}

/* ── streamed sections (saga-wide scans live behind these) ─────────────── */

async function loadTocChapters(sagaId: string): Promise<Chapter[]> {
  const sagaChapters = await chaptersApi.listChapters(sagaId).catch(() => [] as Chapter[]);
  return sagaChapters
    .filter((c) => c.visibility === 'public_chapter')
    .sort((a, b) => a.day - b.day || a.createdAt.localeCompare(b.createdAt));
}

/** 同事件互鏈：合本(向上) + 其他角色視角(平行)。 */
async function EventCrossLinks({
  sagaId,
  currentId,
  eventTx,
  charactersById,
}: {
  sagaId: string;
  currentId: string;
  eventTx: string;
  charactersById: Map<string, Character>;
}) {
  const [sagaChapters, cuts] = await Promise.all([
    chaptersApi.listChapters(sagaId).catch(() => [] as Chapter[]),
    cutsApi.listEventCuts(sagaId).catch(() => []),
  ]);
  const cut = cuts.find((c) => c.eventTx === eventTx);
  const siblingPovs = sagaChapters.filter(
    (c) => c.id !== currentId && c.provenance?.eventTx === eventTx,
  );
  if (!cut && siblingPovs.length === 0) return null;
  return (
    <div className="text-2xs tracking-widest">
      {cut ? (
        <Link
          href={`/feed/cut/${cut.commitmentId}`}
          className="mr-4 inline-block rounded-full border border-cinnabar/40 px-3 py-1 text-cinnabar transition-colors hover:bg-cinnabar hover:text-canvas"
        >
          {CHAPTER_COPY.crossLink.readCut}
        </Link>
      ) : null}
      {siblingPovs.length > 0 ? (
        <>
          <span className="text-mute">{CHAPTER_COPY.crossLink.otherPovs}</span>
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
        </>
      ) : null}
    </div>
  );
}

async function ChapterPagerNav({ sagaId, currentId }: { sagaId: string; currentId: string }) {
  const tocChapters = await loadTocChapters(sagaId);
  const tocIdx = tocChapters.findIndex((c) => c.id === currentId);
  const prevChapter = tocIdx > 0 ? tocChapters[tocIdx - 1] : null;
  const nextChapter =
    tocIdx >= 0 && tocIdx < tocChapters.length - 1 ? tocChapters[tocIdx + 1] : null;
  return (
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
  );
}

/* ── skeletons ─────────────────────────────────────────────────────────── */

function NavSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden>
      <div className="h-20 animate-pulse rounded-2xl bg-hairline/30" />
      <div className="h-20 animate-pulse rounded-2xl bg-hairline/30" />
    </div>
  );
}
