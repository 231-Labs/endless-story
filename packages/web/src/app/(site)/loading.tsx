/**
 * (site) 群組的通用冷導航 skeleton — 沒有自己 loading.tsx 的路由
 * （首頁等）冷進入時不再白屏。最近的 loading 邊界優先，
 * 所以 saga / dossier / feed / subscriptions 各自的 skeleton 不受影響。
 *
 * 中央是「開鑼」圖樣動畫：鑼面受擊微顫，三圈音波漣漪外擴。
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
      <div className="flex flex-1 items-center justify-center" role="status">
        <div aria-hidden className="relative flex h-28 w-28 items-center justify-center">
          {/* 音波漣漪 ×3，錯拍外擴 */}
          <span
            className="absolute inset-0 rounded-full border border-cinnabar/45"
            style={{ animation: 'es-ripple 2.2s ease-out infinite' }}
          />
          <span
            className="absolute inset-0 rounded-full border border-cinnabar/30"
            style={{ animation: 'es-ripple 2.2s ease-out 0.7s infinite' }}
          />
          <span
            className="absolute inset-0 rounded-full border border-ink/20"
            style={{ animation: 'es-ripple 2.2s ease-out 1.4s infinite' }}
          />
          {/* 鑼面：外緣 — 內圈 — 鑼臍 */}
          <svg
            viewBox="0 0 48 48"
            className="relative h-16 w-16 drop-shadow-sm"
            style={{ animation: 'es-gong-strike 2.2s ease-out infinite' }}
          >
            <circle cx="24" cy="24" r="22" className="fill-surface stroke-ink/50" strokeWidth="1.6" />
            <circle cx="24" cy="24" r="15" fill="none" className="stroke-ink/25" strokeWidth="1" />
            <circle cx="24" cy="24" r="9" fill="none" className="stroke-cinnabar/30" strokeWidth="0.8" />
            <circle cx="24" cy="24" r="5.5" className="fill-cinnabar/90" />
          </svg>
        </div>
        <span className="sr-only">開鑼中，載入頁面</span>
      </div>
    </main>
  );
}
