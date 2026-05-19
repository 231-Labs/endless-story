import type { Saga } from '@endless-story/shared';

export function HeroBanner({ saga }: { saga: Saga }) {
  return (
    <section className="px-5 py-14 sm:px-10 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-serif text-4xl leading-tight tracking-wide text-ink sm:text-5xl">
          {saga.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute sm:mt-4">
          <span>第 {saga.currentDay} 日 / 全 {saga.totalDays} 日</span>
          <span className="hidden text-hairline sm:inline">·</span>
          <span>{saga.castIds.length} 人在臺</span>
        </div>
        <p className="mt-6 max-w-prose text-base leading-loose text-ink/85 sm:mt-8 sm:text-lg">
          {saga.premise}
        </p>
      </div>
    </section>
  );
}
