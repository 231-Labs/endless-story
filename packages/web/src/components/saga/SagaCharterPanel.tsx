import type { Saga } from '@endless-story/shared';

/**
 * 班規 + 經營 — 春雪社的兩面契約。
 * 視覺隱喻：立班契約與帳房印記。
 * 移除分潤，將 Saga Prompts 與 Metrics 整合為一張精緻的長卷/牌匾。
 */
export function SagaCharterPanel({ saga }: { saga: Saga }) {
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

              <dl className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
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

/**
 * 裝飾性朱文印（春雪印記）
 */
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