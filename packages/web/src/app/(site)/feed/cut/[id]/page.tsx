import Link from 'next/link';
import { Suspense } from 'react';
import { chaptersApi, charactersApi, cutsApi } from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { Markdown } from '@/components/common/Markdown';
import { txUrl, objectUrl } from '@/lib/explorer';

/**
 * 章回（事件合本）閱讀頁 — the canonical "回".
 *
 * IA (docs/CONTENT_PIPELINE.md §2/§8.1): the event is the spine. This page IS
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

          <div className="flex flex-wrap items-center gap-3 text-xs tracking-widest text-mute/80">
            {cut.day != null ? (
              <span className="rounded border border-hairline/50 bg-canvas/50 px-2.5 py-1">
                DAY {cut.day}
              </span>
            ) : null}
            {cut.sceneName ? <span>{cut.sceneName}</span> : null}
            <span className="text-cinnabar font-medium">{cut.povCharacterIds.length} 視角合本</span>
          </div>

          <div className="mt-6 rounded-2xl border border-cinnabar/25 bg-cinnabar/[0.04] px-5 py-4">
            <div className="text-2xs uppercase tracking-[0.25em] text-cinnabar/70">
              章回 · 事件合本 — 已證實發生
            </div>
            {cut.eventLabel ? (
              <p className="mt-2 text-sm leading-relaxed text-ink">
                本回織自鏈上事件「{cut.eventLabel}」
                {cut.sceneName ? ` · ${cut.sceneName}` : ''}
                {cut.day != null ? ` · 第 ${cut.day} 日` : ''}。
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-2xs tracking-widest">
              {cut.eventTx ? (
                <a
                  href={txUrl(cut.eventTx)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cinnabar hover:underline"
                >
                  在區塊鏈瀏覽器查驗此事件 ↗
                </a>
              ) : null}
              <a
                href={objectUrl(cut.commitmentId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-mute hover:text-ink hover:underline"
              >
                此回上鏈承諾 ↗
              </a>
            </div>
          </div>

          <Markdown
            source={cut.body}
            className="chapter-prose mt-10 text-lg leading-loose text-ink/85 sm:text-xl sm:leading-[2.2]"
          />

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
 * The cut's raw materials: each woven character, linking to their POV chapter
 * for THIS event when one is committed (matched by eventTx provenance), else
 * to their dossier chapter tab.
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
  const [characters, sagaChapters] = await Promise.all([
    charactersApi.listSagaCharacters(sagaId).catch(() => []),
    eventTx ? chaptersApi.listChapters(sagaId).catch(() => []) : Promise.resolve([]),
  ]);
  const charactersById = new Map(characters.map((c) => [c.id, c]));
  return (
    <footer className="mt-14 border-t border-hairline/50 pt-8">
      <p className="text-2xs uppercase tracking-[0.25em] text-mute">
        本回視角 · 各角色的第一人稱原料
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {povCharacterIds.map((cid) => {
          const character = charactersById.get(cid);
          const povChapter = eventTx
            ? sagaChapters.find(
                (c) => c.povCharacterId === cid && c.provenance?.eventTx === eventTx,
              )
            : undefined;
          const label = character?.name ?? `${cid.slice(0, 8)}…`;
          return (
            <Link
              key={cid}
              href={
                povChapter
                  ? `/feed/chapter/${povChapter.id}`
                  : { pathname: '/dossier', query: { id: cid, tab: 'chapters' } }
              }
              className="rounded-full border border-hairline/60 bg-surface/40 px-4 py-2 text-sm tracking-widest text-ink transition-colors hover:border-cinnabar/40 hover:text-cinnabar"
            >
              {label} 的視角 →
            </Link>
          );
        })}
      </div>
      <p className="mt-3 text-2xs leading-relaxed tracking-widest text-mute/70">
        視角原料是角色親筆的單人版本 — 訂閱該角色或持有 NFT 才能讀全文。
      </p>
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
