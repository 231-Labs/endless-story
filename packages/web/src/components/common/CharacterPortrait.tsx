import type { Character, CharacterRole } from '@endless-story/shared';

type Tone = { bg: string; ring: string; text: string };

const TONE_BY_ROLE: Record<CharacterRole, Tone> = {
  班主: { bg: 'bg-stone-100', ring: 'ring-stone-200', text: 'text-stone-400' },
  青衣: { bg: 'bg-rose-50', ring: 'ring-rose-100', text: 'text-rose-300' },
  花旦: { bg: 'bg-pink-50', ring: 'ring-pink-100', text: 'text-pink-300' },
  小生: { bg: 'bg-indigo-50', ring: 'ring-indigo-100', text: 'text-indigo-300' },
  武旦: { bg: 'bg-amber-50', ring: 'ring-amber-100', text: 'text-amber-400' },
  老旦: { bg: 'bg-stone-100', ring: 'ring-stone-200', text: 'text-stone-400' },
  丑: { bg: 'bg-neutral-100', ring: 'ring-neutral-200', text: 'text-neutral-400' },
  樂師: { bg: 'bg-emerald-50', ring: 'ring-emerald-100', text: 'text-emerald-300' },
  箱管: { bg: 'bg-sky-50', ring: 'ring-sky-100', text: 'text-sky-300' },
  學徒: { bg: 'bg-yellow-50', ring: 'ring-yellow-100', text: 'text-yellow-400' },
  看客: { bg: 'bg-zinc-100', ring: 'ring-zinc-200', text: 'text-zinc-400' },
};

const DEFAULT_TONE: Tone = TONE_BY_ROLE['班主'];

export function CharacterPortrait({
  character,
  aspect = '3/4',
}: {
  character: Character;
  aspect?: '1/1' | '3/4' | '4/5' | '16/9';
}) {
  const tone = TONE_BY_ROLE[character.role] ?? DEFAULT_TONE;
  const initial = character.name[0];
  const aspectClass =
    aspect === '1/1' ? 'aspect-square' :
    aspect === '3/4' ? 'aspect-[3/4]' :
    aspect === '4/5' ? 'aspect-[4/5]' : 'aspect-video';

  return (
    <div className={`relative overflow-hidden rounded-md ring-1 ${aspectClass} ${tone.bg} ${tone.ring}`}>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-serif text-5xl ${tone.text}`}>{initial}</span>
      </div>
    </div>
  );
}
