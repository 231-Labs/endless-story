import type { Saga } from '@endless-story/shared';

const DAY_PART_LABEL: Record<string, string> = {
  morning: '朝',
  noon: '午',
  dusk: '暮',
  night: '夜',
};

export function HeroBanner({ saga }: { saga: Saga }) {
  return (
    <section className="flex min-h-[34svh] items-center px-5 py-14 sm:min-h-[38svh] sm:px-10 sm:py-16 lg:min-h-[40svh]">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-serif text-4xl leading-tight tracking-wide text-ink sm:text-5xl">
          {saga.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute sm:mt-4">
          <span>
            第 {saga.currentDay} 日
            {saga.worldTime?.partOfDay ? ` · ${DAY_PART_LABEL[saga.worldTime.partOfDay] ?? ''}` : ''}
          </span>
          {saga.totalDays ? <span>· 全 {saga.totalDays} 日</span> : null}
        </div>
        <p className="mt-6 max-w-prose text-base leading-loose text-ink/85 sm:mt-8 sm:text-lg">
          {saga.premise}
        </p>
      </div>
    </section>
  );
}
