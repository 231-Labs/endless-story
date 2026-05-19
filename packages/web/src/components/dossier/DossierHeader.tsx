import type { Character } from '@endless-story/shared';
import { BackButton } from '@/components/common/BackButton';
import { CharacterPortrait } from '@/components/common/CharacterPortrait';
import { truncateAddress, survivalBadgeClasses, survivalLabel } from '@/lib/format';

const GENDER_LABEL = { female: '女', male: '男', other: '其他' } as const;

export function DossierHeader({ character }: { character: Character }) {
  return (
    <header
      id="dossier-header"
      className="border-b border-hairline px-5 pb-8 pt-4 sm:px-10 sm:pb-10 sm:pt-5"
    >
      <div className="mx-auto max-w-6xl">
        <BackButton fallback="/dossier" ariaLabel="返回" />
      </div>
      <div className="mx-auto mt-4 flex max-w-6xl flex-col gap-5 sm:mt-5 sm:flex-row sm:items-center sm:gap-10">
        <div id="dossier-portrait" className="w-28 shrink-0 sm:w-40">
          <CharacterPortrait character={character} aspect="3/4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 text-2xs tracking-widest text-mute">
            <span>{character.role}</span>
            <span className="text-hairline">·</span>
            <span>{character.sagaId ? '春雪社' : '江湖'}</span>
          </div>
          <h1 className="mt-2 font-serif text-3xl tracking-wide text-ink sm:text-4xl">
            {character.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
            <span>{GENDER_LABEL[character.gender]} · {character.age} 歲</span>
            <span className="text-hairline">·</span>
            <OwnerHover address={character.nftOwner} />
          </div>
          <div className="mt-3">
            <span
              className={`rounded-full px-2.5 py-0.5 text-2xs tracking-widest ring-1 ${survivalBadgeClasses(character.survival.level)}`}
            >
              {survivalLabel(character.survival.level)} · 可撐 {character.survival.daysLeft} 日
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function OwnerHover({ address }: { address: string }) {
  return (
    <span className="group inline-flex cursor-default items-center">
      <span>owner</span>
      <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap font-mono opacity-0 transition-all duration-300 group-hover:ml-2 group-hover:max-w-[160px] group-hover:opacity-100">
        {truncateAddress(address)}
      </span>
    </span>
  );
}
