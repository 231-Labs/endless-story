'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type {
  Chapter,
  Character,
  Saga,
  Scene,
  SceneGhostQuote,
  ScenePastEvent,
} from '@endless-story/shared';
import { characterPortraitTone } from '@/components/common/CharacterPortrait';
import { BlobImage } from '@/components/common/BlobImage';
import { shortChapterTitle } from '@/lib/format';
import type { SceneEventSummary } from '@/lib/actions/scene-detail';
import { PRIVACY_LABEL } from './troupeCanvasLayout';

/* ─────────── Header ─────────── */

export function CanvasHeader({
  worldTime,
  focusedScene,
  onBack,
}: {
  worldTime: Saga['worldTime'];
  focusedScene: Scene | null;
  onBack: () => void;
}) {
  if (focusedScene) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] w-fit touch-manipulation rounded-full border border-hairline/50 bg-surface/70 px-4 py-2.5 text-xs tracking-widest text-ink shadow-sm backdrop-blur-md transition-all hover:border-cinnabar/40 hover:text-cinnabar dark:bg-elevated/70 sm:py-2"
          >
            ← 返回全圖
          </button>
          <span className="hidden text-hairline sm:inline" aria-hidden>
            ·
          </span>
          <p className="text-xs tracking-widest text-mute/90 drop-shadow-sm">
            {PRIVACY_LABEL[focusedScene.privacyLevel]}
          </p>
        </div>
        <h2 className="w-full text-balance font-serif text-2xl tracking-wide text-ink drop-shadow-md sm:w-auto sm:max-w-[min(92vw,24rem)] sm:text-end sm:text-4xl lg:max-w-lg">
          {focusedScene.name}
        </h2>
      </div>
    );
  }
  return null;
}

export function SceneGhostQuotes({
  scene,
  charactersById,
  povId,
  onPovChange,
  liveQuotes = [],
}: {
  scene: Scene;
  charactersById: Map<string, Character>;
  povId: string | null;
  onPovChange: (id: string | null) => void;
  /** Live chain-derived lines (first-person line + card plays) — N3/§ live. */
  liveQuotes?: SceneGhostQuote[];
}) {
  const [ghostIndex, setGhostIndex] = useState(0);

  // Prefer live chain lines; fall back to the scene's static quotes.
  const ghostQuotes = liveQuotes.length > 0 ? liveQuotes : scene.ghostQuotes ?? [];
  const filteredGhosts: SceneGhostQuote[] = useMemo(() => {
    if (!povId) return ghostQuotes;
    return ghostQuotes.filter((g) => g.characterId === povId);
  }, [ghostQuotes, povId]);

  useEffect(() => {
    setGhostIndex(0);
  }, [povId, scene.id]);

  useEffect(() => {
    if (filteredGhosts.length <= 1) return;
    const id = window.setInterval(() => {
      setGhostIndex((i) => (i + 1) % filteredGhosts.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [filteredGhosts.length]);

  const currentGhost = filteredGhosts[ghostIndex] ?? null;
  const currentGhostChar = currentGhost ? charactersById.get(currentGhost.characterId) : null;

  const ghostCharacters = useMemo(() => {
    const seen = new Set<string>();
    const out: Character[] = [];
    for (const q of ghostQuotes) {
      if (seen.has(q.characterId)) continue;
      const c = charactersById.get(q.characterId);
      if (c) {
        seen.add(c.id);
        out.push(c);
      }
    }
    return out;
  }, [ghostQuotes, charactersById]);

  return (
    <div className="mx-auto max-w-3xl w-full">
      {currentGhost ? (
        <div key={currentGhost.text} className="animate-fade-in-up text-center">
          <div className="rounded-3xl border border-hairline/40 bg-surface/65 px-5 py-5 shadow-lg shadow-black/5 backdrop-blur-md dark:bg-elevated/55 dark:shadow-black/25 sm:px-8 sm:py-6">
            {currentGhostChar ? (
              <p className="text-2xs tracking-widest text-mute">
                <span className="text-cinnabar/90">{currentGhostChar.name}</span> 在此處留下
              </p>
            ) : null}
            <p className="mt-3 font-serif text-lg leading-relaxed text-ink sm:text-2xl sm:leading-relaxed">
              「{currentGhost.text}」
            </p>
          </div>
        </div>
      ) : (
        <p className="text-center font-serif italic text-mute">— 此處還未積累成文 —</p>
      )}

      <div className="mt-5 flex flex-col items-center gap-4">
        {filteredGhosts.length > 1 ? (
          <div className="flex justify-center gap-1.5">
            {filteredGhosts.map((_, i) => (
              <span
                key={i}
                aria-hidden
                className={`block h-1 rounded-full transition-all ${
                  i === ghostIndex ? 'w-7 bg-cinnabar/85' : 'w-1.5 bg-mute/45'
                }`}
              />
            ))}
          </div>
        ) : null}

        {ghostCharacters.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-hairline/40 bg-surface/60 px-3 py-2 backdrop-blur-md dark:bg-elevated/45">
            <span className="text-2xs tracking-widest text-mute">以視角看</span>
            <PovChip active={povId === null} onClick={() => onPovChange(null)} label="全部" />
            {ghostCharacters.map((char) => (
              <PovChip
                key={char.id}
                active={povId === char.id}
                onClick={() => onPovChange(char.id)}
                character={char}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PovChip({
  active,
  onClick,
  label,
  character,
}: {
  active: boolean;
  onClick: () => void;
  label?: string;
  character?: Character;
}) {
  if (character) {
    const tone = characterPortraitTone(character.role);
    const imageUrl = character.gallery?.anchor?.imageUrl;
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex h-7 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-2xs tracking-widest backdrop-blur-md transition-colors ${
          active
            ? 'bg-cinnabar/10 text-cinnabar ring-1 ring-cinnabar/40'
            : 'bg-elevated/70 text-mute hover:text-ink'
        }`}
      >
        <span
          className={`relative h-5 w-5 overflow-hidden rounded-full ring-1 ${tone.ring} ${tone.bg}`}
        >
          <span
            className={`absolute inset-0 flex items-center justify-center font-serif text-[9px] ${tone.text}`}
          >
            {character.name[0]}
          </span>
          {imageUrl ? (
            <BlobImage src={imageUrl} alt="" sizes="48px" className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
        </span>
        <span>{character.name}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-full px-3 text-2xs tracking-widest backdrop-blur-md transition-colors ${
        active
          ? 'bg-cinnabar/10 text-cinnabar ring-1 ring-cinnabar/40'
          : 'bg-elevated/70 text-mute hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

/* ─────────── Focused bottom three-column details ─────────── */

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px w-6 bg-cinnabar/40" />
      <h3 className="font-serif text-lg tracking-wide text-ink">{title}</h3>
    </div>
  );
}

export function FocusedSceneDetails({
  scene,
  chaptersById,
  events = [],
}: {
  scene: Scene;
  chaptersById: Map<string, Chapter>;
  /** On-chain BudgetEvents that happened in this scene (newest-first). */
  events?: SceneEventSummary[];
}) {
  const openEvents = events.filter((e) => e.status === 'open');
  const resolvedEvents = events.filter((e) => e.status === 'resolved');
  const hasLive = openEvents.length > 0;

  return (
    <div className="animate-fade-in-up mx-auto grid w-full max-w-4xl grid-cols-1 items-start gap-6 sm:grid-cols-2 sm:gap-8">
      {/* 氣 — scene base tone, heats up while a 戲 is open */}
      <section className="rounded-3xl border border-hairline/50 bg-surface/80 p-6 shadow-sm backdrop-blur-md dark:bg-elevated/80 sm:p-8">
        <PanelHeader title="氣" />
        <p className="mt-3 text-xs text-mute">場景基調；有戲開鑼時隨之翻湧。</p>
        {scene.heatProfile ? (
          <>
            <ul className="mt-6 space-y-4 text-sm">
              <HeatRow label="朱熱（內在衝突）" value={scene.heatProfile.cinnabar} color="bg-cinnabar" pulse={hasLive} />
              <HeatRow label="青觀（旁觀 / 師承）" value={scene.heatProfile.jade} color="bg-jade" />
              <HeatRow label="灰沉（事務 / 平靜）" value={scene.heatProfile.mute} color="bg-mute" />
            </ul>
            {hasLive ? (
              <p className="mt-6 flex items-center gap-2 rounded-full border border-cinnabar/40 bg-cinnabar/[0.06] px-3 py-1.5 text-2xs tracking-widest text-cinnabar">
                <span aria-hidden className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-cinnabar opacity-75" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-cinnabar" />
                </span>
                此刻 · 戲正酣，氣場翻湧
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-6 text-sm italic text-mute">尚未累積。</p>
        )}
      </section>

      {/* 過往 — live events up top, resolved collapsed */}
      <ScenePastPanel
        openEvents={openEvents}
        resolvedEvents={resolvedEvents}
        pastEvents={scene.pastEvents ?? []}
        chaptersById={chaptersById}
      />
    </div>
  );
}

/** Past-events panel — open events stay expanded; resolved ones collapse behind a toggle. */
function ScenePastPanel({
  openEvents,
  resolvedEvents,
  pastEvents,
  chaptersById,
}: {
  openEvents: SceneEventSummary[];
  resolvedEvents: SceneEventSummary[];
  pastEvents: ScenePastEvent[];
  chaptersById: Map<string, Chapter>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showAllOpen, setShowAllOpen] = useState(false);
  const COLLAPSED = 2;
  const OPEN_COLLAPSED = 3;
  const hasChainEvents = openEvents.length > 0 || resolvedEvents.length > 0;
  const visibleOpen = showAllOpen ? openEvents : openEvents.slice(0, OPEN_COLLAPSED);
  const hiddenOpen = openEvents.length - visibleOpen.length;
  const visibleResolved = showAll ? resolvedEvents : resolvedEvents.slice(0, COLLAPSED);
  const hidden = resolvedEvents.length - visibleResolved.length;

  return (
    <section className="rounded-3xl border border-hairline/50 bg-surface/80 p-6 shadow-sm backdrop-blur-md dark:bg-elevated/80 sm:p-8">
      <PanelHeader title="過往" />
      <p className="mt-3 text-xs text-mute">在此處發生過的事件。</p>
      {hasChainEvents ? (
        <div className="mt-6 space-y-6">
          {openEvents.length > 0 ? (
            <div className="space-y-3">
              <p className="text-2xs tracking-[0.3em] text-cinnabar/80">進行中</p>
              <ol className="space-y-4">
                {visibleOpen.map((ev) => (
                  <SceneEventRow key={ev.eventId} event={ev} />
                ))}
              </ol>
              {openEvents.length > OPEN_COLLAPSED ? (
                <button
                  type="button"
                  onClick={() => setShowAllOpen((v) => !v)}
                  className="text-2xs tracking-widest text-cinnabar/80 transition-colors hover:text-cinnabar"
                >
                  {showAllOpen ? '收合' : `展開另 ${hiddenOpen} 場進行中 ▾`}
                </button>
              ) : null}
            </div>
          ) : null}
          {resolvedEvents.length > 0 ? (
            <div className="space-y-3">
              {openEvents.length > 0 ? (
                <p className="text-2xs tracking-[0.3em] text-mute/55">已收尾</p>
              ) : null}
              <ol className="space-y-4">
                {visibleResolved.map((ev) => (
                  <SceneEventRow key={ev.eventId} event={ev} />
                ))}
              </ol>
              {resolvedEvents.length > COLLAPSED ? (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="text-2xs tracking-widest text-cinnabar/80 transition-colors hover:text-cinnabar"
                >
                  {showAll ? '收合' : `展開另 ${hidden} 場已收尾 ▾`}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : pastEvents.length === 0 ? (
        <p className="mt-6 text-sm italic text-mute">尚無事件紀錄。</p>
      ) : (
        <ol className="mt-6 space-y-4">
          {pastEvents.map((ev) => (
            <PastEventRow
              key={ev.chapterId}
              event={ev}
              chapter={chaptersById.get(ev.chapterId) ?? null}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function SceneEventRow({ event }: { event: SceneEventSummary }) {
  return (
    <li className="border-l-2 border-hairline/60 pl-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-serif text-sm text-ink">《{event.title}》</span>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-2xs tracking-widest ${
            event.status === 'open'
              ? 'bg-cinnabar/15 text-cinnabar'
              : 'bg-jade/15 text-jade'
          }`}
        >
          {event.status === 'open' ? `進行中 ${event.actedCount}/${event.total}` : '已收尾'}
        </span>
      </div>
      {event.summary ? (
        <p className="mt-1 text-xs leading-relaxed text-mute">{event.summary}</p>
      ) : null}
      {event.plays.length > 0 ? (
        <p className="mt-1.5 text-2xs tracking-widest text-mute/80">
          {event.plays.map((p) => p.label).join(' · ')}
        </p>
      ) : null}
    </li>
  );
}

function HeatRow({
  label,
  value,
  color,
  pulse = false,
}: {
  label: string;
  value: number;
  color: string;
  pulse?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink/85">{label}</span>
        <span className="font-mono text-xs tabular-nums text-mute">{pct}</span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-hairline/50">
        <div className={`h-full ${color} ${pulse ? 'animate-pulse' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function PastEventRow({
  event,
  chapter,
}: {
  event: ScenePastEvent;
  chapter: Chapter | null;
}) {
  const title = chapter ? shortChapterTitle(chapter.title) : event.brief;
  return (
    <li>
      <div className="flex items-baseline gap-2 text-2xs tracking-widest text-mute">
        <span>Day {event.day}</span>
        {chapter ? (
          <>
            <span className="text-hairline">·</span>
            <Link
              href={`/feed/chapter/${chapter.id}`}
              className="border-b border-dotted border-cinnabar/40 text-cinnabar/90 transition-colors hover:border-cinnabar hover:text-cinnabar"
            >
              {title}
            </Link>
          </>
        ) : null}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-ink/80">{event.brief}</p>
    </li>
  );
}

