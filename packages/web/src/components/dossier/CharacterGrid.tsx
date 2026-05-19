import type { Character } from '@endless-story/shared';
import Link from 'next/link';
import { SubscribeCard } from '@/components/subscribe/SubscribeCard';

export type RosterFilter = 'all' | 'internal' | 'external' | 'mine';

const FILTERS: { key: RosterFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'internal', label: '春雪社' },
  { key: 'external', label: '江湖' },
  { key: 'mine', label: '我的' },
];

export interface CardData {
  character: Character;
  quote?: { text: string; chapterId?: string; chapterTitle?: string };
  tension?: { targetName: string; label: string };
  initialSubscriberCount: number;
  initialSubscribed: boolean;
  isOwner: boolean;
  nextPovHint?: string;
}

export function CharacterGrid({
  cards,
  filter,
  viewerWallet,
  internalSagaId,
}: {
  cards: CardData[];
  filter: RosterFilter;
  viewerWallet: string | null;
  internalSagaId: string;
}) {
  const visible = cards.filter(({ character: c }) => {
    if (filter === 'internal') return c.sagaId === internalSagaId;
    if (filter === 'external') return c.sagaId !== internalSagaId;
    if (filter === 'mine') return viewerWallet ? c.nftOwner === viewerWallet : false;
    return true;
  });

  return (
    <section className="px-5 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-serif text-3xl tracking-wide text-ink sm:text-4xl">人物誌</h1>

        <div className="mt-8 flex items-baseline justify-between border-b border-hairline">
          <div className="flex gap-6 sm:gap-8">
            {FILTERS.map((f) => {
              const isActive = f.key === filter;
              return (
                <Link
                  key={f.key}
                  href={{ pathname: '/dossier', query: f.key === 'all' ? {} : { filter: f.key } }}
                  className={`relative pb-3 text-sm tracking-wide transition-colors ${
                    isActive ? 'text-ink' : 'text-mute hover:text-ink'
                  }`}
                >
                  {f.label}
                  {isActive ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 bg-cinnabar" />
                  ) : null}
                </Link>
              );
            })}
          </div>
          <span className="pb-3 text-sm text-mute">{visible.length} 人</span>
        </div>

        {visible.length === 0 ? (
          <p className="mt-12 text-center text-sm text-mute">這個範圍裡還沒有角色。</p>
        ) : (
          <>
            {/* Mobile: horizontal scroll-snap carousel, edges flush with viewport */}
            <div className="no-scrollbar -mx-5 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 scroll-px-5 md:hidden">
              {visible.map((card) => (
                <div
                  key={card.character.id}
                  className="w-[78vw] max-w-[320px] flex-shrink-0 snap-center"
                >
                  <SubscribeCard {...card} />
                </div>
              ))}
            </div>

            {/* Tablet+: grid */}
            <div className="mt-8 hidden grid-cols-2 gap-6 md:grid xl:grid-cols-3">
              {visible.map((card) => (
                <SubscribeCard key={card.character.id} {...card} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
