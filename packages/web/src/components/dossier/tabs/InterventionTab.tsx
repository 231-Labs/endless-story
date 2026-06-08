import type { Character, OwnerIntervention, SoulSong } from '@endless-story/shared';
import { InterventionComposerGate } from './InterventionComposerGate';
import { SoulSongPanel } from './SoulSongPanel';
import { Linkified } from '@/components/common/CharacterLinkifier';
import { formatDate } from '@/lib/format';
import type { ReflectionEntry } from '@/lib/chain/reflection-read';
import { ReflectionsSection } from './ReflectionsSection';

export function InterventionTab({
  character,
  interventions,
  soulSongs,
  viewerWallet,
  sagaCharacters,
  reflections,
}: {
  character: Character;
  interventions: OwnerIntervention[];
  soulSongs: SoulSong[];
  viewerWallet: string | null;
  sagaCharacters: Character[];
  reflections: ReflectionEntry[];
}) {
  // SoulSongPanel still uses the URL-param-derived viewerWallet flag
  // (server-side gate). Composer's owner check is delegated to its
  // client-side gate (real dapp-kit account check), so it works for
  // users who haven't passed ?as= but have connected a wallet.
  const isOwner = viewerWallet === character.nftOwner;

  return (
    <div className="space-y-16">
      <SoulSongPanel
        characterId={character.id}
        characterName={character.name}
        songs={soulSongs}
        isOwner={isOwner}
        sagaCharacters={sagaCharacters}
      />

      <div className="pl-0 sm:pl-12">
        <InterventionComposerGate
          characterId={character.id}
          characterNftOwner={character.nftOwner}
        />
      </div>

      <ReflectionsSection
        reflections={reflections}
        characterNftOwner={character.nftOwner}
      />

      <section>
        <div className="flex items-center gap-4">
          <div className="h-px w-8 bg-cinnabar/40" />
          <h2 className="font-serif text-2xl tracking-wide text-ink">過往寄託</h2>
        </div>
        <div className="mt-8 pl-0 sm:pl-12">
          {interventions.length === 0 ? (
            <div className="rounded-3xl bg-surface/40 border border-hairline/50 p-12 text-center backdrop-blur-sm">
              <p className="text-sm text-mute tracking-wide">尚無寄託。</p>
            </div>
          ) : (
            <ul className="space-y-6">
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
        </div>
      </section>
    </div>
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
    <li className="rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm transition-all duration-300 hover:bg-surface hover:shadow-sm">
      <div className="flex items-baseline justify-between gap-3 text-xs tracking-widest text-mute/80">
        <span className="bg-canvas/50 px-2.5 py-1 rounded border border-hairline/50">
          {intv.kind === 'inject_dream' ? '夢' : '語'} · {formatDate(intv.createdAt)}
        </span>
        {intv.acknowledgedAt ? (
          <span className="text-jade font-medium">已感應</span>
        ) : null}
      </div>
      <p className="mt-5 text-lg leading-loose text-ink/85">
        {isOwner ? (
          <Linkified text={intv.text} characters={sagaCharacters} skipId={selfId} />
        ) : (
          maskBody(intv.text)
        )}
      </p>
      {!isOwner ? (
        <p className="mt-3 text-2xs tracking-widest text-mute/60">內容被 Seal 加密</p>
      ) : null}
    </li>
  );
}

function maskBody(text: string): string {
  if (text.length <= 8) return '…'.repeat(text.length);
  return text.slice(0, 4) + '…'.repeat(8);
}
