import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-canvas">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center opacity-35 bg-[url('/hero/saga-day.webp')] dark:bg-[url('/hero/saga-night.webp')] dark:opacity-25"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/75 to-canvas/45" />
      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <p className="font-serif text-7xl tracking-[0.3em] text-cinnabar/25 sm:text-8xl" aria-hidden>
          四〇四
        </p>
        <h1 className="mt-6 font-serif text-2xl tracking-[0.2em] text-ink sm:text-3xl">此處無戲</h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed tracking-wide text-mute">
          你走進了一條沒點燈的巷子 — 這頁不存在，或戲碼已經換了。
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="es-button-primary">
            回春雪社
          </Link>
          <Link href="/lab" className="es-button-ghost">
            片場
          </Link>
        </div>
      </section>
    </main>
  );
}
