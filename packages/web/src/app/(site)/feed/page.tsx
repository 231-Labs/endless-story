import Link from 'next/link';
import { Suspense } from 'react';
import { gazettesApi, cutsApi, sagasApi, productionsApi } from '@/lib/api/index';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SiteNav } from '@/components/home/SiteNav';
import { GazetteList } from '@/components/feed/GazetteList';
import { GazetteTeaser } from '@/components/feed/GazetteTeaser';
import { CutList } from '@/components/feed/CutList';
import { GroupedCutList } from '@/components/feed/GroupedCutList';
import { ProductionList } from '@/components/feed/ProductionList';
import { FeedTabs, type FeedMode } from '@/components/feed/FeedTabs';

export const metadata = {
  title: '梨園章回',
  description: '春雪社的公開連載 — 角色親筆的章回、公報與影像，逐日上鏈。',
};

// IA (docs/narrative/CONTENT_PIPELINE.md §8.1): the canonical chapter is the event CUT
// (woven multi-POV); single POVs are demoted to per-character feeds on the
// dossier. Modes 全部 / 公報 / 章回 / 影像 + their tab row live in FeedTabs.

function parseMode(raw: string | string[] | undefined): FeedMode {
  if (
    typeof raw === 'string' &&
    (['episode', 'all', 'gazette', 'chapter', 'visual'] as const).includes(raw as FeedMode)
  ) {
    return raw as FeedMode;
  }
  // 追更 is the landing: the storyteller's daily 回 is the follow-along unit.
  return 'episode';
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
  const [productions, gazettes, latestGazette, cuts] = await Promise.all([
    // 排戲 tab (key still 'visual'): the troupe's self-staged 劇目/戲折.
    mode === 'visual' ? productionsApi.listProductions(saga.id) : Promise.resolve([]),
    // For mode=gazette: full list. For mode=all: also need the latest
    // one as a teaser. Reads run in parallel.
    mode === 'gazette' ? gazettesApi.listGazettes(saga.id) : Promise.resolve([]),
    mode === 'all' ? gazettesApi.getLatestGazette(saga.id) : Promise.resolve(null),
    // The canonical chapter = event cut. Fetched for the 章回 mode and the
    // 全部 landing (where a few lead the page under the gazette teaser).
    mode === 'chapter' || mode === 'all' || mode === 'episode' ? cutsApi.listEventCuts(saga.id) : Promise.resolve([]),
  ]);

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
              <p className="mt-6 text-sm tracking-wide text-mute/70">
                想追單一角色的視角連載，請至
                <Link href="/dossier" className="mx-1 text-cinnabar hover:underline">
                  班底名冊
                </Link>
                。
              </p>
            </div>
          ) : null}
          {mode === 'episode' ? (
            (() => {
              const episodes = cuts.filter((c) => c.kind === 'episode');
              return episodes.length > 0 ? (
                <CutList cuts={episodes} sagaName={saga.name} />
              ) : (
                <div className="es-card p-8 text-center">
                  <p className="font-serif text-lg text-ink">說書人尚未開講</p>
                  <p className="mt-2 text-sm tracking-wide text-mute">
                    今日的回目在戲台落幕後編成；先到
                    <Link href={{ pathname: '/feed', query: { mode: 'chapter' } }} className="mx-1 text-cinnabar hover:underline">
                      章回
                    </Link>
                    看事件合本。
                  </p>
                </div>
              );
            })()
          ) : mode === 'gazette' ? (
            <GazetteList gazettes={gazettes} sagaName={saga.name} sagaId={saga.id} />
          ) : mode === 'chapter' ? (
            <GroupedCutList cuts={cuts.filter((c) => c.kind !== 'episode')} sagaName={saga.name} />
          ) : mode === 'visual' ? (
            <ProductionList productions={productions} sagaName={saga.name} />
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
