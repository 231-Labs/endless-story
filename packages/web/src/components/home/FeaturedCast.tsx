import type { Character } from '@endless-story/shared';
import { CharacterPortrait } from '@/components/common/CharacterPortrait';

export function FeaturedCast({ characters }: { characters: Character[] }) {
  return (
    <section className="border-t border-hairline px-5 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-serif text-xl tracking-wide text-ink sm:text-2xl">在臺</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:mt-8 sm:grid-cols-3 sm:gap-5 lg:grid-cols-5">
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
    <article className="flex flex-col gap-2.5">
      <CharacterPortrait character={character} aspect="3/4" />
      <div>
        <p className="font-serif text-base text-ink">{character.name}</p>
        <p className="mt-0.5 text-2xs tracking-widest text-mute">{character.role}</p>
      </div>
    </article>
  );
}
