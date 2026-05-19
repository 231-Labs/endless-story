import type { Character } from '@endless-story/shared';
import Link from 'next/link';
import { CharacterPortrait } from '@/components/common/CharacterPortrait';

export function CharacterCard({ character }: { character: Character }) {
  return (
    <Link
      href={{ pathname: '/dossier', query: { id: character.id } }}
      className="group flex flex-col gap-3"
    >
      <CharacterPortrait character={character} aspect="3/4" />
      <div>
        <div className="flex items-baseline gap-2">
          <h3 className="font-serif text-lg text-ink group-hover:text-cinnabar">
            {character.name}
          </h3>
          <span className="text-2xs tracking-widest text-mute">{character.role}</span>
        </div>
        <p className="mt-0.5 text-2xs tracking-widest text-mute">
          {character.sagaId ? '春雪社' : '江湖'}
        </p>
      </div>
    </Link>
  );
}
