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
    <section className="space-y-5">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xs tracking-widest text-mute">心曲</h3>
        <p className="text-2xs tracking-widest text-mute/80">
          {isOwner ? '七日內僅能請她唱一段' : '她唱過的幾段'}
        </p>
      </header>

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
        <p className="text-sm text-mute">她還未為人唱過。</p>
      )}
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
      <div className="es-soft-panel h-[68px] p-4 sm:h-[72px] sm:p-5" aria-hidden />
    );
  }

  if (!hasNext) {
    return (
      <div className="es-soft-panel p-4 text-sm text-mute sm:p-5">
        她已將心底攤完，靜下了。再有新的心曲，得等下一場戲落幕。
      </div>
    );
  }

  if (cooldownActive) {
    return (
      <div className="es-soft-panel flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div className="space-y-1">
          <p className="text-sm text-ink/80">下一段心曲還在醞釀。</p>
          <p className="text-2xs tracking-widest text-mute">
            約還剩 {formatRemaining(cooldownRemaining)}
          </p>
        </div>
        <button
          type="button"
          disabled
          className="rounded border border-hairline px-4 py-2 text-sm text-mute"
        >
          請她唱一段
        </button>
      </div>
    );
  }

  return (
    <div className="es-soft-panel flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
      <p className="text-sm leading-relaxed text-ink/80">
        {characterName}今夜願意再開口。要請她唱一段嗎？
      </p>
      <button
        type="button"
        onClick={onSummon}
        className="rounded bg-cinnabar px-4 py-2 text-sm text-canvas transition-colors hover:bg-seal"
      >
        請她唱一段
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
      className={`es-soft-panel p-5 transition-all duration-500 ease-out sm:p-6 ${
        mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      } ${
        highlight
          ? 'ring-1 ring-cinnabar/30 shadow-[0_0_24px_-12px_rgba(176,74,60,0.35)]'
          : ''
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 text-2xs tracking-widest text-mute">
        <span>{formatDate(song.composedAt)}</span>
        <span className="flex items-center gap-2">
          {song.setting ? <span className="text-mute/85">{song.setting}</span> : null}
          {song.mood ? (
            <span className="rounded-full border border-hairline px-2 py-0.5 font-serif text-[10px] leading-none text-ink/70">
              {MOOD_LABEL[song.mood]}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-4 space-y-4">
        {song.verses.map((verse, i) => (
          <p
            key={i}
            className="font-serif text-base leading-loose text-ink/85 sm:text-lg"
          >
            <Linkified text={verse} characters={characters} skipId={skipId} />
          </p>
        ))}
      </div>
    </li>
  );
}
