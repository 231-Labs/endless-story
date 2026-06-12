/**
 * 價格膠囊 — 戲坊商品卡左上角，對齊站內 rounded-full + tracking-widest 語彙。
 */

export function KioskPriceTag({
  priceSui,
  chain,
  className,
}: {
  priceSui: number;
  /** When true, append a Kiosk indicator. */
  chain?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        'pointer-events-none absolute left-3 top-3 z-10',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        className={[
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-2xs tracking-widest',
          'border-cinnabar/55 bg-[#f8f3e6] text-cinnabar shadow-[0_2px_12px_rgba(0,0,0,0.28)]',
          'dark:border-[#caa64a]/60 dark:bg-[#1e1a15] dark:text-[#e8cd84] dark:shadow-[0_2px_12px_rgba(0,0,0,0.45)]',
        ].join(' ')}
      >
        <span className="font-serif tabular-nums">
          {priceSui} <span className="opacity-80">SUI</span>
        </span>
        {chain ? (
          <>
            <span className="opacity-40">·</span>
            <span className="opacity-90">Kiosk</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
