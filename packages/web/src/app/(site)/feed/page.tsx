import Link from 'next/link';
import { chaptersApi, sagasApi, charactersApi } from '@/lib/api/index';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SiteNav } from '@/components/home/SiteNav';
import { truncateBlobId } from '@/lib/format';

type FeedMode = 'all' | 'text' | 'visual';

const MODES: { key: FeedMode; label: string; shortLabel: string }[] = [
  { key: 'all', label: '全部', shortLabel: '全部' },
  { key: 'text', label: '文字連載', shortLabel: '文字' },
  { key: 'visual', label: '影像與畫冊', shortLabel: '影像' },
];

function parseMode(raw: string | string[] | undefined): FeedMode {
  if (typeof raw === 'string' && (['all', 'text', 'visual'] as const).includes(raw as FeedMode)) {
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
  const saga = await sagasApi.getCurrentSaga();
  const [chapters, allCharacters] = await Promise.all([
    chaptersApi.listChapters(saga.id),
    charactersApi.listSagaCharacters(saga.id),
  ]);
  const charactersById = new Map(allCharacters.map((c) => [c.id, c]));

  const publicChapters = chapters.filter((c) => c.visibility === 'public_chapter');
  const visible = publicChapters.filter((c) => {
    const isVisual = c.mediaType === 'video' || c.mediaType === 'gallery';
    if (mode === 'text') return !isVisual;
    if (mode === 'visual') return isVisual;
    return true;
  });

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

            <div className="-mx-5 mt-6 flex gap-4 overflow-x-auto border-b border-hairline px-5 pb-px sm:mx-0 sm:mt-8 sm:flex-wrap sm:gap-8 sm:overflow-visible sm:px-0">
              {MODES.map((m) => {
                const isActive = m.key === mode;
                return (
                  <Link
                    key={m.key}
                    href={{
                      pathname: '/feed',
                      query: m.key === 'all' ? {} : { mode: m.key },
                    }}
                    className={`relative shrink-0 whitespace-nowrap pb-3 text-sm tracking-wide transition-colors ${
                      isActive ? 'text-ink' : 'text-mute hover:text-ink'
                    }`}
                  >
                    <span className="sm:hidden">{m.shortLabel}</span>
                    <span className="hidden sm:inline">{m.label}</span>
                    {isActive ? (
                      <span className="absolute inset-x-0 -bottom-px h-0.5 bg-cinnabar" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <section className="px-5 pb-8 pt-4 sm:px-10 sm:pb-14 sm:pt-5">
        <div className="mx-auto max-w-6xl">
          {visible.length === 0 ? (
            <div className="rounded-3xl border border-hairline/50 bg-surface/40 p-12 text-center backdrop-blur-sm">
              <p className="text-sm tracking-wide text-mute">這個範圍裡還沒有章回。</p>
            </div>
          ) : (
            <div className={`${mode === 'visual' ? 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-6'}`}>
              {visible.map((chapter) => {
                const pov = chapter.povCharacterId
                  ? charactersById.get(chapter.povCharacterId)
                  : null;
                const isVisual = chapter.mediaType === 'video' || chapter.mediaType === 'gallery';

                // Visual card layout (Gallery style)
                if (mode === 'visual' || (mode === 'all' && isVisual)) {
                  return (
                    <div key={chapter.id}>
                      <Link
                        href={`/feed/chapter/${chapter.id}`}
                        className="group flex flex-col gap-3 rounded-3xl bg-surface/40 border border-hairline/50 p-4 backdrop-blur-sm transition-all duration-300 hover:bg-surface hover:border-cinnabar/30 hover:shadow-sm"
                      >
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface ring-1 ring-inset ring-hairline/50 dark:bg-elevated/45 transition-transform duration-500 group-hover:shadow-md">
                          {chapter.coverUrl ? (
                            <img
                              src={chapter.coverUrl}
                              alt={chapter.title}
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
                            </div>
                            <h2 className="mt-2 font-serif text-lg leading-snug text-ink transition-colors group-hover:text-cinnabar">
                              {chapter.title}
                            </h2>
                          </div>
                        </div>
                        {mode === 'all' && (
                           <p className="mt-2 px-2 line-clamp-2 text-sm leading-loose text-ink/70">
                             {chapter.body}
                           </p>
                        )}
                      </Link>
                    </div>
                  );
                }

                // Text list layout
                return (
                  <div key={chapter.id}>
                    <Link
                      href={`/feed/chapter/${chapter.id}`}
                      className="group block rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm transition-all duration-300 hover:bg-surface hover:border-cinnabar/30 hover:shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-3 text-xs tracking-widest text-mute/80">
                        <span className="bg-canvas/50 px-2.5 py-1 rounded border border-hairline/50">DAY {chapter.day}</span>
                        {pov ? <span className="text-cinnabar font-medium">{pov.name} 視角</span> : null}
                        <span className="font-mono ml-auto text-2xs">
                          walrus · {truncateBlobId(chapter.walrusBlobId)}
                        </span>
                      </div>
                      <h2 className="mt-4 font-serif text-2xl tracking-wide text-ink transition-colors group-hover:text-cinnabar flex items-center gap-2">
                        {chapter.title}
                      </h2>
                      <p className="mt-3 line-clamp-2 text-base leading-loose text-ink/75 transition-colors group-hover:text-ink/90">
                        {chapter.body}
                      </p>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
