'use client';

import { useState } from 'react';
import Link from 'next/link';
import { InkFluid } from '@/components/common/InkFluid';

/**
 * First-vault screen — shown to an owner with no 藏閣 yet. Echoes the chamber's
 * 啟封 overlay (ink wash + 藏 seal + serif lead) so it sits with the rest of the
 * 春雪社 visual language instead of a plain form card.
 */
export function CreateVaultGate({
  busy,
  error,
  needsWallet,
  onCreate,
}: {
  busy: boolean;
  error: string | null;
  /** true when no wallet is connected yet (can't mint without one). */
  needsWallet: boolean;
  onCreate: (firstRoomName: string) => void;
}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-canvas">
      {/* soft ink wash, calmed by a canvas-coloured vignette so the lead stays legible */}
      <InkFluid className="absolute inset-0 opacity-50" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(58% 52% at 50% 44%, rgb(var(--color-canvas) / 0.62), rgb(var(--color-canvas) / 0.18) 70%, transparent 100%)',
        }}
      />

      <Link href="/" className="es-button-ghost absolute left-5 top-4 z-10 !px-4 !py-1.5 !text-2xs">
        ← 返回
      </Link>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-6 text-center">
        {/* 藏閣 日/夜主視覺(去背 PNG)— 透明底直接融進 canvas 背景,不做卡片/陰影,
            跟著站台主題切(CSS,不閃)。 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chamber/cangge-day.png" alt="藏閣" className="block h-36 w-auto dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chamber/cangge-night.png" alt="藏閣" className="hidden h-36 w-auto dark:block" />

        <p className="es-page-lead-eyebrow mt-6">春雪社 · 藏閣</p>
        <h1 className="es-page-lead-title" style={{ fontSize: 'clamp(1.7rem, 3vw + 1rem, 2.5rem)' }}>
          啟一座藏閣
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-loose text-mute">
          藏閣是你在鏈上的私人收藏室。收進的劇照與珍玩,都在這裡陳列、佈置、分享。
          先為第一個佈置題個名,鑄上鏈即可入內。
        </p>

        {needsWallet ? (
          <p className="mt-8 rounded-full border border-cinnabar/30 bg-cinnabar/5 px-5 py-2.5 text-2xs tracking-widest text-cinnabar">
            請先從右上角連結錢包,再鑄造藏閣
          </p>
        ) : (
          <div className="mt-8 flex w-full max-w-xs flex-col items-stretch gap-3">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trimmed && !busy) onCreate(trimmed);
              }}
              maxLength={24}
              placeholder="例:春雪閣、白蛇手卷…"
              className="es-field text-center"
            />
            <button
              type="button"
              onClick={() => onCreate(trimmed)}
              disabled={!trimmed || busy}
              className="es-button-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? '鑄造中…' : '鑄造藏閣'}
            </button>
          </div>
        )}

        {error ? <p className="mt-4 text-2xs tracking-widest text-cinnabar">{error}</p> : null}
      </div>
    </div>
  );
}
