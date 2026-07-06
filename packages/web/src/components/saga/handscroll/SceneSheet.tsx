'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Character, Scene } from '@endless-story/shared';
import { getSceneBoard, type SceneBoard } from '@/lib/actions/saga-live';
import { sceneArtFor } from './terrainArt';

/** Register glyph + tint for a beat line (mirrors the 題字流 language). */
const KIND: Record<string, { glyph: string; tint: string }> = {
  act: { glyph: '爭', tint: 'text-cinnabar' },
  warmth: { glyph: '暖', tint: 'text-jade' },
  social: { glyph: '敘', tint: 'text-jade/85' },
  move: { glyph: '行', tint: 'text-mute' },
  plan: { glyph: '念', tint: 'text-mute' },
};

/**
 * 內頁 — the scene sheet a 團扇 opens into (mockup rehearsal / chamber design).
 * Modern shell: 當前一幕 image, the scene's beats with locked 心聲 previews, the
 * present cast's 心事 in a side rail, and a subscribe CTA. A private scene shows
 * the 窗內事 lock instead, with an 18+ pill when the tick ledger rated it
 * consummate. Content is metadata-driven; prose is never sniffed for the door.
 */
export function SceneSheet({
  scene,
  sagaId,
  charactersById,
  clock,
  locationArt,
  onClose,
}: {
  scene: Scene;
  sagaId: string;
  charactersById: Map<string, Character>;
  clock?: string;
  /** The location's painting — becomes the deep backdrop so opening a scene
   *  feels like stepping further into that place, not a modal over black. */
  locationArt?: string;
  onClose: () => void;
}) {
  const [board, setBoard] = useState<SceneBoard | null>(null);
  const present = scene.currentCharacterIds ?? [];
  const isPrivate = (scene.privacyLevel ?? 0) >= 3;
  // 當前一幕 = the newest event-moment image among the present cast. Moment
  // renders append a shared kind=4 media asset to every participant, so the
  // scene's latest moment is simply the cast's newest gallery moment (the
  // scene object itself never carries an imageUrl).
  const momentUrls = present
    .flatMap((id) => charactersById.get(id)?.gallery?.eventMoments ?? [])
    .map((m) => m.imageUrl)
    .filter(Boolean);
  const moment = momentUrls.length > 0 ? momentUrls[momentUrls.length - 1] : scene.imageUrl || null;
  // You walked into THIS scene — its own art is the space behind you; the
  // location painting is only the last-resort backdrop.
  const backdrop = sceneArtFor(scene.name) || moment || locationArt || null;
  const nameOf = (id: string) => charactersById.get(id)?.name ?? '某人';

  useEffect(() => {
    let cancelled = false;
    setBoard(null);
    getSceneBoard(sagaId, scene.id, present)
      .then((b) => !cancelled && setBoard(b))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sagaId, scene.id, present]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const presentNames = present.map(nameOf);
  const is18 = board?.rating === 'consummate';

  return (
    // In-place, full-frame — no popup: this layer replaces the (faded) handscroll
    // within the same page shell. You've walked INTO the location.
    <motion.div
      className="absolute inset-0 z-50 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      {/* the location painting fills the frame and pushes forward — 走進去 */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.0 }}
        animate={{ scale: 1.06 }}
        transition={{ duration: 6, ease: 'easeOut' }}
      >
        {backdrop ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={backdrop} alt="" className="h-full w-full object-cover brightness-[0.82] dark:brightness-100" />
        ) : (
          <div className="h-full w-full bg-canvas" />
        )}
        {/* scrims — theme-aware: canvas-tinted by day, black by night, so the
            text panels read in either mode without hiding the place. */}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas/92 via-canvas/68 to-canvas/50 dark:from-black/85 dark:via-black/45 dark:to-black/28" />
        {/* dedicated header scrim so the top-bar text always reads over the art */}
        <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-canvas/85 to-transparent dark:from-black/70" />
      </motion.div>

      {/* click bare painting → step back out */}
      <button aria-label="退回手卷" onClick={onClose} className="absolute inset-0 cursor-zoom-out" />

      {/* content, laid over the space (rises up as you enter) */}
      <motion.div
        role="dialog"
        aria-label={scene.name}
        initial={{ opacity: 0, y: 42 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none relative z-10 flex h-full flex-col"
      >
        {/* top bar */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2.5 px-[max(1rem,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top,0px)+var(--es-site-nav-h)+0.75rem)] sm:px-10">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 font-serif text-2xs tracking-[0.25em] text-ink/80 hover:text-ink"
          >
            <span aria-hidden>←</span> 退回手卷
          </button>
          <span className="mx-1 h-3 w-px bg-hairline" />
          <h2 className="font-serif text-lg tracking-[0.28em] text-ink">{scene.name}</h2>
          {isPrivate ? <Pill tone="jade">私宅</Pill> : null}
          {clock ? <Pill>{clock}</Pill> : null}
          {scene.performance ? <Pill tone="cinnabar">● 戲正熱</Pill> : null}
          {is18 ? <Pill tone="cinnabar">成人 18+</Pill> : null}
          {presentNames.length > 0 ? <Pill>{presentNames.join(' · ')}</Pill> : null}
        </div>

        {/* body */}
        {isPrivate ? (
          <LockedBody is18={is18} />
        ) : (
          <div className="pointer-events-auto min-h-0 flex-1 overflow-y-auto px-[max(1rem,env(safe-area-inset-left))] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-5 sm:px-10 md:overflow-hidden">
            <div className="mx-auto grid max-w-5xl gap-5 md:h-full md:min-h-0 md:grid-cols-[1.35fr_1fr]">
              {/* stage: 當前一幕（有圖才現身）+ beats（面板內自捲，整頁保持一屏） */}
              <div className="flex min-h-0 flex-col gap-4">
                {moment ? (
                  <div className="relative shrink-0 overflow-hidden rounded-xl ring-1 ring-hairline/50 dark:ring-white/15">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={moment}
                      alt={`當前一幕：${scene.name}`}
                      className="max-h-[34dvh] w-full object-cover"
                    />
                    <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 font-serif text-2xs tracking-[0.15em] text-white/90">
                      當前一幕
                    </span>
                    {/* the same moment lives in every participant's 設定集 — the
                        existing still-mint path collects it from there. */}
                    {present[0] ? (
                      <a
                        href={`/dossier?id=${present[0]}&tab=gallery`}
                        className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 font-serif text-2xs tracking-[0.15em] text-white/85 transition-colors hover:text-cinnabar"
                      >
                        設定集收藏 →
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-surface/85 p-5 backdrop-blur-md ring-1 ring-hairline/40 dark:bg-black/40 dark:ring-white/10">
                  <div className="space-y-3.5">
                    {board?.beats.length ? (
                      board.beats.map((b, i) => (
                        <div key={i}>
                          <div className={`mb-1 font-serif text-2xs tracking-[0.3em] ${KIND[b.kind]?.tint ?? 'text-cinnabar'}`}>
                            {nameOf(b.characterId)}
                          </div>
                          <div className="text-sm leading-relaxed text-ink">{b.text}</div>
                        </div>
                      ))
                    ) : (
                      <p className="py-4 text-center text-2xs tracking-[0.2em] text-mute">這一刻還沒有動靜，戲正醞釀。</p>
                    )}
                  </div>
                  {board?.beats.length ? (
                    <p className="mt-4 border-t border-hairline/40 pt-3 text-center font-serif text-2xs tracking-[0.2em] text-mute">
                      列位心聲，隨訂閱可聞
                    </p>
                  ) : null}
                </div>
              </div>

              {/* side: 心事 + CTA */}
              <aside className="flex min-h-0 flex-col gap-4 md:overflow-y-auto">
                <div className="rounded-xl bg-surface/85 p-5 backdrop-blur-md ring-1 ring-hairline/40 dark:bg-black/40 dark:ring-white/10">
                  <h3 className="mb-3 font-serif text-2xs tracking-[0.3em] text-mute">此刻在場的心事</h3>
                  {board?.wants.length ? (
                    board.wants.map((w, i) => (
                      <div key={i} className="mb-3">
                        <p className="text-sm leading-snug text-ink">
                          <span className="text-cinnabar">{nameOf(w.characterId)}</span> · {w.desc}
                        </p>
                        <div className="mt-1.5 h-1 rounded bg-hairline/60">
                          <div className="h-full rounded bg-gradient-to-r from-cinnabar/35 to-cinnabar" style={{ width: `${Math.round(w.tension * 100)}%` }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-2xs leading-relaxed text-mute">心事未起，戲正醞釀。</p>
                  )}
                </div>
                <div className="rounded-xl bg-surface/85 p-4 backdrop-blur-md ring-1 ring-hairline/40 dark:bg-black/40 dark:ring-white/10">
                  <button className="w-full rounded-lg border border-ink/25 bg-transparent py-2.5 font-serif text-sm tracking-[0.25em] text-ink transition-colors hover:border-cinnabar/60 hover:text-cinnabar dark:border-white/25 dark:text-white/85 dark:hover:border-cinnabar/70">
                    訂閱在場角色
                  </button>
                  <p className="mt-2 text-center text-2xs tracking-[0.12em] text-mute">完整心聲 · 心事帳 · 注夢 · 劇照優先鑄</p>
                </div>
              </aside>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function LockedBody({ is18 }: { is18: boolean }) {
  return (
    <div className="pointer-events-auto flex flex-1 items-center justify-center p-10">
      <div className="max-w-md rounded-2xl bg-black/40 px-8 py-9 text-center backdrop-blur-md ring-1 ring-white/10">
        <h4 className="font-serif text-lg tracking-[0.3em] text-white">窗內事</h4>
        <p className="mt-3 text-2xs leading-relaxed tracking-[0.15em] text-white/70">
          門閂落了。窗內的來回不入公開手卷,訂閱在場角色,方能聽見。
        </p>
        {is18 ? (
          <span className="mt-5 inline-block rounded-full border border-cinnabar/60 px-3 py-1 text-2xs tracking-[0.25em] text-cinnabar">
            成人 18+ · consummate
          </span>
        ) : null}
        <div className="mt-6">
          <button className="rounded-lg bg-white/90 px-6 py-3 font-serif text-sm tracking-[0.25em] text-black">訂閱以入內</button>
        </div>
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: 'cinnabar' | 'jade' }) {
  // Sits over the dimmed painting, so the neutral variant is light, not mute.
  const c =
    tone === 'cinnabar'
      ? 'text-cinnabar border-cinnabar/55'
      : tone === 'jade'
        ? 'text-jade border-jade/55'
        : 'text-white/75 border-white/25';
  return <span className={`rounded-full border px-2.5 py-1 font-serif text-2xs tracking-[0.18em] ${c}`}>{children}</span>;
}
