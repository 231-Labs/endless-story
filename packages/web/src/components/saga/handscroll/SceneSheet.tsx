'use client';

import { useEffect, useState } from 'react';
import type { Character, Scene } from '@endless-story/shared';
import { getSceneBoard, type SceneBoard } from '@/lib/actions/saga-live';

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
  onClose,
}: {
  scene: Scene;
  sagaId: string;
  charactersById: Map<string, Character>;
  clock?: string;
  onClose: () => void;
}) {
  const [board, setBoard] = useState<SceneBoard | null>(null);
  const present = scene.currentCharacterIds ?? [];
  const isPrivate = (scene.privacyLevel ?? 0) >= 3;
  const moment = scene.imageUrl || scene.gallery?.anchor?.imageUrl || null;
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <button aria-label="關閉" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <section
        role="dialog"
        aria-label={scene.name}
        className="relative z-10 flex max-h-[90dvh] w-[min(1040px,92vw)] flex-col overflow-hidden rounded-2xl border border-hairline/60 bg-surface shadow-2xl dark:bg-elevated"
      >
        {/* head */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-hairline/60 px-6 py-3.5">
          <h2 className="font-serif text-lg tracking-[0.28em] text-ink">{scene.name}</h2>
          {isPrivate ? <Pill tone="gold">私宅</Pill> : null}
          {clock ? <Pill>{clock}</Pill> : null}
          {scene.performance ? <Pill tone="cinnabar">● 戲正熱</Pill> : null}
          {is18 ? <Pill tone="cinnabar">成人 18+</Pill> : null}
          {presentNames.length > 0 ? <Pill>{presentNames.join(' · ')}</Pill> : null}
          <button
            onClick={onClose}
            className="ml-auto rounded-md border border-hairline/60 px-3.5 py-1.5 font-serif text-2xs tracking-[0.2em] text-mute hover:text-ink"
          >
            關閉
          </button>
        </div>

        {/* body */}
        {isPrivate ? (
          <LockedBody is18={is18} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            {/* stage column */}
            <div className="flex min-w-0 flex-[1.25] flex-col border-b border-hairline/60 md:border-b-0 md:border-r">
              <div className="relative shrink-0">
                {moment ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={moment} alt={`當前一幕：${scene.name}`} className="aspect-[16/9] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-canvas to-elevated/60 text-2xs tracking-[0.2em] text-mute">
                    當前一幕 · 戲到峰值時由現場對白生成
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex gap-2">
                  <span className="rounded-full bg-black/55 px-2.5 py-1 font-serif text-2xs tracking-[0.15em] text-white/90">
                    當前一幕
                  </span>
                </div>
              </div>
              <div className="flex-1 space-y-3.5 overflow-y-auto px-6 py-5">
                {board?.beats.length ? (
                  board.beats.map((b, i) => {
                    const k = KIND[b.kind] ?? KIND.act;
                    return (
                      <div key={i}>
                        <div className={`mb-1 font-serif text-2xs tracking-[0.3em] ${k.tint}`}>{nameOf(b.characterId)}</div>
                        <div className="text-sm leading-relaxed text-ink">{b.text}</div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="h-2.5 w-40 rounded-full bg-gradient-to-r from-mute/40 via-hairline to-mute/40 blur-[1.5px]" />
                          <span className="whitespace-nowrap font-serif text-2xs tracking-[0.16em] text-gold">心聲 · 訂閱解鎖</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="pt-6 text-center text-2xs tracking-[0.2em] text-mute">這一刻還沒有動靜，戲正醞釀。</p>
                )}
              </div>
            </div>

            {/* side column */}
            <aside className="flex w-full min-w-0 flex-col md:max-w-[340px]">
              <div className="border-b border-hairline/60 px-5 py-4">
                <h3 className="mb-3 font-serif text-2xs tracking-[0.3em] text-mute">此刻在場的心事</h3>
                {board?.wants.length ? (
                  board.wants.map((w, i) => (
                    <div key={i} className="mb-3">
                      <p className="text-sm leading-snug text-ink">
                        <span className="text-gold">{nameOf(w.characterId)}</span> · {w.desc}
                      </p>
                      <div className="mt-1.5 h-1 rounded bg-hairline/60">
                        <div className="h-full rounded bg-gradient-to-r from-gold to-cinnabar" style={{ width: `${Math.round(w.tension * 100)}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-2xs leading-relaxed text-mute">心事帳訂閱後可見。</p>
                )}
              </div>
              <div className="mt-auto space-y-2 px-5 py-5">
                <button className="w-full rounded-lg bg-ink py-3 font-serif text-sm tracking-[0.25em] text-canvas">
                  訂閱在場角色
                </button>
                <p className="text-center text-2xs tracking-[0.12em] text-mute">完整心聲連載 · 心事帳 · 每月注夢 · 劇照優先鑄</p>
              </div>
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}

function LockedBody({ is18 }: { is18: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="max-w-md rounded-2xl border border-hairline/60 bg-canvas/60 px-8 py-9 text-center backdrop-blur-sm">
        <h4 className="font-serif text-lg tracking-[0.3em] text-ink">窗內事</h4>
        <p className="mt-3 text-2xs leading-relaxed tracking-[0.15em] text-mute">
          門閂落了。窗內的來回不入公開手卷,訂閱在場角色,方能聽見。
        </p>
        {is18 ? (
          <span className="mt-5 inline-block rounded-full border border-cinnabar/50 px-3 py-1 text-2xs tracking-[0.25em] text-cinnabar">
            成人 18+ · consummate
          </span>
        ) : null}
        <div className="mt-6">
          <button className="rounded-lg bg-ink px-6 py-3 font-serif text-sm tracking-[0.25em] text-canvas">訂閱以入內</button>
        </div>
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: 'cinnabar' | 'gold' }) {
  const c =
    tone === 'cinnabar'
      ? 'text-cinnabar border-cinnabar/45'
      : tone === 'gold'
        ? 'text-gold border-gold/45'
        : 'text-mute border-hairline/60';
  return <span className={`rounded-full border px-2.5 py-1 font-serif text-2xs tracking-[0.18em] ${c}`}>{children}</span>;
}
