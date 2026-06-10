/**
 * (site) 群組的通用冷導航 skeleton — 沒有自己 loading.tsx 的路由
 * （首頁等）冷進入時不再白屏。最近的 loading 邊界優先，
 * 所以 saga / dossier / feed / subscriptions 各自的 skeleton 不受影響。
 */
export default function SiteLoading() {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-canvas">
      {/* nav 占位 */}
      <div className="border-b border-hairline bg-surface/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-3.5 sm:px-10 sm:py-5">
          <div className="h-8 w-36 animate-pulse rounded bg-hairline/50" />
          <div className="flex items-center gap-4">
            <div className="h-4 w-40 animate-pulse rounded bg-hairline/40" />
            <div className="h-8 w-20 animate-pulse rounded-full bg-hairline/40" />
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <span className="font-serif text-2xl tracking-[0.4em] text-mute/50">開鑼中</span>
        <span aria-hidden className="h-px w-16 overflow-hidden bg-hairline">
          <span className="block h-full w-1/2 animate-pulse bg-cinnabar/70" />
        </span>
      </div>
    </main>
  );
}
