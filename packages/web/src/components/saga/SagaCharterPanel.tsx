import type { Saga } from '@endless-story/shared';

export type EmotionalStance = 'restrained' | 'tender' | 'consummate';

export interface RelationshipClimate {
  label: string;
  count: number;
}
export interface HeartLedger {
  open: number;
  resolved: number;
  byLayer: { layer: string; count: number }[];
}

const STANCE_STOPS: { key: EmotionalStance; label: string; note: string }[] = [
  { key: 'restrained', label: '克制', note: '情止乎禮，戲在弦外。' },
  { key: 'tender', label: '溫存', note: '筆調轉暖，親近可明寫。' },
  { key: 'consummate', label: '盡致', note: '幽情在窗內演成，公開層仍隱去。' },
];

/**
 * Charter — one-screen troupe plaque. Only the two live signals matter: the
 * temperament gauge (emotional_stance, read-only here; knob is backstage) and
 * the current metrics. The preset's nature/rhythm/departure prompts are
 * storyteller directives / not-yet-enabled mechanisms, so they're not shown.
 */
export function SagaCharterPanel({
  saga,
  stance = 'restrained',
  climate = [],
  heart,
}: {
  saga: Saga;
  stance?: EmotionalStance;
  climate?: RelationshipClimate[];
  heart?: HeartLedger;
}) {
  const { metrics } = saga;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col">
      <div className="rounded-[1.75rem] border border-hairline/60 bg-surface/70 p-6 shadow-xl backdrop-blur-xl dark:bg-elevated/50 sm:p-9">
        <header className="mb-7 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl tracking-[0.2em] text-ink">規章</h2>
            <p className="mt-1 text-2xs tracking-[0.22em] text-mute uppercase">
              Charter · {saga.name}
            </p>
          </div>
          <RedSeal />
        </header>

        <StanceSpectrum stance={stance} />

        {heart && (heart.open > 0 || heart.resolved > 0) ? <HeartLedgerRow heart={heart} /> : null}

        {climate.length > 0 ? <ClimateRow climate={climate} /> : null}

        {metrics ? <MetricsStrip metrics={metrics} /> : null}
      </div>
    </section>
  );
}

/** 心事帳 — the troupe's emotional P&L (anonymous counts; details stay gated). */
function HeartLedgerRow({ heart }: { heart: HeartLedger }) {
  return (
    <div className="mt-7 border-t border-hairline/50 pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-2xs tracking-[0.2em] text-mute">心事帳 · HEART</span>
        <span className="font-mono text-sm tabular-nums text-ink">
          未了 <span className="text-cinnabar">{heart.open}</span> 樁
          <span className="mx-2 text-hairline">·</span>
          已了 <span className="text-jade">{heart.resolved}</span> 樁
        </span>
      </div>
      {heart.byLayer.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {heart.byLayer.map((l) => (
            <span
              key={l.layer}
              className="rounded-full border border-hairline/60 px-2.5 py-0.5 text-2xs tracking-wide text-ink/75"
            >
              {l.layer} <span className="font-mono text-mute">{l.count}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 關係氣象 — the shape of the emotional graph, aggregated from tone edges. */
function ClimateRow({ climate }: { climate: RelationshipClimate[] }) {
  return (
    <div className="mt-6 border-t border-hairline/50 pt-6">
      <span className="text-2xs tracking-[0.2em] text-mute">關係氣象 · TIES</span>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {climate.map((c) => (
          <span key={c.label} className="font-serif text-sm text-ink/85">
            {c.label}
            <span className="ml-1 font-mono text-2xs text-cinnabar">×{c.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * 氣質光譜 — read-only gauge of where this troupe sits on 克制 ↔ 溫存 ↔ 盡致.
 * The real prose knob (emotional_stance); adjustment lives backstage.
 */
function StanceSpectrum({ stance }: { stance: EmotionalStance }) {
  const activeIndex = Math.max(0, STANCE_STOPS.findIndex((s) => s.key === stance));
  const active = STANCE_STOPS[activeIndex];
  const markerPct = (activeIndex / (STANCE_STOPS.length - 1)) * 100;

  return (
    <div className="rounded-2xl border border-hairline/50 bg-canvas/50 px-5 py-5 dark:bg-canvas/20">
      <div className="mb-6">
        <span className="text-xs tracking-[0.2em] text-ink/80">
          氣質光譜
          <span className="ml-2 text-2xs tracking-[0.16em] text-mute uppercase">Temperament</span>
        </span>
      </div>

      <div className="relative mx-1 h-px bg-hairline/70">
        <div className="absolute top-0 h-px bg-cinnabar/50" style={{ left: 0, width: `${markerPct}%` }} />
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

      <p className="mt-9 font-serif text-sm italic text-ink/80">
        現於「{active.label}」。{active.note}
      </p>
    </div>
  );
}

function MetricsStrip({ metrics }: { metrics: NonNullable<Saga['metrics']> }) {
  const items: { label: string; value: string | number; suffix?: string; emphasize?: boolean }[] = [
    { label: '連載', value: metrics.totalChapters, suffix: '章' },
    { label: '訂閱', value: metrics.totalSubscribers, suffix: '戶' },
    { label: '角色均訂', value: metrics.avgSubsPerCharacter },
    { label: '公帳', value: metrics.treasuryFunds.toLocaleString(), suffix: 'endless', emphasize: true },
  ];
  return (
    <dl className="mt-7 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-hairline/50 pt-6 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-2xs tracking-[0.18em] text-mute">{it.label}</dt>
          <dd className="mt-1 flex items-baseline gap-1">
            <span
              className={`font-mono text-lg tabular-nums ${
                it.emphasize ? 'font-medium text-cinnabar' : 'text-ink'
              }`}
            >
              {it.value}
            </span>
            {it.suffix ? <span className="text-2xs tracking-widest text-mute">{it.suffix}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Decorative cinnabar seal */
function RedSeal() {
  return (
    <svg width="52" height="52" viewBox="0 0 100 100" className="rotate-[-4deg] opacity-85 mix-blend-multiply dark:mix-blend-screen" aria-hidden>
      <rect x="10" y="10" width="80" height="80" rx="6" fill="none" stroke="rgb(var(--color-cinnabar))" strokeWidth="5" />
      <path d="M 50 10 L 50 90 M 10 50 L 90 50" stroke="rgb(var(--color-cinnabar))" strokeWidth="2" opacity="0.6" />
      <text x="70" y="42" fontSize="24" textAnchor="middle" fill="rgb(var(--color-cinnabar))" fontFamily="serif" fontWeight="bold">春</text>
      <text x="70" y="80" fontSize="24" textAnchor="middle" fill="rgb(var(--color-cinnabar))" fontFamily="serif" fontWeight="bold">雪</text>
      <text x="30" y="42" fontSize="24" textAnchor="middle" fill="rgb(var(--color-cinnabar))" fontFamily="serif" fontWeight="bold">印</text>
      <text x="30" y="80" fontSize="24" textAnchor="middle" fill="rgb(var(--color-cinnabar))" fontFamily="serif" fontWeight="bold">記</text>
    </svg>
  );
}
