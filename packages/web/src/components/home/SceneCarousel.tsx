import type { SceneClip } from '@endless-story/shared';

export function SceneCarousel({ clips }: { clips: SceneClip[] }) {
  return (
    <section className="border-t border-hairline px-5 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-serif text-xl tracking-wide text-ink sm:text-2xl">今日場景</h2>
        <div className="mt-6 grid grid-cols-1 gap-5 sm:mt-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
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
    <article className="flex flex-col gap-3">
      <div className="relative aspect-video overflow-hidden rounded-md bg-stone-100 ring-1 ring-hairline">
        <div className="absolute inset-0 flex items-center justify-center text-ink/30">
          <PlayIcon />
        </div>
        <div className="absolute right-2 top-2 rounded bg-ink/75 px-2 py-0.5 text-2xs tracking-wider text-canvas">
          {clip.durationSeconds}s
        </div>
      </div>
      <div>
        <p className="font-serif text-base text-ink">{clip.title}</p>
        <p className="mt-1 text-2xs tracking-widest text-mute">DAY {clip.day}</p>
      </div>
    </article>
  );
}

function PlayIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden>
      <polygon points="6 4 20 12 6 20" fill="currentColor" />
    </svg>
  );
}
