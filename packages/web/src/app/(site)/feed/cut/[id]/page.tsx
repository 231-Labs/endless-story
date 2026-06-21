import Link from 'next/link';
import { Suspense } from 'react';
import { chaptersApi, charactersApi, cutsApi } from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { Markdown } from '@/components/common/Markdown';
import { eventUrl, objectUrl } from '@/lib/explorer';
import { CHAPTER_COPY } from '@/lib/copy/chapters';

/**
 * 章回（事件合本）閱讀頁 — the canonical "回".
 *
 * IA (docs/narrative/CONTENT_PIPELINE.md §2/§8.1): the event is the spine. This page IS
 * the event's reading surface: the woven multi-POV prose + the verifiable
 * on-chain event + links DOWN to each character's POV raw material. Single
 * POVs link back UP here ("讀本事件的合本").
 *
 * Perf: the prose renders from two immutable cached reads (commitment + blob);
 * the per-character POV links need a saga-wide scan, so they stream in below
 * the fold via Suspense instead of blocking the text.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cut = await cutsApi.getEventCut(id).catch(() => null);
  if (!cut) return { title: '找不到章回' };
  const title = firstHeading(cut.body) ?? cut.eventLabel ?? `第 ${cut.day ?? '—'} 日`;
  return {
    title,
    description: cut.body.replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim().slice(0, 120),
  };
}

export default async function CutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cut = await cutsApi.getEventCut(id);

  if (!cut) {
    return (
      <main className="min-h-screen">
        <SiteNav />
        <section className="flex flex-col items-center px-5 py-24 text-center sm:px-10">
          <p className="font-serif text-xl tracking-[0.2em] text-ink">找不到這一回</p>
          <p className="mt-3 text-sm text-mute">可能還沒織成，或網址抄錯了一個字。</p>
          <Link href="/feed?mode=chapter" className="mt-8 es-button-ghost">
            回梨園章回
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="px-5 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/feed?mode=chapter"
            aria-label="回梨園章回"
            className="es-icon-button mb-6 h-8 w-8"
          >
            <span aria-hidden className="text-base">←</span>
          </Link>

          {/* Clean opening: eyebrow + a one-line source note, then the prose
              (the body's own markdown heading is the title). The verifiable
              on-chain links sit in the footer below the read. */}
          <div className="flex flex-wrap items-center gap-3 text-xs tracking-widest text-mute/80">
            {cut.day != null ? (
              <span className="rounded border border-hairline/50 bg-canvas/50 px-2.5 py-1">
                DAY {cut.day}
              </span>
            ) : null}
            {cut.sceneName ? <span>{cut.sceneName}</span> : null}
            <span className="text-cinnabar font-medium">{CHAPTER_COPY.cut.povCount(cut.povCharacterIds.length)}</span>
          </div>

          {cut.eventLabel ? (
            <p className="mt-5 text-sm leading-relaxed text-mute">
              {CHAPTER_COPY.cut.fromEvent(cut.eventLabel)}
              {cut.sceneName ? ` · ${cut.sceneName}` : ''}
              {cut.day != null ? ` · 第 ${cut.day} 日` : ''}。
            </p>
          ) : null}

          <Markdown
            source={cut.body}
            className="chapter-prose mt-8 text-lg leading-loose text-ink/85 sm:text-xl sm:leading-[2.2]"
          />

          {/* 鏈上查驗 footer line — moved out of the opening. */}
          <div className="mt-14 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline/50 pt-6 text-2xs tracking-widest text-mute/70">
            <span className="text-mute/80">{CHAPTER_COPY.provenance.footerLead}</span>
            {cut.eventTx ? (
              <a
                href={eventUrl(cut.eventTx)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-cinnabar"
              >
                {CHAPTER_COPY.provenance.verifyEvent}
              </a>
            ) : null}
            <a
              href={objectUrl(cut.commitmentId)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-cinnabar"
            >
              {CHAPTER_COPY.provenance.cutCommitment}
            </a>
          </div>

          {/* 事件 → 各角色視角原料：needs a saga scan, so it streams in. */}
          <Suspense fallback={<PovLinksSkeleton />}>
            <PovLinks
              sagaId={cut.sagaId}
              eventTx={cut.eventTx}
              povCharacterIds={cut.povCharacterIds}
            />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

/**
 * The same event, angle by angle: each character woven into this cut, deep-linked
 * to THEIR POV chapter for THIS event (matched by `provenance.eventTx`, scanned
 * per character so an old cut's angles stay reachable). A character whose POV
 * isn't reachable yet shows as a muted, non-link chip — never a jump into their
 * whole catalogue, which read as "which one is this?" noise.
 */
async function PovLinks({
  sagaId,
  eventTx,
  povCharacterIds,
}: {
  sagaId: string;
  eventTx?: string;
  povCharacterIds: string[];
}) {
  if (povCharacterIds.length === 0) return null;
  const [characters, eventChapters] = await Promise.all([
    charactersApi.listSagaCharacters(sagaId).catch(() => []),
    eventTx
      ? chaptersApi.listEventPovChapters(sagaId, eventTx, povCharacterIds).catch(() => [])
      : Promise.resolve([]),
  ]);
  const charactersById = new Map(characters.map((c) => [c.id, c]));
  const chapterByChar = new Map(
    eventChapters.flatMap((c) => (c.povCharacterId ? [[c.povCharacterId, c] as const] : [])),
  );
  return (
    <footer className="mt-10 border-t border-hairline/50 pt-8">
      <div className="flex flex-wrap gap-3">
        {povCharacterIds.map((cid) => {
          const character = charactersById.get(cid);
          const povChapter = chapterByChar.get(cid);
          const label = character?.name ?? `${cid.slice(0, 8)}…`;
          if (povChapter) {
            return (
              <Link
                key={cid}
                href={`/feed/chapter/${povChapter.id}`}
                className="rounded-full border border-hairline/60 bg-surface/40 px-4 py-2 text-sm tracking-widest text-ink transition-colors hover:border-cinnabar/40 hover:text-cinnabar"
              >
                {CHAPTER_COPY.crossLink.followPov(label)}
              </Link>
            );
          }
          return (
            <span
              key={cid}
              title={CHAPTER_COPY.crossLink.povUnlinkedHint}
              className="inline-flex items-center gap-2 rounded-full border border-dashed border-hairline/50 px-4 py-2 text-sm tracking-widest text-mute/60"
            >
              {label}
              <span className="text-2xs tracking-wider text-mute/50">
                {CHAPTER_COPY.crossLink.povUnlinked}
              </span>
            </span>
          );
        })}
      </div>
    </footer>
  );
}

function PovLinksSkeleton() {
  return (
    <footer className="mt-14 border-t border-hairline/50 pt-8" aria-hidden>
      <div className="h-3 w-48 animate-pulse rounded bg-hairline/50" />
      <div className="mt-4 flex gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-hairline/40" />
        ))}
      </div>
    </footer>
  );
}

function firstHeading(body: string): string | null {
  const m = body.match(/^#{1,3}\s+(.+)$/m);
  return m ? m[1].trim() : null;
}
