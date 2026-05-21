import type { CharacterPersona } from '@endless-story/shared';

/**
 * 本色 — 角色卸了妝、出戲以後的結構性面貌。
 * 三欄：軸 / 腔 / 界。每欄是 2–4 句短語。
 *
 * 視覺語彙：
 *   - 大字 cinnabar serif 單字當欄標題（軸 腔 界）
 *   - 短句以 hairline 細線左邊條呈現，serif italic — 像一行行小註
 *   - 整體不喧賓奪主、留白多，與「敘描」段並置時有節奏對比
 */
export function SoulSection({ persona }: { persona: CharacterPersona | null }) {
  if (!persona) return null;

  const hasAny =
    persona.axes.length > 0 ||
    persona.mannerisms.length > 0 ||
    persona.boundaries.length > 0;
  if (!hasAny) return null;

  return (
    <section>
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-2xl text-ink">本色</h2>
        <p className="text-2xs tracking-widest text-mute">
          半永久 · v{persona.version}
        </p>
      </header>
      <p className="mt-2 text-sm text-mute">
        她卸了妝、出了戲以後 — 不會丟掉的那些。
      </p>

      <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
        <PersonaColumn glyph="軸" lines={persona.axes} />
        <PersonaColumn glyph="腔" lines={persona.mannerisms} />
        <PersonaColumn glyph="界" lines={persona.boundaries} />
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
  腔: '辨識她的方式',
  界: '不肯退的線',
};
