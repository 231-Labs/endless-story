import type { Character } from '@endless-story/shared';
import Link from 'next/link';
import { CharacterCard } from './CharacterCard';

export type RosterFilter = 'all' | 'internal' | 'external' | 'mine';

const FILTERS: { key: RosterFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'internal', label: '春雪社' },
  { key: 'external', label: '江湖' },
  { key: 'mine', label: '我的' },
];

export function CharacterGrid({
  characters,
  filter,
  viewerWallet,
  internalSagaId,
}: {
  characters: Character[];
  filter: RosterFilter;
  viewerWallet: string | null;
  internalSagaId: string;
}) {
  const visible = characters.filter((c) => {
    if (filter === 'internal') return c.sagaId === internalSagaId;
    if (filter === 'external') return c.sagaId !== internalSagaId;
    if (filter === 'mine') return viewerWallet ? c.nftOwner === viewerWallet : false;
    return true;
  });

  return (
    <section className="px-5 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-baseline justify-between">
          <h1 className="font-serif text-3xl tracking-wide text-ink sm:text-4xl">人物誌</h1>
          <span className="text-sm text-mute">{visible.length} 人</span>
        </div>
        <FilterTabs active={filter} />
        {visible.length === 0 ? (
          <p className="mt-12 text-center text-sm text-mute">這個範圍裡還沒有角色。</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
            {visible.map((c) => (
              <CharacterCard key={c.id} character={c} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FilterTabs({ active }: { active: RosterFilter }) {
  return (
    <div className="mt-6 flex gap-6 border-b border-hairline sm:gap-8">
      {FILTERS.map((f) => {
        const isActive = f.key === active;
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
  );
}
