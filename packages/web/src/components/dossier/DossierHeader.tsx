import type { Character, CharacterLiveState } from '@endless-story/shared';
import { BackButton } from '@/components/common/BackButton';
import { CharacterPortrait } from '@/components/common/CharacterPortrait';
import { Linkified } from '@/components/common/CharacterLinkifier';
import { truncateAddress, survivalBadgeClasses, survivalLabel } from '@/lib/format';
import { DEMO_SAGA_ID } from '@/mocks/sagas';

const GENDER_LABEL = { female: '女', male: '男', other: '其他' } as const;

const LIVE_ITEMS: { key: keyof CharacterLiveState; label: string }[] = [
  { key: 'intent', label: '她現在' },
  { key: 'location', label: '她在哪' },
  { key: 'nextPlan', label: '她下一步' },
];

export function DossierHeader({
  character,
  liveState,
  sagaCharacters,
}: {
  character: Character;
  liveState: CharacterLiveState;
  sagaCharacters: Character[];
}) {
  return (
    <header
      id="dossier-header"
      className="px-5 pb-8 pt-8 sm:px-10 sm:pb-12 sm:pt-12"
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-8 md:flex-row md:items-stretch md:gap-12 lg:gap-16">
          <div
            id="dossier-portrait"
            className="w-40 shrink-0 sm:w-56 lg:w-[320px]"
          >
            <div className="mb-6">
              <BackButton fallback="/dossier" ariaLabel="返回" />
            </div>
            <CharacterPortrait character={character} aspect="3/4" />
          </div>

          <div className="flex flex-1 flex-col justify-between py-2 lg:pt-14 lg:pb-4">
            <div>
              <div className="flex items-center gap-3 text-sm tracking-widest text-mute">
                <span>{character.role}</span>
                <span className="text-hairline">·</span>
                <span>{character.sagaId === DEMO_SAGA_ID ? '春雪社' : '江湖'}</span>
              </div>
              <h1 className="mt-4 font-serif text-5xl tracking-wide text-ink sm:text-6xl lg:text-7xl">
                {character.name}
              </h1>
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-base text-mute">
                <span>
                  {GENDER_LABEL[character.gender]} · {character.age} 歲
                </span>
                <span className="text-hairline">·</span>
                <OwnerHover address={character.nftOwner} />
              </div>
              <div className="mt-6">
                <span
                  className={`inline-flex rounded-full px-4 py-1.5 text-sm tracking-widest ring-1 ${survivalBadgeClasses(character.survival.level)}`}
                >
                  {survivalLabel(character.survival.level)} · 可撐 {character.survival.daysLeft} 日
                </span>
              </div>
            </div>

            <div className="mt-12 border-t border-hairline pt-6 sm:mt-auto sm:pt-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
                {LIVE_ITEMS.map((item) => (
                  <div key={item.key} className="min-w-0">
                    <p className="text-xs tracking-widest text-mute">{item.label}</p>
                    <p className="mt-2 font-serif text-lg leading-snug text-ink/90">
                      <Linkified
                        text={liveState[item.key]}
                        characters={sagaCharacters}
                        skipId={character.id}
                      />
                    </p>
                  </div>
                ))}
              </div>
            </div>
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