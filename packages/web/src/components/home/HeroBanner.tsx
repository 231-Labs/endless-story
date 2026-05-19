import type { Saga } from '@endless-story/shared';

export function HeroBanner({ saga }: { saga: Saga }) {
  return (
    <section className="border-b border-ink/10 px-8 py-12">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs tracking-[0.4em] text-jade uppercase">
          Endless Story · Walrus Track
        </p>
        <h1 className="mt-3 text-4xl font-serif tracking-wider text-ink">
          {saga.name}
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          第 {saga.currentDay} 日 / 全 {saga.totalDays} 日 · {saga.castIds.length} 人在臺
        </p>
        <p className="mt-6 max-w-2xl text-base leading-loose text-ink/80">
          {saga.premise}
        </p>
      </div>
    </section>
  );
}
