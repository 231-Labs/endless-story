import type { ReactNode } from 'react';
import type { Character } from '@endless-story/shared';
import { BackButton } from '@/components/common/BackButton';
import { CharacterPortrait } from '@/components/common/CharacterPortrait';
import { OwnerDisplay } from '@/components/common/OwnerDisplay';
import { SubscribeButton } from '@/components/common/SubscribeButton';
import { survivalBadgeClasses, survivalLabel } from '@/lib/format';
import { DEMO_SAGA_ID } from '@/mocks/sagas';

const GENDER_LABEL = { female: '女', male: '男', other: '其他' } as const;

export function DossierHeader({
  character,
  liveStateSlot,
  sagaName,
}: {
  character: Character;
  /**
   * The live-state bar (mood / where / next) — passed as a slot so the
   * caller can stream it in (it depends on a SEAL plan recall). Render a
   * LiveStateBar (or a Suspense around a loader) here.
   */
  liveStateSlot: ReactNode;
  /**
   * On-chain saga.info.name fetched by caller (server component). When
   * passed, overrides the legacy DEMO_SAGA_ID slug match. Null falls
   * back to the "wild" label. Mock characters still use the slug match.
   */
  sagaName?: string | null;
}) {
  const sagaLabel =
    sagaName ?? (character.sagaId === DEMO_SAGA_ID ? '春雪社' : '江湖');
  return (
    <header
      id="dossier-header"
      className="px-5 w-full sm:px-10"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 md:mb-6">
          <BackButton fallback="/dossier" ariaLabel="返回" />
        </div>
        {/* 手機：肖像與姓名並排，整個首屏才塞得進一個視窗高；桌面照舊左肖像右資訊 */}
        <div className="flex flex-row items-center gap-5 sm:gap-8 md:gap-12 lg:gap-16">
          <div
            id="dossier-portrait"
            className="w-28 shrink-0 sm:w-44 md:w-56 lg:w-[320px]"
          >
            <CharacterPortrait character={character} aspect="3/4" />
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center py-2 lg:py-8">
            <div className="flex items-center gap-3 text-sm tracking-widest text-mute">
              <span>{character.role}</span>
              <span className="text-hairline">·</span>
              <span>{sagaLabel}</span>
            </div>
            <h1 className="mt-2 font-serif text-4xl tracking-wide text-ink sm:mt-4 sm:text-6xl lg:text-7xl">
              {character.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-mute sm:mt-6 sm:text-base">
              <span>
                {GENDER_LABEL[character.gender]} · {character.age} 歲
              </span>
              <span className="hidden text-hairline sm:inline">·</span>
              <OwnerDisplay address={character.nftOwner} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-6">
              <span
                className={`inline-flex rounded-full px-4 py-1.5 text-sm tracking-widest ring-1 ${survivalBadgeClasses(character.survival.level)}`}
              >
                {survivalLabel(character.survival.level)} ·{' '}
                {character.survival.daysLeft >= 999
                  ? '收支有餘'
                  : `可撐 ${character.survival.daysLeft} 日`}
              </span>
              <SubscribeButton
                characterId={character.id}
                currentCount={character.subscriberCount ?? 0}
              />
            </div>
          </div>
        </div>

        {liveStateSlot}
      </div>
    </header>
  );
}

