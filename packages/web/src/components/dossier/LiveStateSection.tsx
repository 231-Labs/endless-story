import type { CharacterLiveState } from '@endless-story/shared';

// Gender-neutral labels (matches DossierHeader).
const ITEMS: { key: keyof CharacterLiveState; label: string }[] = [
  { key: 'intent', label: '此刻心境' },
  { key: 'location', label: '身在何處' },
  { key: 'nextPlan', label: '將往何方' },
];

export function LiveStateSection({ state }: { state: CharacterLiveState }) {
  return (
    <section className="sticky top-[57px] z-30 border-b border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90 sm:top-[65px]">
      <div className="no-scrollbar mx-auto flex h-14 max-w-6xl items-center gap-5 overflow-x-auto px-5 sm:grid sm:grid-cols-3 sm:px-10">
        {ITEMS.map((item) => (
          <div key={item.key} className="min-w-[15rem] overflow-hidden sm:min-w-0">
            <p className="text-2xs tracking-widest text-mute">{item.label}</p>
            <p className="mt-1 truncate text-sm leading-none text-ink/80">{state[item.key]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
