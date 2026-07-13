'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState, type KeyboardEvent } from 'react';
import type {
  ClaimRelation,
  ClaimReview,
  EpistemicMode,
  NarrativeClaim,
  NarrativeEvidence,
  NarrativePerspective,
  EpistemicProvenanceManifest,
} from '@endless-story/shared/types';
import type { RelatedDossier, StoryDossierEvent } from '@/lib/story-dossier/types';

const MODE_LABELS: Record<EpistemicMode, string> = {
  canonical: '正史',
  observed: '親見',
  heard: '轉述',
  inferred: '推論',
  remembered: '回憶',
  dreamed: '夢境',
  fabricated: '虛構',
};

const RELATION_LABELS: Record<ClaimRelation, string> = {
  supports: '與正史相符',
  contradicts: '與正史衝突',
  reinterprets: '重新詮釋',
  unresolved: '正史未涵蓋',
};

const REVIEW_LABELS: Record<ClaimReview, string> = {
  verified: '已錨定',
  contested: '有異說',
  unresolved: '未定',
};

const REVIEW_STYLES: Record<ClaimReview, string> = {
  verified: 'border-jade/50 bg-jade/10 text-jade',
  contested: 'border-cinnabar/45 bg-cinnabar/10 text-cinnabar',
  unresolved: 'border-hairline bg-surface text-mute',
};

export function EventDossier({
  event,
  manifest,
  related,
}: {
  event: StoryDossierEvent;
  manifest: EpistemicProvenanceManifest;
  related?: RelatedDossier;
}) {
  const [perspectiveId, setPerspectiveId] = useState(
    manifest.perspectives[0]?.id ?? '',
  );
  const perspective =
    manifest.perspectives.find((item) => item.id === perspectiveId) ??
    manifest.perspectives[0];
  const [selectedClaimId, setSelectedClaimId] = useState(
    perspective?.claims[0]?.id ?? '',
  );

  const selectedClaim = useMemo(() => {
    if (!perspective) return undefined;
    return (
      perspective.claims.find((claim) => claim.id === selectedClaimId) ??
      perspective.claims[0]
    );
  }, [perspective, selectedClaimId]);

  if (!perspective || !selectedClaim) return null;

  const selectPerspective = (nextId: string) => {
    const next = manifest.perspectives.find((item) => item.id === nextId);
    if (!next) return;
    setPerspectiveId(next.id);
    setSelectedClaimId(next.claims[0]?.id ?? '');
  };

  const cyclePerspective = () => {
    const index = manifest.perspectives.findIndex(
      (item) => item.id === perspective.id,
    );
    const next = manifest.perspectives[
      (index + 1) % manifest.perspectives.length
    ];
    if (next) selectPerspective(next.id);
  };

  const handleTabKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = manifest.perspectives.findIndex(
      (item) => item.id === perspective.id,
    );
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex =
      (current + offset + manifest.perspectives.length) %
      manifest.perspectives.length;
    const next = manifest.perspectives[nextIndex];
    if (!next) return;
    selectPerspective(next.id);
    document.getElementById(`perspective-tab-${next.id}`)?.focus();
  };

  return (
    <article className="min-h-[calc(100vh-var(--es-site-nav-h))] bg-[#f3eee4] text-[#261f1b] dark:bg-[#15120e] dark:text-[#f2e8d2]">
      <div className="grid min-h-[680px] lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)] xl:min-h-[calc(100vh-var(--es-site-nav-h)-142px)]">
        <EventHero event={event} />

        <section className="relative isolate overflow-hidden bg-[#f7f2e8] px-5 pb-9 pt-7 dark:bg-[#1c1812] sm:px-9 sm:pb-11 sm:pt-9 xl:px-12 xl:pt-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.075] mix-blend-multiply dark:opacity-[0.035]"
            style={{
              backgroundImage: 'url(/hero/saga-day.webp)',
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }}
          />

          <PerspectiveTabs
            perspectives={manifest.perspectives}
            selectedId={perspective.id}
            onSelect={selectPerspective}
            onKeyDown={handleTabKeys}
          />

          <div className="mt-8 grid gap-7 xl:grid-cols-[minmax(0,1fr)_220px] xl:gap-10">
            <div
              key={perspective.id}
              id={`perspective-panel-${perspective.id}`}
              role="tabpanel"
              aria-labelledby={`perspective-tab-${perspective.id}`}
              className="animate-ink-in"
            >
              <p className="text-2xs font-medium tracking-[0.26em] text-[#985143] dark:text-cinnabar">
                {perspective.role}
              </p>
              <h2 className="mt-2 font-serif text-[1.75rem] font-medium tracking-[0.16em] sm:text-[2rem]">
                {perspective.characterName}所見
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[#6d6259] dark:text-mute">
                {perspective.lead}
              </p>

              <div className="mt-7 max-w-2xl border-t border-[#cfc2b1]/70 pt-6 dark:border-hairline">
                {perspective.passages.map((passage) => (
                  <div key={passage.id} className="mb-5 last:mb-0">
                    <p className="text-justify font-serif text-[1.03rem] leading-[2.05] tracking-[0.025em] sm:text-lg">
                      {passage.text}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {passage.claimIds.map((claimId) => {
                        const claim = perspective.claims.find((item) => item.id === claimId);
                        if (!claim) return null;
                        return (
                          <ClaimMarker
                            key={claim.id}
                            claim={claim}
                            selected={selectedClaim.id === claim.id}
                            onClick={() => setSelectedClaimId(claim.id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-7 xl:hidden">
                <EvidenceCard claim={selectedClaim} evidence={manifest.evidence} />
              </div>
            </div>

            <aside className="hidden xl:block" aria-label="說法證據">
              <div className="sticky top-[calc(var(--es-site-nav-h)+2rem)]">
                <p className="mb-3 text-2xs tracking-[0.28em] text-[#8a7b6c] dark:text-mute">
                  這句話的根據
                </p>
                <EvidenceCard claim={selectedClaim} evidence={manifest.evidence} />
              </div>
            </aside>
          </div>
        </section>
      </div>

      <PerspectiveRail
        perspectives={manifest.perspectives}
        selectedId={perspective.id}
        onSelect={selectPerspective}
        onCycle={cyclePerspective}
        related={related}
      />
    </article>
  );
}

function EventHero({ event }: { event: StoryDossierEvent }) {
  return (
    <section className="relative min-h-[500px] overflow-hidden bg-[#241b18] sm:min-h-[600px] lg:sticky lg:top-[var(--es-site-nav-h)] lg:h-[calc(100vh-var(--es-site-nav-h))] lg:min-h-0 lg:self-start">
      <Image
        src={event.hero}
        alt={event.heroAlt}
        fill
        priority
        sizes="(min-width: 1024px) 48vw, 100vw"
        className={`object-cover transition-transform duration-700 ${
          event.heroZoom ? 'scale-[1.46] object-center' : 'object-[50%_55%]'
        }`}
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/12 to-black/5" />
      <div className="absolute inset-x-0 bottom-0 p-6 text-[#fff8e8] sm:p-9 lg:p-10 xl:p-12">
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-2xs tracking-[0.28em] text-[#e8d7bd]/85">
          <span>第 {event.day} 日</span>
          <span className="h-px w-7 bg-[#d5ad7c]/70" aria-hidden />
          <span>{event.scene}</span>
          <span>正史事件</span>
        </div>
        <h1 className="max-w-xl font-serif text-[2.35rem] font-medium leading-tight tracking-[0.13em] drop-shadow-lg sm:text-5xl xl:text-[3.45rem]">
          {event.title}
        </h1>
        <p className="mt-5 max-w-xl text-sm leading-7 text-[#f5ead8]/88 sm:text-base sm:leading-8">
          {event.summary}
        </p>
        <details className="group mt-6 max-w-xl border-t border-white/25 pt-4">
          <summary className="cursor-pointer list-none text-xs tracking-[0.2em] text-[#f2d9b5] transition hover:text-white">
            查看正史客觀層
          </summary>
          <ol className="mt-4 space-y-2 text-sm leading-7 text-[#f5ead8]/82">
            {event.canonFacts.map((fact, index) => (
              <li key={fact} className="grid grid-cols-[1.7rem_1fr] gap-1">
                <span className="text-[#d6a875]">{String(index + 1).padStart(2, '0')}</span>
                <span>{fact}</span>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </section>
  );
}

function PerspectiveTabs({
  perspectives,
  selectedId,
  onSelect,
  onKeyDown,
}: {
  perspectives: NarrativePerspective[];
  selectedId: string;
  onSelect: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="選擇角色視角"
      className="mx-auto grid max-w-xl grid-cols-3 border-b border-[#cfc2b1]/70 dark:border-hairline"
      style={{ gridTemplateColumns: `repeat(${perspectives.length}, minmax(0, 1fr))` }}
    >
      {perspectives.map((item) => {
        const selected = item.id === selectedId;
        return (
          <button
            key={item.id}
            id={`perspective-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`perspective-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(item.id)}
            onKeyDown={onKeyDown}
            className={`group relative flex min-w-0 flex-col items-center px-2 pb-5 text-center transition duration-300 ${
              selected ? 'text-[#7f3d32] dark:text-cinnabar' : 'text-[#75695e] hover:text-[#3b302a] dark:text-mute dark:hover:text-ink'
            }`}
          >
            <span
              className={`relative h-[4.5rem] w-[4.5rem] overflow-hidden rounded-full border bg-[#e6ddce] shadow-sm transition duration-300 sm:h-[5.25rem] sm:w-[5.25rem] ${
                selected
                  ? 'border-[#a55d4d] shadow-[0_7px_25px_rgba(110,61,45,0.16)] dark:border-cinnabar'
                  : 'border-[#c7b8a6] opacity-75 group-hover:opacity-100 dark:border-hairline'
              }`}
            >
              <Image
                src={item.portrait}
                alt={`${item.characterName}肖像`}
                fill
                sizes="84px"
                className="object-cover"
              />
            </span>
            <span className="mt-3 truncate font-serif text-sm tracking-[0.16em] sm:text-base">
              {item.characterName}
            </span>
            <span className="mt-1 hidden text-[0.62rem] tracking-[0.12em] opacity-70 sm:block">
              {item.role}
            </span>
            <span
              aria-hidden
              className={`absolute inset-x-5 -bottom-px h-[2px] bg-[#a04e40] transition-transform duration-300 dark:bg-cinnabar ${
                selected ? 'scale-x-100' : 'scale-x-0'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function ClaimMarker({
  claim,
  selected,
  onClick,
}: {
  claim: NarrativeClaim;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6rem] leading-5 tracking-[0.08em] transition sm:text-[0.64rem] ${
        selected
          ? 'border-[#9a4b3e] bg-[#9a4b3e] text-[#fffaf0] shadow-sm dark:border-cinnabar dark:bg-cinnabar dark:text-canvas'
          : 'border-[#c8b9a8] bg-[#fbf7ef]/70 text-[#735f52] hover:border-[#9a4b3e] hover:text-[#9a4b3e] dark:border-hairline dark:bg-surface/50 dark:text-mute dark:hover:border-cinnabar dark:hover:text-cinnabar'
      }`}
    >
      {MODE_LABELS[claim.epistemicMode]} · {REVIEW_LABELS[claim.review]}
    </button>
  );
}

function EvidenceCard({
  claim,
  evidence: allEvidence,
}: {
  claim: NarrativeClaim;
  evidence: NarrativeEvidence[];
}) {
  const evidence = claim.evidenceRefs.flatMap((ref) => {
    const item = allEvidence.find((candidate) => candidate.id === ref);
    return item ? [item] : [];
  });

  return (
    <div
      key={claim.id}
      className="animate-ink-in border-l-2 border-[#9a4b3e] bg-[#fffaf1]/75 p-5 shadow-[0_10px_35px_rgba(66,47,34,0.06)] dark:border-cinnabar dark:bg-elevated/45"
      aria-live="polite"
    >
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-[#c9b9a7] px-2.5 py-1 text-[0.62rem] tracking-[0.14em] text-[#715f51] dark:border-hairline dark:text-mute">
          {MODE_LABELS[claim.epistemicMode]}
        </span>
        <span className={`rounded-full border px-2.5 py-1 text-[0.62rem] tracking-[0.14em] ${REVIEW_STYLES[claim.review]}`}>
          {REVIEW_LABELS[claim.review]}
        </span>
      </div>
      <p className="mt-4 font-serif text-sm leading-7 text-[#3d332d] dark:text-ink">
        {claim.text}
      </p>
      <p className="mt-4 border-t border-[#d7cbbc]/70 pt-3 text-[0.68rem] tracking-[0.16em] text-[#9a4b3e] dark:border-hairline dark:text-cinnabar">
        {RELATION_LABELS[claim.relation]}
      </p>
      <ul className="mt-3 space-y-3">
        {evidence.map((item) => (
          <li key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium tracking-[0.12em] text-[#5c4b40] dark:text-ink/85">
                {item.label}
              </p>
              <span className="shrink-0 text-[0.58rem] tracking-[0.12em] text-[#9b8b7c] dark:text-mute">
                {item.visibility === 'public' ? '公開' : '角色私域'}
              </span>
            </div>
            <p className="mt-1 text-xs leading-6 text-[#786c62] dark:text-mute">
              {item.detail}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PerspectiveRail({
  perspectives,
  selectedId,
  onSelect,
  onCycle,
  related,
}: {
  perspectives: NarrativePerspective[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCycle: () => void;
  related?: RelatedDossier;
}) {
  return (
    <footer className="border-t border-[#c7b9a8] bg-[#eee6d8] px-5 py-5 dark:border-hairline dark:bg-[#17140f] sm:px-9 xl:px-12">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3 overflow-x-auto pb-1 lg:pb-0">
          <Link
            href="/feed?mode=episode"
            className="shrink-0 border-b-2 border-[#332a25] px-2 py-2 text-xs tracking-[0.18em] text-[#332a25] transition hover:text-[#9a4b3e] dark:border-ink dark:text-ink dark:hover:text-cinnabar"
          >
            正史事件
          </Link>
          {perspectives.map((item, index) => {
            const selected = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`shrink-0 border-b-2 px-2 py-2 text-xs tracking-[0.16em] transition ${
                  selected
                    ? 'border-[#9a4b3e] text-[#8c4337] dark:border-cinnabar dark:text-cinnabar'
                    : 'border-transparent text-[#837466] hover:text-[#4b3c32] dark:text-mute dark:hover:text-ink'
                }`}
              >
                {String(index + 1).padStart(2, '0')} · {item.characterName}
              </button>
            );
          })}
          {related ? (
            <Link
              href={related.href}
              className="ml-2 shrink-0 border-b-2 border-transparent px-2 py-2 text-xs tracking-[0.16em] text-[#8c4337] transition hover:border-[#9a4b3e] dark:text-cinnabar dark:hover:border-cinnabar"
            >
              另一齣 · {related.label}
            </Link>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onCycle}
          className="w-full rounded-none bg-[#8f463a] px-7 py-3.5 text-sm tracking-[0.2em] text-[#fffaf0] shadow-[0_9px_24px_rgba(102,50,40,0.18)] transition duration-200 hover:bg-[#74362e] active:translate-y-px dark:bg-cinnabar dark:text-canvas dark:hover:bg-seal lg:w-auto"
        >
          換下一個人的說法
        </button>
      </div>
    </footer>
  );
}
