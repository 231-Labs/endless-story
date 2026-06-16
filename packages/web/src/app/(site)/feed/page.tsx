import Link from 'next/link';
import { Suspense } from 'react';
import { chaptersApi, gazettesApi, cutsApi, sagasApi, charactersApi } from '@/lib/api/index';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SiteNav } from '@/components/home/SiteNav';
import { BlobImage } from '@/components/common/BlobImage';
import { GazetteList } from '@/components/feed/GazetteList';
import { GazetteTeaser } from '@/components/feed/GazetteTeaser';
import { CutList } from '@/components/feed/CutList';
import { FeedTabs, type FeedMode } from '@/components/feed/FeedTabs';

export const metadata = {
  title: '梨園章回',
  description: '春雪社的公開連載 — 角色親筆的章回、公報與影像，逐日上鏈。',
};

// IA (docs/CONTENT_PIPELINE.md §8.1): the canonical chapter is the event CUT
// (woven multi-POV); single POVs are demoted to per-character feeds on the
// dossier. Modes 全部 / 公報 / 章回 / 影像 + their tab row live in FeedTabs.

function parseMode(raw: string | string[] | undefined): FeedMode {
  if (typeof raw === 'string' && (['all', 'gazette', 'chapter', 'visual'] as const).includes(raw as FeedMode)) {
    return raw as FeedMode;
  }
  return 'all';
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const mode = parseMode(params.mode);
  // The shell only needs the saga (short-TTL cached read) — header + tabs
  // paint immediately; everything below the tabs streams in via Suspense so
  // chain scans / blob fetches never block first paint or a tab switch.
  const saga = await sagasApi.getCurrentSaga();

  return (
    <main className="min-h-screen bg-canvas">
      <SiteNav />
      <header className="bg-canvas">
        <div className="px-5 pb-2 pt-8 sm:px-10 sm:pb-3 sm:pt-11">
          <div className="mx-auto max-w-6xl">
            <PageLeadTitleBlock
              eyebrow={`${saga.name} · 第 ${saga.currentDay} 日`}
              eyebrowMobile={saga.name}
              title={
                <>
                  <span className="sm:hidden">章回</span>
                  <span className="hidden sm:inline">梨園章回</span>
                </>
              }
            />

            <FeedTabs mode={mode} />
          </div>
        </div>
      </header>

      <section className="px-5 pb-8 pt-4 sm:px-10 sm:pb-14 sm:pt-5">
        <div className="mx-auto max-w-6xl">
          {/* key=mode swaps to the skeleton + replays the ink-in on tab switch */}
          <div key={mode} className="animate-ink-in">
            <Suspense key={mode} fallback={<FeedContentSkeleton />}>
              <FeedContent mode={mode} saga={saga} />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * Everything below the tabs — all chain scans / blob fetches live here, behind
 * the Suspense boundary. IA (§8.1): single POVs are NOT a top-level feed
 * surface; the expensive saga-wide POV scan only runs for 影像 mode.
 */
async function FeedContent({
  mode,
  saga,
}: {
  mode: FeedMode;
  saga: Awaited<ReturnType<typeof sagasApi.getCurrentSaga>>;
}) {
  const [chapters, allCharacters, gazettes, latestGazette, cuts] = await Promise.all([
    mode === 'visual' ? chaptersApi.listChapters(saga.id) : Promise.resolve([]),
    mode === 'visual' ? charactersApi.listSagaCharacters(saga.id) : Promise.resolve([]),
    // For mode=gazette: full list. For mode=all: also need the latest
    // one as a teaser. Reads run in parallel.
    mode === 'gazette' ? gazettesApi.listGazettes(saga.id) : Promise.resolve([]),
    mode === 'all' ? gazettesApi.getLatestGazette(saga.id) : Promise.resolve(null),
    // The canonical chapter = event cut. Fetched for the 章回 mode and the
    // 全部 landing (where a few lead the page under the gazette teaser).
    mode === 'chapter' || mode === 'all' ? cutsApi.listEventCuts(saga.id) : Promise.resolve([]),
  ]);
  const charactersById = new Map(allCharacters.map((c) => [c.id, c]));

  const publicChapters = chapters.filter((c) => c.visibility === 'public_chapter');
  const visible = publicChapters.filter(
    (c) => c.mediaType === 'video' || c.mediaType === 'gallery',
  );

  return (
    <>
          {mode === 'all' && latestGazette ? (
            <div className="mb-8">
              <GazetteTeaser gazette={latestGazette} sagaName={saga.name} sagaId={saga.id} />
            </div>
          ) : null}
          {mode === 'all' ? (
            <div className="mb-10">
              <div className="mb-5 flex items-baseline justify-between">
                <h2 className="font-serif text-xl tracking-wide text-ink">章回 · 事件合本</h2>
                {cuts.length > 3 ? (
                  <Link
                    href={{ pathname: '/feed', query: { mode: 'chapter' } }}
                    className="text-sm tracking-widest text-cinnabar hover:underline"
                  >
                    全部章回 →
                  </Link>
                ) : null}
              </div>
              <CutList cuts={cuts.slice(0, 3)} sagaName={saga.name} />
              {/* 單 POV 不在 /feed 頂層（IA §8.1）— 指路到名冊各角色的視角連載 */}
              <p className="mt-6 text-sm leading-relaxed tracking-wide text-mute">
                想追單一角色的第一人稱連載？到
                <Link href="/dossier" className="mx-1 text-cinnabar hover:underline">
                  班底名冊
                </Link>
                選角色、訂閱 TA 的視角原料。
              </p>
            </div>
          ) : null}
          {mode === 'gazette' ? (
            <GazetteList gazettes={gazettes} sagaName={saga.name} sagaId={saga.id} />
          ) : mode === 'chapter' ? (
            <CutList cuts={cuts} sagaName={saga.name} />
          ) : mode === 'visual' ? (
            visible.length === 0 ? (
              <div className="es-card p-12 text-center">
                <p className="text-sm tracking-wide text-mute">這個範圍裡還沒有影像。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((chapter) => (
                  <div key={chapter.id}>
                    <Link
                      href={`/feed/chapter/${chapter.id}`}
                      className="group flex flex-col gap-3 es-card p-4 transition-all duration-300 hover:bg-surface hover:border-cinnabar/30 hover:shadow-sm"
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface ring-1 ring-inset ring-hairline/50 dark:bg-elevated/45 transition-transform duration-500 group-hover:shadow-md">
                        {chapter.coverUrl ? (
                          <BlobImage
                            src={chapter.coverUrl}
                            alt={chapter.title}
                            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                            className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-[1.02] group-hover:opacity-100"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="font-serif text-3xl text-mute/30">影像</span>
                          </div>
                        )}
                        <div className="absolute right-3 top-3 rounded-full bg-elevated/90 px-3 py-1 text-[10px] tracking-widest text-ink shadow-sm backdrop-blur-md">
                          {chapter.mediaType === 'video' ? '▶ 影片' : '✦ 畫冊'}
                        </div>

                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-canvas/95 via-canvas/70 to-transparent p-4 pt-16 transition-opacity duration-500">
                          <div className="flex items-center gap-2 text-[10px] tracking-widest text-mute uppercase">
                            <span className="bg-canvas/50 px-2 py-0.5 rounded border border-hairline/50">DAY {chapter.day}</span>
                            {chapter.povCharacterId && charactersById.get(chapter.povCharacterId) ? (
                              <span className="text-cinnabar">
                                {charactersById.get(chapter.povCharacterId)!.name} 視角
                              </span>
                            ) : null}
                          </div>
                          <h2 className="mt-2 font-serif text-lg leading-snug text-ink transition-colors group-hover:text-cinnabar">
                            {chapter.title}
                          </h2>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )
          ) : null}
    </>
  );
}

/** Card-shaped placeholders shown while a tab's content streams in. */
function FeedContentSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse es-card p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="h-6 w-16 rounded bg-hairline/50" />
            <div className="h-4 w-24 rounded bg-hairline/40" />
          </div>
          <div className="mt-4 h-7 w-2/3 rounded bg-hairline/60" />
          <div className="mt-3 h-4 w-full rounded bg-hairline/40" />
          <div className="mt-2 h-4 w-4/5 rounded bg-hairline/40" />
        </div>
      ))}
      <p className="pt-2 text-center text-2xs tracking-[0.35em] text-mute">取章回中</p>
    </div>
  );
}
