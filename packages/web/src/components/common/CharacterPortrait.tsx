import type { Character } from '@endless-story/shared';

const TONE_BY_ROLE: Record<string, string> = {
  班主: 'bg-stone-200 text-stone-700',
  青衣: 'bg-rose-100 text-rose-800',
  花旦: 'bg-pink-100 text-pink-800',
  小生: 'bg-indigo-100 text-indigo-800',
  武旦: 'bg-amber-100 text-amber-800',
  老旦: 'bg-stone-100 text-stone-700',
  丑: 'bg-neutral-200 text-neutral-700',
  樂師: 'bg-emerald-100 text-emerald-800',
  箱管: 'bg-sky-100 text-sky-800',
  學徒: 'bg-yellow-100 text-yellow-800',
  看客: 'bg-zinc-100 text-zinc-700',
};

export function CharacterPortrait({
  character,
  aspect = '3/4',
  showRoleBadge = false,
}: {
  character: Character;
  aspect?: '1/1' | '3/4' | '4/5' | '16/9';
  showRoleBadge?: boolean;
}) {
  const tone = TONE_BY_ROLE[character.role] ?? 'bg-stone-100 text-stone-700';
  const initial = character.name[0];
  const aspectClass =
    aspect === '1/1' ? 'aspect-square' :
    aspect === '3/4' ? 'aspect-[3/4]' :
    aspect === '4/5' ? 'aspect-[4/5]' : 'aspect-video';

  return (
    <div className={`relative overflow-hidden rounded-md ${aspectClass} ${tone}`}>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-serif text-5xl opacity-80">{initial}</span>
      </div>
      {showRoleBadge ? (
        <div className="absolute bottom-2 left-2 rounded bg-white/80 px-1.5 py-0.5 text-2xs tracking-widest backdrop-blur">
          {character.role}
        </div>
      ) : null}
    </div>
  );
}
