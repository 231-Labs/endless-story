'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Character, SoulSong, SoulSongMood } from '@endless-story/shared';
import { Linkified } from '@/components/common/CharacterLinkifier';
import { formatDate } from '@/lib/format';

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = (cid: string) => `endless-story:soul-song:${cid}`;

const MOOD_LABEL: Record<SoulSongMood, string> = {
  longing: '念',
  remembering: '憶',
  restless: '躁',
  reconciled: '化',
  sorrow: '哀',
  defiant: '倔',
};

interface PersistedState {
  revealedIds: string[];
  lastSummonAt: string | null;
}

function loadState(cid: string): PersistedState {
  if (typeof window === 'undefined') return { revealedIds: [], lastSummonAt: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(cid));
    if (!raw) return { revealedIds: [], lastSummonAt: null };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      revealedIds: Array.isArray(parsed.revealedIds) ? parsed.revealedIds : [],
      lastSummonAt: typeof parsed.lastSummonAt === 'string' ? parsed.lastSummonAt : null,
    };
  } catch {
    return { revealedIds: [], lastSummonAt: null };
  }
}

function saveState(cid: string, state: PersistedState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY(cid), JSON.stringify(state));
  } catch {
    // ignore quota / privacy mode
  }
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} 日 ${hours} 時`;
  if (hours > 0) return `${hours} 時 ${minutes} 分`;
  return `${minutes} 分`;
}

export function SoulSongPanel({
  characterId,
  characterName,
  songs,
  isOwner,
  sagaCharacters,
}: {
  characterId: string;
  characterName: string;
  songs: SoulSong[];
  isOwner: boolean;
  sagaCharacters: Character[];
}) {
  const orderedPool = useMemo(
    () => [...songs].sort((a, b) => a.composedAt.localeCompare(b.composedAt)),
    [songs]
  );
  const initialIds = useMemo(
    () => orderedPool.filter((s) => s.initiallyRevealed).map((s) => s.id),
    [orderedPool]
  );

  const [hydrated, setHydrated] = useState(false);
  const [revealedIds, setRevealedIds] = useState<string[]>(initialIds);
  const [lastSummonAt, setLastSummonAt] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [justSummonedId, setJustSummonedId] = useState<string | null>(null);

  useEffect(() => {
    const persisted = loadState(characterId);
    const merged = Array.from(new Set([...initialIds, ...persisted.revealedIds]));
    setRevealedIds(merged);
    setLastSummonAt(persisted.lastSummonAt);
    setHydrated(true);
  }, [characterId, initialIds]);

  useEffect(() => {
    if (!hydrated) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [hydrated]);

  const revealedSet = useMemo(() => new Set(revealedIds), [revealedIds]);
  const revealedSongs = useMemo(
    () =>
      orderedPool
        .filter((s) => revealedSet.has(s.id))
        .sort((a, b) => b.composedAt.localeCompare(a.composedAt)),
    [orderedPool, revealedSet]
  );
  const nextSong = useMemo(
    () => orderedPool.find((s) => !revealedSet.has(s.id)),
    [orderedPool, revealedSet]
  );

  const cooldownRemaining = lastSummonAt
    ? Math.max(0, new Date(lastSummonAt).getTime() + COOLDOWN_MS - now)
    : 0;
  const cooldownActive = hydrated && cooldownRemaining > 0;
  const canSummon = hydrated && isOwner && !!nextSong && !cooldownActive;

  const summon = () => {
    if (!canSummon || !nextSong) return;
    const nowIso = new Date().toISOString();
    const nextRevealed = [...revealedIds, nextSong.id];
    setRevealedIds(nextRevealed);
    setLastSummonAt(nowIso);
    setNow(Date.now());
    setJustSummonedId(nextSong.id);
    saveState(characterId, { revealedIds: nextRevealed, lastSummonAt: nowIso });
    window.setTimeout(() => setJustSummonedId(null), 1800);
  };

  if (orderedPool.length === 0) return null;

  return (
    <section className="space-y-8">
      <header className="flex items-center gap-4">
        <div className="h-px w-8 bg-cinnabar/40" />
        <h2 className="font-serif text-2xl tracking-wide text-ink">心曲</h2>
        <p className="text-xs tracking-widest text-mute/70 hidden sm:block">
          {isOwner ? '七日內僅能請唱一段' : '唱過的幾段'}
        </p>
      </header>
      <p className="text-xs tracking-widest text-mute/70 pl-12 sm:hidden">
        {isOwner ? '七日內僅能請唱一段' : '唱過的幾段'}
      </p>

      <div className="pl-0 sm:pl-12 space-y-6">
        {isOwner ? (
          <SummonControl
            characterName={characterName}
            hydrated={hydrated}
            hasNext={!!nextSong}
            cooldownActive={cooldownActive}
            cooldownRemaining={cooldownRemaining}
            onSummon={summon}
          />
        ) : null}

        {revealedSongs.length > 0 ? (
          <ol className="space-y-6">
            {revealedSongs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                highlight={song.id === justSummonedId}
                characters={sagaCharacters}
                skipId={characterId}
              />
            ))}
          </ol>
        ) : (
          <div className="rounded-3xl bg-surface/40 border border-hairline/50 p-12 text-center backdrop-blur-sm">
            <p className="text-sm text-mute tracking-wide">還未為人唱過。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function SummonControl({
  characterName,
  hydrated,
  hasNext,
  cooldownActive,
  cooldownRemaining,
  onSummon,
}: {
  characterName: string;
  hydrated: boolean;
  hasNext: boolean;
  cooldownActive: boolean;
  cooldownRemaining: number;
  onSummon: () => void;
}) {
  if (!hydrated) {
    return (
      <div className="rounded-3xl bg-surface/40 border border-hairline/50 h-[68px] p-4 sm:h-[72px] sm:p-5 backdrop-blur-sm" aria-hidden />
    );
  }

  if (!hasNext) {
    return (
      <div className="rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 text-sm text-mute backdrop-blur-sm text-center">
        心底已攤完，靜下了。再有新的心曲，得等下一場戲落幕。
      </div>
    );
  }

  if (cooldownActive) {
    return (
      <div className="rounded-3xl bg-surface/40 border border-hairline/50 flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8 backdrop-blur-sm">
        <div className="space-y-2">
          <p className="text-base text-ink/80 tracking-wide">下一段心曲還在醞釀。</p>
          <p className="text-xs tracking-widest text-mute">
            約還剩 {formatRemaining(cooldownRemaining)}
          </p>
        </div>
        <button
          type="button"
          disabled
          className="rounded-full border border-hairline/50 px-6 py-2.5 text-sm tracking-wide text-mute/50 bg-canvas/30"
        >
          請唱一段
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-surface/40 border border-hairline/50 flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8 backdrop-blur-sm">
      <p className="text-base leading-relaxed text-ink/85 tracking-wide">
        {characterName}今夜願意再開口。要請唱一段心曲嗎？
      </p>
      <button
        type="button"
        onClick={onSummon}
        className="rounded-full bg-cinnabar px-6 py-2.5 text-sm tracking-wide text-canvas shadow-sm shadow-cinnabar/20 transition-all hover:bg-seal hover:shadow-md hover:-translate-y-0.5"
      >
        請唱一段
      </button>
    </div>
  );
}

function SongCard({
  song,
  highlight,
  characters,
  skipId,
}: {
  song: SoulSong;
  highlight: boolean;
  characters: Character[];
  skipId: string;
}) {
  const [mounted, setMounted] = useState(!highlight);

  useEffect(() => {
    if (!highlight) return;
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, [highlight]);

  return (
    <li
      className={`rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm transition-all duration-500 ease-out hover:bg-surface hover:shadow-sm ${
        mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      } ${
        highlight
          ? 'ring-1 ring-cinnabar/30 shadow-[0_0_24px_-12px_rgba(176,74,60,0.35)]'
          : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs tracking-widest text-mute/80">
        <span className="bg-canvas/50 px-2.5 py-1 rounded border border-hairline/50">{formatDate(song.composedAt)}</span>
        <span className="flex items-center gap-3">
          {song.setting ? <span className="text-mute/70 italic">{song.setting}</span> : null}
          {song.mood ? (
            <span className="rounded-full border border-hairline/60 bg-canvas/40 px-3 py-1 font-serif text-[11px] leading-none text-ink/70">
              {MOOD_LABEL[song.mood]}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-6 space-y-5">
        {song.verses.map((verse, i) => (
          <p
            key={i}
            className="font-serif text-lg leading-loose tracking-wide text-ink/85 sm:text-xl"
          >
            <Linkified text={verse} characters={characters} skipId={skipId} />
          </p>
        ))}
      </div>
    </li>
  );
}
