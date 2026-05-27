import type { Chapter, Character } from '@endless-story/shared';
import Link from 'next/link';
import { truncateBlobId } from '@/lib/format';
import { objectUrl } from '@/lib/explorer';
import type { PovChapterEntry } from '@/lib/chain/pov-read';

export function ChaptersTab({
  chapters,
  character,
  chainPovChapters = [],
}: {
  chapters: Chapter[];
  character: Character;
  /**
   * On-chain POV chapters anchored via `commitment.move`. Rendered as
   * the topmost section ("鏈上 POV") above the legacy mock sections.
   * When runner R3+ wires the gazette + memory tier, this becomes the
   * primary surface and mock sections get retired.
   */
  chainPovChapters?: PovChapterEntry[];
}) {
  const hasAny = chapters.length > 0 || chainPovChapters.length > 0;
  if (!hasAny) {
    return (
      <div className="py-12 text-center text-mute">
        她還沒出場到任何已公開的章回。
      </div>
    );
  }

  const povChapters = chapters.filter((c) => c.povCharacterId === character.id);
  const involvedChapters = chapters.filter((c) => c.povCharacterId !== character.id);

  return (
    <div className="space-y-12">
      {chainPovChapters.length > 0 ? (
        <ChainPovSection chapters={chainPovChapters} character={character} />
      ) : null}
      {povChapters.length > 0 ? (
        <Section title={`${character.name} 視角`} chapters={povChapters} highlight />
      ) : null}
      {involvedChapters.length > 0 ? (
        <Section title="同場群像" chapters={involvedChapters} />
      ) : null}
    </div>
  );
}

function ChainPovSection({
  chapters,
  character,
}: {
  chapters: PovChapterEntry[];
  character: Character;
}) {
  return (
    <section>
      <div className="flex items-center gap-4">
        <div className="h-px w-8 bg-cinnabar" />
        <h2 className="font-serif text-2xl tracking-wide text-cinnabar">
          {character.name} 視角 · 鏈上 POV
        </h2>
      </div>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:gap-6 pl-0 sm:pl-12">
        {chapters.map((c) => (
          <li key={c.commitmentId}>
            <div className="block rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm">
              <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest text-mute/80">
                <span className="rounded border border-hairline/50 bg-canvas/50 px-2 py-1 font-mono">
                  walrus · {truncateBlobId(c.blobId)}
                </span>
                <a
                  href={objectUrl(c.commitmentId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-cinnabar"
                  title="在區塊鏈瀏覽器查看 commitment"
                >
                  on-chain anchor ↗
                </a>
                <a
                  href={c.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-cinnabar"
                  title="在 Walrus 直接讀原文"
                >
                  walrus blob ↗
                </a>
              </div>
              <ChainPovBody blobId={c.blobId} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ChainPovBody({ blobId }: { blobId: string }) {
  // Server-side fetch from Walrus aggregator DIRECTLY (not via our
  // /api/blob proxy — Node's fetch needs an absolute URL, and there's
  // no charset issue server-side since we'll decode as UTF-8 via
  // .text() regardless of the missing Content-Type header). The proxy
  // only matters for browser-facing <a href> links where the missing
  // header makes Chrome render as latin-1 → 亂碼.
  const aggregatorUrl = `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`;
  let body: string;
  try {
    const res = await fetch(aggregatorUrl, { cache: 'no-store' });
    body = res.ok ? await res.text() : '— 無法讀取章回內容（Walrus 暫時不通） —';
  } catch {
    body = '— 無法讀取章回內容 —';
  }
  return (
    <p className="mt-4 max-w-prose whitespace-pre-wrap font-serif text-base leading-loose text-ink/85 sm:text-lg">
      {body}
    </p>
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
    <section>
      <div className="flex items-center gap-4">
        <div className={`h-px w-8 ${highlight ? 'bg-cinnabar' : 'bg-cinnabar/40'}`} />
        <h2 className={`font-serif text-2xl tracking-wide ${highlight ? 'text-cinnabar' : 'text-ink'}`}>
          {title}
        </h2>
      </div>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:gap-6 pl-0 sm:pl-12">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <Link
              href={`/feed/chapter/${chapter.id}`}
              className="group block rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm transition-all duration-300 hover:bg-surface hover:border-cinnabar/30 hover:shadow-sm"
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
