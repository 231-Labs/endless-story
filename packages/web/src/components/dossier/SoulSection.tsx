import type { Chapter, CharacterPersona } from '@endless-story/shared';

/**
 * Soul — the character's structural self once out of character.
 * Three columns (axis / voice / bounds), each 2-4 short phrases.
 */
export function SoulSection({
  persona,
}: {
  persona: CharacterPersona | null;
  /** Retained for the caller; the regen meta caption was removed. */
  regenChapter?: Chapter | null;
}) {
  if (!persona) return null;

  const hasAny =
    persona.axes.length > 0 ||
    persona.mannerisms.length > 0 ||
    persona.boundaries.length > 0;
  if (!hasAny) return null;

  return (
    <section>
      <header className="flex items-center gap-4">
        <div className="h-px w-8 bg-cinnabar/40" />
        <h2 className="font-serif text-2xl tracking-wide text-ink">本色</h2>
      </header>
      <div className="mt-8 pl-0 sm:pl-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
          <PersonaColumn glyph="軸" lines={persona.axes} />
          <PersonaColumn glyph="腔" lines={persona.mannerisms} />
          <PersonaColumn glyph="界" lines={persona.boundaries} />
        </div>
      </div>
    </section>
  );
}

function PersonaColumn({ glyph, lines }: { glyph: string; lines: string[] }) {
  return (
    <div>
      <div className="flex items-baseline gap-3 border-b border-hairline pb-3">
        <span className="font-serif text-3xl leading-none text-cinnabar">{glyph}</span>
        <span className="text-2xs tracking-widest text-mute">{GLYPH_HINT[glyph]}</span>
      </div>
      {lines.length === 0 ? (
        <p className="mt-5 text-sm italic text-mute">— 未錄 —</p>
      ) : (
        <ul className="mt-5 space-y-3.5">
          {lines.map((line, i) => (
            <li
              key={i}
              className="border-l border-cinnabar/25 pl-3 font-serif text-[15px] italic leading-relaxed text-ink/85 dark:border-cinnabar/35"
            >
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const GLYPH_HINT: Record<string, string> = {
  軸: '不變的傾向',
  腔: '辨識角色的方式',
  界: '不肯退的線',
};
