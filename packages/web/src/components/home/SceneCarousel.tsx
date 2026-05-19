import type { SceneClip } from '@endless-story/shared';

export function SceneCarousel({ clips }: { clips: SceneClip[] }) {
  return (
    <section className="border-b border-ink/10 px-8 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-serif tracking-widest text-ink">今日場景</h2>
          <span className="text-xs text-ink/50">每段五秒 · 由 saga tick 生成</span>
        </header>
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {clips.map((clip) => (
            <SceneCard key={clip.id} clip={clip} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SceneCard({ clip }: { clip: SceneClip }) {
  return (
    <article className="group flex flex-col gap-2">
      <div className="relative aspect-video overflow-hidden rounded-sm bg-ink/5 ring-1 ring-ink/10">
        <div className="absolute inset-0 flex items-center justify-center text-ink/30">
          <PlayIcon />
        </div>
        <div className="absolute bottom-2 right-2 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] tracking-wider text-parchment">
          {clip.durationSeconds}s
        </div>
      </div>
      <div>
        <p className="text-sm font-serif text-ink">{clip.title}</p>
        {clip.caption ? (
          <p className="mt-1 text-xs leading-relaxed text-ink/55">{clip.caption}</p>
        ) : null}
        <p className="mt-1 text-[10px] tracking-widest text-jade/80">
          DAY {clip.day}
        </p>
      </div>
    </article>
  );
}

function PlayIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" />
    </svg>
  );
}
