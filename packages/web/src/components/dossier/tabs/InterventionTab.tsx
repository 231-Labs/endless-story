import type { Character, OwnerIntervention, SoulSong } from '@endless-story/shared';
import { Composer } from './Composer';
import { SoulSongPanel } from './SoulSongPanel';
import { Linkified } from '@/components/common/CharacterLinkifier';
import { formatDate, truncateAddress } from '@/lib/format';

export function InterventionTab({
  character,
  interventions,
  soulSongs,
  viewerWallet,
  sagaCharacters,
}: {
  character: Character;
  interventions: OwnerIntervention[];
  soulSongs: SoulSong[];
  viewerWallet: string | null;
  sagaCharacters: Character[];
}) {
  const isOwner = viewerWallet === character.nftOwner;

  return (
    <div className="space-y-10">
      <SoulSongPanel
        characterId={character.id}
        characterName={character.name}
        songs={soulSongs}
        isOwner={isOwner}
        sagaCharacters={sagaCharacters}
      />

      {isOwner ? <Composer /> : <LockedNotice character={character} />}

      <section>
        <h3 className="text-2xs tracking-widest text-mute">過往</h3>
        {interventions.length === 0 ? (
          <p className="mt-4 text-sm text-mute">尚無寄託。</p>
        ) : (
          <ul className="mt-5 space-y-6">
            {interventions.map((intv) => (
              <InterventionRow
                key={intv.id}
                intv={intv}
                isOwner={isOwner}
                sagaCharacters={sagaCharacters}
                selfId={character.id}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LockedNotice({ character }: { character: Character }) {
  return (
    <section className="es-soft-panel border-dashed p-4 text-sm text-mute sm:p-5">
      只有持有 {truncateAddress(character.nftOwner)} 能寄夢入她心。
    </section>
  );
}

function InterventionRow({
  intv,
  isOwner,
  sagaCharacters,
  selfId,
}: {
  intv: OwnerIntervention;
  isOwner: boolean;
  sagaCharacters: Character[];
  selfId: string;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-2xs tracking-widest text-mute">
        <span>
          {intv.kind === 'inject_dream' ? '夢' : '語'} · {formatDate(intv.createdAt)}
        </span>
        {intv.acknowledgedAt ? (
          <span className="text-jade">她已感應</span>
        ) : null}
      </div>
      <p className="mt-2 text-base leading-loose text-ink/80">
        {isOwner ? (
          <Linkified text={intv.text} characters={sagaCharacters} skipId={selfId} />
        ) : (
          maskBody(intv.text)
        )}
      </p>
      {!isOwner ? (
        <p className="mt-1 text-2xs tracking-widest text-mute">內容被 Seal 加密</p>
      ) : null}
    </li>
  );
}

function maskBody(text: string): string {
  if (text.length <= 8) return '…'.repeat(text.length);
  return text.slice(0, 4) + '…'.repeat(8);
}
