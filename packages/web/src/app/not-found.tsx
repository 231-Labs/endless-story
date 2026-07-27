import Link from 'next/link';
import { SiteNav } from '@/components/home/SiteNav';

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-canvas">
      <SiteNav />
      <section className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <p className="font-serif text-7xl tracking-[0.3em] text-cinnabar/25 sm:text-8xl" aria-hidden>
          四〇四
        </p>
        <h1 className="mt-6 font-serif text-2xl tracking-[0.2em] text-ink sm:text-3xl">
          此處無戲
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed tracking-wide text-mute">
          你走進了一條沒點燈的巷子 — 這頁不存在，或戲碼已經換了。
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="es-button-primary"
          >
            回戲園子
          </Link>
          <Link
            href="/feed"
            className="es-button-ghost"
          >
            讀章回
          </Link>
        </div>
      </section>
    </main>
  );
}
