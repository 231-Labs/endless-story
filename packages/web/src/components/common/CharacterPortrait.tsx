import type { Character, CharacterRole } from '@endless-story/shared';
import { BlobImage } from './BlobImage';

type Tone = { bg: string; ring: string; text: string };

const TONE_BY_ROLE: Record<CharacterRole, Tone> = {
  班主: {
    bg: 'bg-stone-100 dark:bg-stone-800',
    ring: 'ring-stone-200 dark:ring-stone-700',
    text: 'text-stone-400 dark:text-stone-500',
  },
  青衣: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    ring: 'ring-rose-100 dark:ring-rose-900/50',
    text: 'text-rose-300 dark:text-rose-800',
  },
  花旦: {
    bg: 'bg-pink-50 dark:bg-pink-950/40',
    ring: 'ring-pink-100 dark:ring-pink-900/50',
    text: 'text-pink-300 dark:text-pink-800',
  },
  小生: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    ring: 'ring-indigo-100 dark:ring-indigo-900/50',
    text: 'text-indigo-300 dark:text-indigo-800',
  },
  武旦: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    ring: 'ring-amber-100 dark:ring-amber-900/50',
    text: 'text-amber-400 dark:text-amber-700',
  },
  老旦: {
    bg: 'bg-stone-100 dark:bg-stone-800',
    ring: 'ring-stone-200 dark:ring-stone-700',
    text: 'text-stone-400 dark:text-stone-500',
  },
  丑: {
    bg: 'bg-neutral-100 dark:bg-neutral-800',
    ring: 'ring-neutral-200 dark:ring-neutral-700',
    text: 'text-neutral-400 dark:text-neutral-500',
  },
  樂師: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    ring: 'ring-emerald-100 dark:ring-emerald-900/50',
    text: 'text-emerald-300 dark:text-emerald-800',
  },
  箱管: {
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    ring: 'ring-sky-100 dark:ring-sky-900/50',
    text: 'text-sky-300 dark:text-sky-800',
  },
  學徒: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/40',
    ring: 'ring-yellow-100 dark:ring-yellow-900/50',
    text: 'text-yellow-400 dark:text-yellow-700',
  },
  看客: {
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    ring: 'ring-zinc-200 dark:ring-zinc-700',
    text: 'text-zinc-400 dark:text-zinc-500',
  },
};

const DEFAULT_TONE: Tone = TONE_BY_ROLE['班主'];

export function characterPortraitTone(role: CharacterRole): Tone {
  return TONE_BY_ROLE[role] ?? DEFAULT_TONE;
}

export function CharacterPortrait({
  character,
  aspect = '3/4',
  sizes = '(min-width: 1024px) 320px, 50vw',
}: {
  character: Character;
  aspect?: '1/1' | '3/4' | '4/5' | '16/9';
  /** next/image responsive hint — 按實際渲染寬度傳（如訂閱列的 "80px"）。 */
  sizes?: string;
}) {
  const tone = characterPortraitTone(character.role);
  const initial = character.name[0];
  const aspectClass =
    aspect === '1/1' ? 'aspect-square' :
    aspect === '3/4' ? 'aspect-[3/4]' :
    aspect === '4/5' ? 'aspect-[4/5]' : 'aspect-video';
  const imageUrl = character.gallery.anchor?.imageUrl;

  return (
    <div className={`relative overflow-hidden rounded-lg bg-surface ring-1 ring-hairline shadow-sm shadow-ink/5 ${aspectClass}`}>
      <div className={`absolute inset-1 overflow-hidden rounded-md ring-1 ${tone.bg} ${tone.ring}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-elevated/15 via-transparent to-canvas/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-serif text-5xl ${tone.text}`}>{initial}</span>
        </div>
        {imageUrl ? (
          <BlobImage
            src={imageUrl}
            alt={`${character.name} portrait`}
            sizes={sizes}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/45 dark:ring-white/5"
      />
    </div>
  );
}
