'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * 路由層錯誤邊界 — 鏈讀 / Walrus 取檔的網路波動最常見。
 * 給用戶一個能理解的說法 + 重試，而不是白屏。
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[route-error]', error);
  }, [error]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-canvas px-6 text-center">
      <p className="font-serif text-6xl tracking-[0.3em] text-cinnabar/25" aria-hidden>
        幕未啟
      </p>
      <h1 className="mt-6 font-serif text-2xl tracking-[0.2em] text-ink">這一幕沒能開演</h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed tracking-wide text-mute">
        可能是鏈上節點或 Walrus 一時沒回話。歇口氣，再試一次。
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-2xs tracking-widest text-mute/50">ref · {error.digest}</p>
      ) : null}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-cinnabar px-6 py-2.5 text-sm tracking-widest text-canvas transition-colors hover:bg-seal"
        >
          再試一次
        </button>
        <Link
          href="/"
          className="rounded-full border border-hairline bg-surface px-6 py-2.5 text-sm tracking-widest text-mute transition-colors hover:border-cinnabar/50 hover:text-cinnabar"
        >
          回戲園子
        </Link>
      </div>
    </main>
  );
}
