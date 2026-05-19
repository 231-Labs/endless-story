import Link from 'next/link';
import { chaptersApi, sagasApi, charactersApi } from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { truncateBlobId } from '@/lib/format';

type FeedMode = 'all' | 'ensemble' | 'pov';

const MODES: { key: FeedMode; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'ensemble', label: '群像' },
  { key: 'pov', label: '視角' },
];

function parseMode(raw: string | string[] | undefined): FeedMode {
  if (typeof raw === 'string' && (['all', 'ensemble', 'pov'] as const).includes(raw as FeedMode)) {
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
    if (mode === 'ensemble') return !c.povCharacterId;
    if (mode === 'pov') return Boolean(c.povCharacterId);
    return true;
  });

  return (
    <main className="min-h-screen">
      <SiteNav />
      <section className="px-5 py-12 sm:px-10 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-baseline justify-between">
            <h1 className="font-serif text-3xl tracking-wide text-ink sm:text-4xl">連載</h1>
            <span className="text-sm text-mute">{saga.name} · 第 {saga.currentDay} 日</span>
          </div>

          <div className="mt-6 flex gap-6 border-b border-hairline sm:gap-8">
            {MODES.map((m) => {
              const isActive = m.key === mode;
              return (
                <Link
                  key={m.key}
                  href={{
                    pathname: '/feed',
                    query: m.key === 'all' ? {} : { mode: m.key },
                  }}
                  className={`relative pb-3 text-sm tracking-wide transition-colors ${
                    isActive ? 'text-ink' : 'text-mute hover:text-ink'
                  }`}
                >
                  {m.label}
                  {isActive ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 bg-cinnabar" />
                  ) : null}
                </Link>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="mt-12 text-center text-sm text-mute">這個範圍裡還沒有章回。</p>
          ) : (
            <ul className="mt-6 divide-y divide-hairline">
              {visible.map((chapter) => {
                const pov = chapter.povCharacterId
                  ? charactersById.get(chapter.povCharacterId)
                  : null;
                return (
                  <li key={chapter.id}>
                    <Link
                      href={`/feed/chapter/${chapter.id}`}
                      className="group block py-7 transition-colors"
                    >
                      <div className="flex items-center gap-3 text-2xs tracking-widest text-mute">
                        <span>DAY {chapter.day}</span>
                        {pov ? <span className="text-cinnabar">{pov.name} 視角</span> : null}
                        <span className="font-mono ml-auto">
                          walrus · {truncateBlobId(chapter.walrusBlobId)}
                        </span>
                      </div>
                      <h2 className="mt-2 font-serif text-xl text-ink transition-colors group-hover:text-cinnabar sm:text-2xl">
                        {chapter.title}
                      </h2>
                      <p className="mt-2 line-clamp-2 text-[15px] leading-loose text-ink/70 transition-colors group-hover:text-ink sm:text-base">
                        {chapter.body}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
