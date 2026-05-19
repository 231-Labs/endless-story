import type { Character } from '@endless-story/shared';

export function FeaturedCast({ characters }: { characters: Character[] }) {
  return (
    <section className="px-8 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-serif tracking-widest text-ink">在臺</h2>
          <span className="text-xs text-ink/50">訂閱任一角色 · 收他第一人稱當日故事</span>
        </header>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {characters.map((c) => (
            <CastCard key={c.id} character={c} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CastCard({ character }: { character: Character }) {
  return (
    <article className="flex flex-col gap-1.5">
      <div className="aspect-[3/4] overflow-hidden rounded-sm bg-ink/5 ring-1 ring-ink/10">
        <div className="flex h-full items-center justify-center text-ink/25">
          <span className="text-[10px] tracking-widest">portrait</span>
        </div>
      </div>
      <p className="text-sm font-serif text-ink">{character.name}</p>
      <p className="text-[10px] tracking-widest text-jade/80">{character.role}</p>
    </article>
  );
}
