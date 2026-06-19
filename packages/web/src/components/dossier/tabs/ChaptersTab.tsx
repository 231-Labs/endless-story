import type { Chapter, Character } from '@endless-story/shared';
import Link from 'next/link';
import { truncateBlobId } from '@/lib/format';
import type { PovChapterEntry } from '@/lib/chain/pov-read';
import type { EventCutEntry } from '@/lib/api/cuts';
import { ChainPovSection } from './ChainPovSection';
import { CHAPTER_COPY } from '@/lib/copy/chapters';

export function ChaptersTab({
  chapters,
  character,
  chainPovChapters = [],
  participatedCuts = [],
}: {
  /** Legacy/mock chapters — only rendered when there are no on-chain cuts. */
  chapters: Chapter[];
  character: Character;
  /**
   * On-chain POV chapters anchored via `commitment.move` — the character's
   * own first-person raw material (owner/subscriber gated below).
   */
  chainPovChapters?: PovChapterEntry[];
  /**
   * Event cuts this character was woven into — the canonical public "回"
   * (docs/CONTENT_PIPELINE.md §8.2). Metadata-only cards; the prose lives
   * on /feed/cut/[id].
   */
  participatedCuts?: EventCutEntry[];
}) {
  const hasAny =
    chapters.length > 0 || chainPovChapters.length > 0 || participatedCuts.length > 0;
  if (!hasAny) {
    return (
      <div className="py-12 text-center text-mute">
        還沒出場到任何已公開的章回。
      </div>
    );
  }

  // IA (docs/CONTENT_PIPELINE.md §8.2), two-book model: a character's own
  // first-person book (角色回 / ChainPovSection) is her primary text, so it
  // leads. Below it sit the public multi-POV woven 回 she appears in (梨園回 /
  // CutSection) — the ensemble cuts where she's one of several angles.
  return (
    <div className="space-y-12">
      {chainPovChapters.length > 0 ? (
        <ChainPovSection chapters={chainPovChapters} character={character} />
      ) : null}
      {participatedCuts.length > 0 ? (
        <CutSection character={character} cuts={participatedCuts} />
      ) : chapters.length > 0 ? (
        <Section title={CHAPTER_COPY.cut.sectionHeader(character.name)} chapters={chapters} />
      ) : null}
    </div>
  );
}

/** 梨園回 — the woven event cuts this character appears in (public ensemble). */
function CutSection({ character, cuts }: { character: Character; cuts: EventCutEntry[] }) {
  return (
    <section className="mx-auto max-w-3xl">
      <div className="flex items-center gap-4">
        <div className="h-px w-8 bg-cinnabar/40" />
        <h2 className="font-serif text-2xl tracking-wide text-ink">
          {CHAPTER_COPY.cut.sectionHeader(character.name)}
        </h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-mute/80">
        {CHAPTER_COPY.cut.sectionNote(character.name)}
      </p>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:gap-6">
        {cuts.map((cut) => (
          <li key={cut.commitmentId}>
            <Link
              href={`/feed/cut/${cut.commitmentId}`}
              className="group block es-card p-6 sm:p-8 transition-all duration-300 hover:bg-surface hover:border-cinnabar/30 hover:shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3 text-xs tracking-widest text-mute/80">
                {cut.day != null ? (
                  <span className="bg-canvas/50 px-2 py-1 rounded border border-hairline/50">
                    DAY {cut.day}
                  </span>
                ) : null}
                {cut.sceneName ? <span>{cut.sceneName}</span> : null}
                <span className="text-cinnabar/80">{CHAPTER_COPY.cut.povCount(cut.povCharacterIds.length)}</span>
              </div>
              <h3 className="mt-3 font-serif text-xl tracking-wide text-ink transition-colors group-hover:text-cinnabar sm:text-2xl">
                {cut.eventLabel ? `「${cut.eventLabel}」` : `第 ${cut.day ?? '—'} 日的一回`}
              </h3>
              <p className="mt-2 text-sm tracking-widest text-cinnabar">{CHAPTER_COPY.cut.readThisCut}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Section({
  title,
  chapters,
  highlight,
}: {
  title: string;
  chapters: Chapter[];
  highlight?: boolean;
}) {
  return (
    <section className="mx-auto max-w-3xl">
      <div className="flex items-center gap-4">
        <div className={`h-px w-8 ${highlight ? 'bg-cinnabar' : 'bg-cinnabar/40'}`} />
        <h2 className={`font-serif text-2xl tracking-wide ${highlight ? 'text-cinnabar' : 'text-ink'}`}>
          {title}
        </h2>
      </div>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:gap-6">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <Link
              href={`/feed/chapter/${chapter.id}`}
              className="group block es-card p-6 sm:p-8 transition-all duration-300 hover:bg-surface hover:border-cinnabar/30 hover:shadow-sm"
            >
              <ChapterRow chapter={chapter} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChapterRow({ chapter }: { chapter: Chapter }) {
  return (
    <article className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs tracking-widest text-mute/80">
        <span className="bg-canvas/50 px-2 py-1 rounded border border-hairline/50">DAY {chapter.day}</span>
        <span className="font-mono text-2xs">walrus · {truncateBlobId(chapter.walrusBlobId)}</span>
      </div>
      <h3 className="mt-2 font-serif text-xl tracking-wide text-ink transition-colors group-hover:text-cinnabar sm:text-2xl">
        {chapter.title}
      </h3>
      <p className="mt-1 line-clamp-3 max-w-prose text-base leading-loose text-ink/70 transition-colors group-hover:text-ink/90">
        {chapter.body}
      </p>
    </article>
  );
}
