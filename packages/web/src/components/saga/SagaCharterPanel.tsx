import type { Saga } from '@endless-story/shared';

export type EmotionalStance = 'restrained' | 'tender' | 'consummate';

const STANCE_STOPS: { key: EmotionalStance; label: string; en: string; note: string }[] = [
  { key: 'restrained', label: '克制', en: 'Restrained', note: '含蓄留白，情止乎禮，戲在弦外。' },
  { key: 'tender', label: '溫存', en: 'Tender', note: '筆調轉暖，親近與眷戀可以明寫。' },
  { key: 'consummate', label: '盡致', en: 'Consummate', note: '許幽微情事在窗內演成，公開層仍隱去。' },
];

/**
 * Charter + operations — the saga's two-sided contract.
 * Visual metaphor: a troupe charter with a counting-house seal.
 * Merges Saga Prompts and Metrics into a single scroll/plaque (no revenue split).
 * `stance` is the live troupe temperament (read-only here; the knob lives backstage).
 */
export function SagaCharterPanel({
  saga,
  stance = 'restrained',
}: {
  saga: Saga;
  stance?: EmotionalStance;
}) {
  const { sagaPrompts, metrics } = saga;

  if (!sagaPrompts && !metrics) return null;

  return (
    <section className="px-4 py-12 sm:px-10 sm:py-16">
      {/* Outer Decorative Frame */}
      <div className="mx-auto w-full max-w-5xl rounded-[2.5rem] border border-hairline/60 bg-surface/80 p-2 shadow-2xl backdrop-blur-xl dark:bg-elevated/60">
        
        {/* Inner Document Layout */}
        <div className="relative flex flex-col lg:flex-row overflow-hidden rounded-[2rem] border border-hairline/40 bg-canvas/40 dark:bg-canvas/20">
          
          {/* Background Watermark (Faded Calligraphy) */}
          <div className="pointer-events-none absolute -right-10 -top-10 opacity-[0.03] dark:opacity-[0.05] select-none">
            <svg width="400" height="400" viewBox="0 0 100 100" aria-hidden>
              <text x="50" y="80" fontSize="80" textAnchor="middle" fill="currentColor" fontFamily="serif" fontWeight="bold">戲</text>
            </svg>
          </div>

          {/* Left Column: The Soul/Prompts (本班之氣) */}
          {sagaPrompts ? (
            <div className="flex-1 p-8 sm:p-12 relative z-10">
              <header className="flex items-center gap-4 mb-10">
                <div className="h-10 w-1.5 bg-cinnabar/80 rounded-full" />
                <div>
                  <h2 className="font-serif text-3xl tracking-widest text-ink">本班之氣</h2>
                  <p className="mt-1 text-2xs tracking-[0.2em] text-mute uppercase">Saga Ethos & Prompts</p>
                </div>
              </header>

              <StanceSpectrum stance={stance} />

              <dl className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2">
                {sagaPrompts.rhythmHints ? (
                  <PromptItem glyph="律" label="自然節律" text={sagaPrompts.rhythmHints} />
                ) : null}
                {sagaPrompts.naturePrompt ? (
                  <PromptItem glyph="氣" label="事件氣質" text={sagaPrompts.naturePrompt} />
                ) : null}
                {sagaPrompts.departurePolicy ? (
                  <PromptItem
                    glyph="界"
                    label="離職政策"
                    text={sagaPrompts.departurePolicy}
                    className="sm:col-span-2"
                  />
                ) : null}
              </dl>
            </div>
          ) : null}

          {/* Right Column: The Ledger/Metrics (經營現況) */}
          {metrics ? (
            <div className="relative w-full lg:w-[340px] shrink-0 border-t lg:border-l lg:border-t-0 border-hairline/50 bg-surface/50 p-8 sm:p-12 dark:bg-elevated/30 z-10 flex flex-col">
              <header className="mb-10">
                <h3 className="font-serif text-xl tracking-widest text-ink">經營現況</h3>
                <p className="mt-1 text-2xs tracking-[0.2em] text-mute uppercase">Current Metrics</p>
              </header>

              <dl className="space-y-6 flex-1">
                <MetricRow label="連載章回" value={metrics.totalChapters} suffix="章" />
                <MetricRow label="訂閱者總數" value={metrics.totalSubscribers} suffix="戶" />
                <MetricRow label="角色平均訂閱" value={metrics.avgSubsPerCharacter} suffix="戶/人" />
                <MetricRow
                  label="公帳現銀"
                  value={metrics.treasuryFunds.toLocaleString()}
                  suffix="endless"
                  emphasize
                />
              </dl>

              {/* Decorative Red Seal (朱文印) */}
              <div className="mt-12 self-end opacity-85 mix-blend-multiply dark:mix-blend-screen select-none pointer-events-none">
                <RedSeal />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * 氣質光譜 — read-only gauge of where this troupe's temperament sits on the
 * 克制 ↔ 溫存 ↔ 盡致 axis. This is the real prose knob (emotional_stance); the
 * adjustment sits backstage, so here it only reports the live position.
 */
function StanceSpectrum({ stance }: { stance: EmotionalStance }) {
  const activeIndex = Math.max(
    0,
    STANCE_STOPS.findIndex((s) => s.key === stance),
  );
  const active = STANCE_STOPS[activeIndex];
  // Even stops → marker at 0% / 50% / 100% of the track.
  const markerPct = (activeIndex / (STANCE_STOPS.length - 1)) * 100;

  return (
    <div className="rounded-2xl border border-hairline/50 bg-canvas/50 p-6 dark:bg-canvas/20">
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs tracking-[0.2em] text-ink/80">氣質光譜</span>
          <span className="text-2xs tracking-[0.16em] text-mute uppercase">Temperament</span>
        </div>
        <span className="inline-flex items-center gap-1 text-2xs tracking-widest text-mute">
          <LockGlyph />
          唯讀・後台可調
        </span>
      </div>

      {/* Track */}
      <div className="relative mx-1 mb-8 h-px bg-hairline/70">
        <div
          className="absolute top-0 h-px bg-cinnabar/50"
          style={{ left: 0, width: `${markerPct}%` }}
        />
        {STANCE_STOPS.map((s, i) => {
          const pct = (i / (STANCE_STOPS.length - 1)) * 100;
          const isActive = i === activeIndex;
          return (
            <div
              key={s.key}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pct}%`, top: '50%' }}
            >
              <span
                className={
                  isActive
                    ? 'block h-3 w-3 rounded-full bg-cinnabar shadow-[0_0_0_4px_rgb(var(--color-cinnabar)/0.18)]'
                    : 'block h-2 w-2 rounded-full border border-hairline bg-surface dark:bg-elevated'
                }
              />
              <span
                className={`absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap font-serif text-sm tracking-widest ${
                  isActive ? 'text-cinnabar' : 'text-mute'
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="font-serif text-sm italic leading-relaxed text-ink/85">
        現於「{active.label}」。{active.note}
      </p>
    </div>
  );
}

function LockGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="text-mute">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PromptItem({
  glyph,
  label,
  text,
  className = '',
}: {
  glyph: string;
  label: string;
  text: string;
  className?: string;
}) {
  return (
    <div className={`relative pl-5 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-px before:bg-hairline/80 ${className}`}>
      <dt className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface border border-hairline/60 font-serif text-xs text-cinnabar shadow-sm dark:bg-elevated">
          {glyph}
        </span>
        <span className="text-xs tracking-widest text-ink/80">{label}</span>
      </dt>
      <dd className="mt-3 font-serif text-sm leading-relaxed text-ink/90 italic">
        {text}
      </dd>
    </div>
  );
}

function MetricRow({
  label,
  value,
  suffix,
  emphasize,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <dt className="text-2xs tracking-widest text-mute">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span
          className={`font-mono text-xl tracking-tight tabular-nums ${
            emphasize ? 'text-cinnabar font-medium dark:text-cinnabar' : 'text-ink'
          }`}
        >
          {value}
        </span>
        {suffix ? (
          <span className="text-2xs tracking-widest text-mute">{suffix}</span>
        ) : null}
      </dd>
    </div>
  );
}

/** Decorative cinnabar seal */
function RedSeal() {
  return (
    <svg width="64" height="64" viewBox="0 0 100 100" className="rotate-[-4deg]" aria-hidden>
      {/* Outer Border */}
      <rect x="10" y="10" width="80" height="80" rx="6" fill="none" stroke="rgb(var(--color-cinnabar))" strokeWidth="5" />
      {/* Inner Cross Lines */}
      <path d="M 50 10 L 50 90 M 10 50 L 90 50" stroke="rgb(var(--color-cinnabar))" strokeWidth="2" opacity="0.6" />
      {/* Characters (Read Top-Right, Bottom-Right, Top-Left, Bottom-Left) */}
      <text x="70" y="42" fontSize="24" textAnchor="middle" fill="rgb(var(--color-cinnabar))" fontFamily="serif" fontWeight="bold">春</text>
      <text x="70" y="80" fontSize="24" textAnchor="middle" fill="rgb(var(--color-cinnabar))" fontFamily="serif" fontWeight="bold">雪</text>
      <text x="30" y="42" fontSize="24" textAnchor="middle" fill="rgb(var(--color-cinnabar))" fontFamily="serif" fontWeight="bold">印</text>
      <text x="30" y="80" fontSize="24" textAnchor="middle" fill="rgb(var(--color-cinnabar))" fontFamily="serif" fontWeight="bold">記</text>
    </svg>
  );
}