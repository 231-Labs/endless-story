'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, CSSProperties } from 'react';
import type {
  Chapter,
  Character,
  DayPart,
  Saga,
  Scene,
  SceneGhostQuote,
  SceneHeatProfile,
  ScenePastEvent,
  ScenePrivacyLevel,
} from '@endless-story/shared';
import { characterPortraitTone } from '@/components/common/CharacterPortrait';
import { BlobImage } from '@/components/common/BlobImage';
import { shortChapterTitle } from '@/lib/format';

/**
 * 戲樓畫板 — 兩種模式 inline 切換：
 *   - overview : 整張戲樓 + scene markers + 戲台脈動
 *   - focused  : 點入單一 scene 後、同一塊區域變成那個 scene 的細看畫面
 */

interface ScenePosition {
  x: number; // 0-100 (%)
  y: number; // 0-100 (%)
}

const SCENE_POSITIONS: Record<string, ScenePosition> = {
  // 戲樓 zone
  scene_main_stage: { x: 50, y: 25 },
  scene_music_shed: { x: 30, y: 35 },
  scene_backstage: { x: 70, y: 35 },
  scene_trunk_room: { x: 75, y: 48 },
  // 院落 zone
  scene_east_hall: { x: 25, y: 65 },
  scene_courtyard: { x: 50, y: 72 },
  scene_bunk_room: { x: 75, y: 65 },
  scene_accounting: { x: 68, y: 82 },
};

const PRIVACY_LABEL: Record<ScenePrivacyLevel, string> = {
  0: '公開',
  1: '工作場',
  2: '半私密',
  3: '幽僻',
  4: '夜宿共寢',
  5: '獨處私房',
};

const DAY_PART_LABEL: Record<DayPart, string> = {
  morning: '朝',
  noon: '午',
  dusk: '暮',
  night: '夜',
};

const DAY_PART_TINT: Record<DayPart, string> = {
  morning: 'linear-gradient(180deg, rgba(255,235,200,0.15), transparent 70%)',
  noon: 'linear-gradient(180deg, rgba(255,250,235,0.1), transparent 70%)',
  dusk: 'linear-gradient(180deg, rgba(230,130,90,0.18), transparent 80%)',
  night: 'linear-gradient(180deg, rgba(40,30,60,0.25), transparent 80%)',
};

export function SagaTroupeCanvas({
  saga,
  scenes,
  charactersById,
  chaptersById,
  locationLabel,
}: {
  saga: Saga;
  scenes: Scene[];
  charactersById: Map<string, Character>;
  chaptersById: Map<string, Chapter>;
  locationLabel: string;
}) {
  const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);
  const [povId, setPovId] = useState<string | null>(null);
  const focusedScene = scenes.find((s) => s.id === focusedSceneId) ?? null;
  const worldTime = saga.worldTime;

  // Reset pov when scene changes
  useEffect(() => {
    setPovId(null);
  }, [focusedSceneId]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      {/* Background Canvas (Full Screen) */}
      <div className="absolute inset-0">
        {focusedScene ? (
          <FocusedSceneBackground
            scene={focusedScene}
            povId={povId}
            worldTime={worldTime ?? null}
          />
        ) : (
          <OverviewCanvas
            saga={saga}
            scenes={scenes}
            charactersById={charactersById}
            onSelect={setFocusedSceneId}
          />
        )}
      </div>

      {/* Overlays */}
      <div className="absolute inset-0 pointer-events-none z-20 flex flex-col">
        {/* Header Area (padding for SiteNav) */}
        <div className="h-20 shrink-0" />

        {focusedScene ? (
          <div className="flex-1 flex flex-col pointer-events-auto px-4 sm:px-10 pb-8 overflow-y-auto [scrollbar-width:none]">
            <CanvasHeader
              worldTime={worldTime}
              focusedScene={focusedScene}
              onBack={() => setFocusedSceneId(null)}
            />

            {/* Status Cards */}
            <div className="flex flex-wrap gap-4 mt-6">
              <div className="rounded-2xl border border-hairline/50 bg-surface/75 px-3 py-2 text-2xs tracking-widest text-mute shadow-sm backdrop-blur-md dark:bg-elevated/55">
                ◇ 此處在接通後由 AI 即時生成
                {povId ? '（此視角專屬版本）' : ''}
              </div>
              {focusedScene.performance ? (
                <div className="flex items-center gap-2 rounded-full border border-cinnabar/45 bg-surface/80 px-3 py-2 text-2xs tracking-widest text-cinnabar shadow-md shadow-cinnabar/15 backdrop-blur-md dark:bg-elevated/70">
                  <span aria-hidden className="relative flex h-2 w-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-cinnabar opacity-75" />
                    <span className="relative h-2 w-2 rounded-full bg-cinnabar" />
                  </span>
                  <span>正在演《{focusedScene.performance.title}》</span>
                </div>
              ) : (
                <div className="rounded-2xl border border-hairline/50 bg-surface/75 px-3 py-2 text-2xs tracking-widest text-mute backdrop-blur-md dark:bg-elevated/55">
                  {focusedScene.pastEvents?.length ?? 0} 段已發生 · 持續累積
                </div>
              )}
            </div>

            <div className="mt-auto pt-24 flex flex-col gap-12">
              <SceneGhostQuotes
                scene={focusedScene}
                charactersById={charactersById}
                povId={povId}
                onPovChange={setPovId}
              />
              <FocusedSceneDetails scene={focusedScene} chaptersById={chaptersById} />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between px-5 sm:px-10 pb-12 pointer-events-none">
            {/* Title & Meta */}
            <div className="pointer-events-auto max-w-3xl mt-4 sm:mt-8">
              <h1 className="font-serif text-5xl tracking-widest text-ink drop-shadow-md sm:text-6xl lg:text-7xl">
                {saga.name}
              </h1>
            </div>

            {/* Premise Text (Bottom Left) */}
            <div className="pointer-events-auto max-w-xl mb-8">
              <div className="border-l-2 border-cinnabar/60 pl-5">
                <p className="font-serif text-xs tracking-[0.2em] text-mute/80 uppercase mb-2">本回 Premise</p>
                <p className="font-serif text-base leading-relaxed text-ink/90 sm:text-lg drop-shadow-sm">
                  {saga.premise}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scroll Hint (Only show when not focused) */}
      {!focusedScene && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-mute/50 pointer-events-none z-20">
          <span className="text-2xs font-mono tracking-widest uppercase">SCROLL</span>
          <div className="h-6 w-px overflow-hidden bg-hairline/30 sm:h-8">
            <div className="h-full w-full animate-scroll-down-line bg-mute/50" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Header ─────────── */

function CanvasHeader({
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
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-hairline/50 bg-surface/70 px-4 py-2 text-xs tracking-widest text-ink shadow-sm backdrop-blur-md transition-all hover:border-cinnabar/40 hover:text-cinnabar dark:bg-elevated/70"
          >
            ← 返回全圖
          </button>
          <span className="text-hairline">·</span>
          <p className="text-xs tracking-widest text-mute/90 drop-shadow-sm">{PRIVACY_LABEL[focusedScene.privacyLevel]}</p>
        </div>
        <h2 className="font-serif text-3xl tracking-wide text-ink drop-shadow-md sm:text-4xl">{focusedScene.name}</h2>
      </div>
    );
  }
  return null;
}

/* ─────────── Overview canvas（戲樓全圖）─────────── */

function OverviewCanvas({
  saga,
  scenes,
  charactersById,
  onSelect,
}: {
  saga: Saga;
  scenes: Scene[];
  charactersById: Map<string, Character>;
  onSelect: (sceneId: string) => void;
}) {
  return (
    <div className="animate-fade-in-up absolute inset-0 overflow-hidden">
      {/* 保持 16:9 比例並 cover 整個畫面 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[max(100vw,177.77vh)] h-[max(100vh,56.25vw)]">
        <InkWashBackground />
        {saga.worldTime ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-overlay"
            style={{ background: DAY_PART_TINT[saga.worldTime.partOfDay] }}
          />
        ) : null}

        {/* Zone labels */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-[15%] top-[25%] flex flex-col items-center gap-2 text-mute/50 drop-shadow-sm"
        >
          <span className="font-serif text-xl tracking-[0.4em] sm:text-2xl">戲樓</span>
          <span className="text-2xs tracking-widest text-mute/40">對外</span>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute right-[15%] bottom-[25%] flex flex-col items-center gap-2 text-mute/50 drop-shadow-sm"
        >
          <span className="font-serif text-xl tracking-[0.4em] sm:text-2xl">院落</span>
          <span className="text-2xs tracking-widest text-mute/40">對內</span>
        </div>

        {/* 月洞門 label */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-[45%] top-[52%] -translate-x-1/2 text-xs tracking-widest text-mute/50 drop-shadow-sm"
        >
          月洞門
        </div>

        {/* Scene markers */}
        {scenes.map((scene) => {
          const pos = SCENE_POSITIONS[scene.id];
          if (!pos) return null;
          const presentChars = scene.currentCharacterIds
            .map((id) => charactersById.get(id))
            .filter((c): c is Character => Boolean(c));
          return (
            <SceneHotspot
              key={scene.id}
              scene={scene}
              pos={pos}
              presentCount={presentChars.length}
              onClick={() => onSelect(scene.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─────────── Focused canvas（單一 scene 細看）─────────── */

function FocusedSceneBackground({
  scene,
  povId,
  worldTime,
}: {
  scene: Scene;
  povId: string | null;
  worldTime: Saga['worldTime'] | null;
}) {
  return (
    <div className="animate-fade-in-up absolute inset-0 flex flex-col">
      <AmbientCanvas
        profile={scene.heatProfile ?? null}
        povId={povId}
        worldTime={worldTime}
      />
    </div>
  );
}

function SceneGhostQuotes({
  scene,
  charactersById,
  povId,
  onPovChange,
}: {
  scene: Scene;
  charactersById: Map<string, Character>;
  povId: string | null;
  onPovChange: (id: string | null) => void;
}) {
  const [ghostIndex, setGhostIndex] = useState(0);

  const ghostQuotes = scene.ghostQuotes ?? [];
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
            <BlobImage src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
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

/* ─────────── Focused 底部三欄詳情 ─────────── */

function FocusedSceneDetails({
  scene,
  chaptersById,
}: {
  scene: Scene;
  chaptersById: Map<string, Chapter>;
}) {
  const pastEvents = scene.pastEvents ?? [];
  return (
    <div className="animate-fade-in-up grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8 max-w-6xl mx-auto w-full">
      <section className="rounded-3xl border border-hairline/50 bg-surface/80 p-6 shadow-sm backdrop-blur-md dark:bg-elevated/80 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="h-px w-6 bg-cinnabar/40" />
          <h3 className="font-serif text-lg tracking-wide text-ink">氣</h3>
        </div>
        <p className="mt-3 text-xs text-mute">由相關記憶的情感類型蒸出。</p>
        {scene.heatProfile ? (
          <ul className="mt-6 space-y-4 text-sm">
            <HeatRow
              label="朱熱（內在衝突）"
              value={scene.heatProfile.cinnabar}
              color="bg-cinnabar"
            />
            <HeatRow
              label="青觀(旁觀 / 師承)"
              value={scene.heatProfile.jade}
              color="bg-jade"
            />
            <HeatRow
              label="灰沉(事務 / 平靜)"
              value={scene.heatProfile.mute}
              color="bg-mute"
            />
          </ul>
        ) : (
          <p className="mt-6 text-sm italic text-mute">尚未累積。</p>
        )}
      </section>

      <section className="rounded-3xl border border-hairline/50 bg-surface/80 p-6 shadow-sm backdrop-blur-md dark:bg-elevated/80 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="h-px w-6 bg-cinnabar/40" />
          <h3 className="font-serif text-lg tracking-wide text-ink">過往</h3>
        </div>
        <p className="mt-3 text-xs text-mute">在此處發生過的章回。</p>
        {pastEvents.length === 0 ? (
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

      <section className="rounded-3xl border border-hairline/50 bg-surface/80 p-6 shadow-sm backdrop-blur-md dark:bg-elevated/80 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="h-px w-6 bg-cinnabar/40" />
          <h3 className="font-serif text-lg tracking-wide text-ink">派生 IP</h3>
        </div>
        <p className="mt-3 text-xs text-mute">此處長出的內容資產。</p>
        {scene.derivativeCounts ? (
          <ul className="mt-6 space-y-4 text-sm">
            <DerivativeRow label="公開章回" count={scene.derivativeCounts.chapters} suffix="章" />
            <DerivativeRow label="角色記憶" count={scene.derivativeCounts.memories} suffix="條" />
            <DerivativeRow label="心曲創作" count={scene.derivativeCounts.soulSongs} suffix="曲" />
          </ul>
        ) : (
          <p className="mt-6 text-sm italic text-mute">尚未派生。</p>
        )}
      </section>
    </div>
  );
}

function HeatRow({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink/85">{label}</span>
        <span className="font-mono text-xs tabular-nums text-mute">{pct}</span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-hairline/50">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
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

function DerivativeRow({
  label,
  count,
  suffix,
}: {
  label: string;
  count: number;
  suffix: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-hairline pb-3">
      <span className="text-ink/85">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className="font-mono text-xl text-ink">{count}</span>
        <span className="text-2xs tracking-widest text-mute">{suffix}</span>
      </span>
    </li>
  );
}

/* ─────────── Ambient canvas（focused 底層）─────────── */

const WORLD_TIME_MOOD: Record<
  DayPart,
  {
    vignette: string;
    rim: string;
    grainOpacity: number;
  }
> = {
  morning: {
    vignette:
      'radial-gradient(ellipse 120% 90% at 50% -10%, rgba(255,238,210,0.22), transparent 52%)',
    rim: 'linear-gradient(180deg, rgba(176,74,60,0.06), transparent 35%, rgba(176,74,60,0.04))',
    grainOpacity: 0.035,
  },
  noon: {
    vignette:
      'radial-gradient(ellipse 100% 80% at 50% -5%, rgba(255,253,235,0.14), transparent 50%)',
    rim: 'linear-gradient(180deg, rgba(90,106,94,0.05), transparent 40%)',
    grainOpacity: 0.022,
  },
  dusk: {
    vignette:
      'radial-gradient(ellipse 110% 100% at 80% 20%, rgba(230,140,90,0.18), transparent 55%), radial-gradient(circle at 10% 80%, rgba(176,74,60,0.12), transparent 45%)',
    rim: 'linear-gradient(165deg, rgba(224,184,108,0.12), transparent 45%, rgba(40,34,26,0.15))',
    grainOpacity: 0.045,
  },
  night: {
    vignette:
      'radial-gradient(ellipse 90% 70% at 50% 0%, rgba(45,38,82,0.35), transparent 58%), radial-gradient(circle at 85% 90%, rgba(176,74,60,0.08), transparent 40%)',
    rim: 'linear-gradient(205deg, rgba(30,24,42,0.45), transparent 42%, rgba(224,184,108,0.06))',
    grainOpacity: 0.055,
  },
};

function AmbientCanvas({
  profile,
  povId,
  worldTime,
}: {
  profile: SceneHeatProfile | null;
  povId: string | null;
  worldTime: Saga['worldTime'] | null;
}) {
  const part = worldTime?.partOfDay ?? null;
  const mood = part ? WORLD_TIME_MOOD[part] : WORLD_TIME_MOOD.noon;

  const heatLayers = profile
    ? `
      radial-gradient(circle at 30% 32%, rgba(var(--color-cinnabar) / ${profile.cinnabar * 0.42}), transparent 54%),
      radial-gradient(circle at 72% 64%, rgba(var(--color-jade) / ${profile.jade * 0.38}), transparent 54%),
      radial-gradient(circle at 52% 88%, rgba(var(--color-mute) / ${profile.mute * 0.32}), transparent 62%)
    `
    : '';

  const baseGradient = 'linear-gradient(to bottom, rgb(var(--color-elevated)), rgb(var(--color-canvas)))';

  return (
    <div
      className={`absolute inset-0 transition-[filter] duration-700 ease-out ${
        povId ? 'saturate-[1.18] contrast-[1.06]' : ''
      }`}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{
          background: `${heatLayers ? `${heatLayers}, ` : ''}${baseGradient}`,
        }}
      />
      {part ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 mix-blend-soft-light dark:mix-blend-screen"
            style={{ background: mood.vignette }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-80 dark:opacity-90"
            style={{ background: mood.rim }}
          />
        </>
      ) : null}
      {/* 細膩顆粒 — 降低數位平直感 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: mood.grainOpacity,
          mixBlendMode: 'overlay',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
        }}
      />
      {/* 四角暈暗 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow:
            part === 'night'
              ? 'inset 0 0 120px rgba(15,14,12,0.42)'
              : 'inset 0 0 100px rgba(15,14,12,0.12)',
        }}
      />
    </div>
  );
}

/* ─────────── Ink wash background（overview anchor placeholder）─────────── */

function InkWashBackground() {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-br from-canvas via-surface to-canvas/80 dark:from-canvas dark:via-elevated/60 dark:to-canvas/90" />
      <svg
        viewBox="0 0 1600 900"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <radialGradient id="inkBlot1" cx="50%" cy="20%" r="55%">
            <stop offset="0%" stopColor="rgb(var(--color-mute))" stopOpacity="0.12" />
            <stop offset="100%" stopColor="rgb(var(--color-mute))" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="inkBlot2" cx="80%" cy="80%" r="50%">
            <stop offset="0%" stopColor="rgb(var(--color-cinnabar))" stopOpacity="0.06" />
            <stop offset="100%" stopColor="rgb(var(--color-cinnabar))" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="inkBlot3" cx="15%" cy="65%" r="40%">
            <stop offset="0%" stopColor="rgb(var(--color-jade))" stopOpacity="0.07" />
            <stop offset="100%" stopColor="rgb(var(--color-jade))" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#inkBlot1)" />
        <rect width="100%" height="100%" fill="url(#inkBlot2)" />
        <rect width="100%" height="100%" fill="url(#inkBlot3)" />
        <path
          d="M 540 140 Q 800 80 1060 140"
          stroke="rgb(var(--color-mute))"
          strokeWidth="2.5"
          strokeOpacity="0.35"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 580 165 L 1020 165"
          stroke="rgb(var(--color-mute))"
          strokeWidth="1.5"
          strokeOpacity="0.25"
          strokeLinecap="round"
          fill="none"
        />
        {/* 戲樓 / 院落 分隔（左半線） */}
        <path
          d="M 120 450 L 740 450"
          stroke="rgb(var(--color-hairline))"
          strokeWidth="1.5"
          strokeOpacity="0.55"
          strokeDasharray="4 5"
          fill="none"
        />
        {/* 月洞門 — 半圓拱（向上） */}
        <path
          d="M 740 450 A 60 60 0 0 1 860 450"
          stroke="rgb(var(--color-mute))"
          strokeWidth="2"
          strokeOpacity="0.65"
          fill="none"
        />
        {/* 月洞門影 — 內襯一條較淡的弧 */}
        <path
          d="M 750 450 A 50 50 0 0 1 850 450"
          stroke="rgb(var(--color-cinnabar))"
          strokeWidth="1"
          strokeOpacity="0.3"
          fill="none"
        />
        {/* 戲樓 / 院落 分隔（右半線） */}
        <path
          d="M 860 450 L 1480 450"
          stroke="rgb(var(--color-hairline))"
          strokeWidth="1.5"
          strokeOpacity="0.55"
          strokeDasharray="4 5"
          fill="none"
        />
      </svg>
    </div>
  );
}

/* ─────────── Scene hotspot（overview 發光熱點）─────────── */

function SceneHotspot({
  scene,
  pos,
  presentCount,
  onClick,
}: {
  scene: Scene;
  pos: ScenePosition;
  presentCount: number;
  onClick: () => void;
}) {
  const isMainStage = scene.id === 'scene_main_stage';
  const isPerforming = isMainStage && !!scene.performance;
  const privacy = PRIVACY_LABEL[scene.privacyLevel];

  return (
    <div
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      className="group absolute z-20 -translate-x-1/2 -translate-y-1/2 outline-none pointer-events-auto"
    >
      {isPerforming && scene.performance ? (
        <span className="absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-cinnabar/45 bg-surface/95 px-3 py-1.5 text-2xs tracking-widest text-cinnabar shadow-lg shadow-cinnabar/20 backdrop-blur-md dark:bg-elevated/90">
          <span aria-hidden className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-cinnabar opacity-75" />
            <span className="relative h-2 w-2 rounded-full bg-cinnabar" />
          </span>
          《{scene.performance.title}》
        </span>
      ) : null}

      <button
        type="button"
        onClick={onClick}
        aria-label={`進入 ${scene.name}`}
        className="relative flex cursor-pointer items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-canvas transition-transform duration-300 focus-visible:ring-2 focus-visible:ring-cinnabar group-hover:scale-110 active:scale-95 dark:ring-offset-canvas"
      >
        <span
          aria-hidden
          className={`absolute h-14 w-14 rounded-full opacity-70 blur-md transition-opacity duration-500 group-hover:opacity-100 ${
            isPerforming ? 'bg-cinnabar/50' : 'bg-cinnabar/25'
          }`}
        />
        <span
          aria-hidden
          className={`absolute h-10 w-10 animate-ping rounded-full opacity-40 ${
            isPerforming ? 'bg-cinnabar/60' : 'bg-jade/35'
          }`}
          style={{ animationDuration: isPerforming ? '2s' : '3.2s' }}
        />
        <span
          className={`relative h-3 w-3 rounded-full shadow-lg ring-2 ring-white/80 transition-all duration-300 dark:ring-white/25 ${
            isPerforming
              ? 'scale-125 bg-cinnabar ring-cinnabar/50'
              : 'bg-cinnabar/90 ring-cinnabar/30 dark:bg-jade dark:ring-jade/40'
          }`}
        />
      </button>

      {/* hover / focus：展開場景資訊卡（與 button 同層，避免巢狀 block） */}
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-4 w-max max-w-[min(260px,calc(100vw-3rem))] -translate-x-1/2 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="rounded-2xl border border-hairline/50 bg-surface/95 px-4 py-3 text-left shadow-xl shadow-black/10 backdrop-blur-md dark:bg-elevated/95 dark:shadow-black/40">
          <p className="font-serif text-base text-ink">{scene.name}</p>
          <p className="mt-2 text-2xs leading-relaxed tracking-wider text-mute">{privacy}</p>
          <p className="mt-2 flex items-center gap-1.5 text-2xs tracking-widest text-mute">
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 rounded-full ${presentCount > 0 ? 'bg-jade' : 'bg-mute/50'}`}
            />
            {presentCount > 0 ? `${presentCount} 人在此` : '— 無人 —'}
          </p>
          <p className="mt-3 border-t border-hairline/60 pt-2 text-2xs tracking-widest text-cinnabar/90 dark:text-jade">
            點熱點細看 →
          </p>
        </div>
      </div>
    </div>
  );
}
