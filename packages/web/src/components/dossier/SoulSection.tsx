import Link from 'next/link';
import type { Chapter, CharacterPersona, PersonaRegenTrigger } from '@endless-story/shared';
import { shortChapterTitle } from '@/lib/format';

/**
 * 本色 — 角色卸了妝、出戲以後的結構性面貌。
 * 三欄：軸 / 腔 / 界。每欄是 2–4 句短語。
 *
 * 視覺語彙：
 *   - 大字 cinnabar serif 單字當欄標題（軸 腔 界）
 *   - 短句以 hairline 細線左邊條呈現，serif italic — 像一行行小註
 *   - 右上 meta 行：「半永久 · v2 · 暮後合戲落幕後重蒸」— 顯示她在演化
 *   - 整體不喧賓奪主、留白多，與「敘描」段並置時有節奏對比
 */
export function SoulSection({
  persona,
  regenChapter,
}: {
  persona: CharacterPersona | null;
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
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-serif text-2xl text-ink">本色</h2>
        <RegenMeta persona={persona} regenChapter={regenChapter ?? null} />
      </header>
      <p className="mt-2 text-sm text-mute">她卸了妝、出了戲以後 — 不會丟掉的那些。</p>

      <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
        <PersonaColumn glyph="軸" lines={persona.axes} />
        <PersonaColumn glyph="腔" lines={persona.mannerisms} />
        <PersonaColumn glyph="界" lines={persona.boundaries} />
      </div>
    </section>
  );
}

const TRIGGER_LABEL: Record<PersonaRegenTrigger, string> = {
  first_run: '首次成卷',
  saga_arc: '落幕後重蒸',
  manual: '手動沉澱',
};

function RegenMeta({
  persona,
  regenChapter,
}: {
  persona: CharacterPersona;
  regenChapter: Chapter | null;
}) {
  const triggerText = persona.lastRegenTrigger
    ? TRIGGER_LABEL[persona.lastRegenTrigger]
    : null;

  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-2xs tracking-widest text-mute">
      <span>半永久</span>
      <span className="text-hairline">·</span>
      <span>v{persona.version}</span>
      {triggerText && regenChapter ? (
        <>
          <span className="text-hairline">·</span>
          <Link
            href={`/feed/chapter/${regenChapter.id}`}
            className="border-b border-dotted border-cinnabar/40 text-cinnabar/90 transition-colors hover:border-cinnabar hover:text-cinnabar"
          >
            {shortChapterTitle(regenChapter.title)}{triggerText}
          </Link>
        </>
      ) : triggerText ? (
        <>
          <span className="text-hairline">·</span>
          <span>{triggerText}</span>
        </>
      ) : null}
    </p>
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
