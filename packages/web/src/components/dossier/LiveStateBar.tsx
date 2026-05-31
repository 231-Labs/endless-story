import type { Character, CharacterLiveState } from '@endless-story/shared';
import { Linkified } from '@/components/common/CharacterLinkifier';

// Gender-neutral labels — characters can be any gender, so situation-based.
const LIVE_ITEMS: { key: keyof CharacterLiveState; label: string }[] = [
  { key: 'intent', label: '此刻心境' },
  { key: 'location', label: '身在何處' },
  { key: 'nextPlan', label: '將往何方' },
];

/**
 * The 此刻心境 / 身在何處 / 將往何方 bar. Split out of DossierHeader so it can
 * STREAM in: 此刻心境 + 將往何方 come from the character's plan, a SEAL recall
 * that would otherwise block the header's first paint. The header renders the
 * skeleton immediately and swaps this in when the recall resolves.
 */
export function LiveStateBar({
  liveState,
  sagaCharacters,
  characterId,
}: {
  liveState: CharacterLiveState;
  sagaCharacters: Character[];
  characterId: string;
}) {
  return (
    <div className="mt-12 border-t border-hairline pt-6 sm:mt-12 sm:pt-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
        {LIVE_ITEMS.map((item) => (
          <div key={item.key} className="min-w-0">
            <p className="text-xs tracking-widest text-mute">{item.label}</p>
            <p className="mt-2 font-serif text-lg leading-snug text-ink/90">
              <Linkified
                text={liveState[item.key]}
                characters={sagaCharacters}
                skipId={characterId}
              />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LiveStateBarSkeleton() {
  return (
    <div className="mt-12 border-t border-hairline pt-6 sm:mt-12 sm:pt-8">
      <div className="grid animate-pulse grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="min-w-0">
            <div className="h-3 w-16 rounded bg-hairline/60 dark:bg-hairline" />
            <div className="mt-3 h-5 w-full max-w-[12rem] rounded bg-hairline/60 dark:bg-hairline" />
          </div>
        ))}
      </div>
    </div>
  );
}
