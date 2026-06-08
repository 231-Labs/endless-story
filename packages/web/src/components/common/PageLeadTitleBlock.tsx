import type { ReactNode } from 'react';

/**
 * Site-wide lead title block for utility pages — aligns type scale, tracking,
 * and spacing with the first-screen heading below SiteNav.
 */
export function PageLeadTitleBlock({
  eyebrow,
  eyebrowMobile,
  title,
  meta,
  end,
  className = '',
}: {
  eyebrow?: string;
  /** Shorter eyebrow for narrow screens (sm and up still use `eyebrow`) */
  eyebrowMobile?: string;
  title: ReactNode;
  /** Optional helper text below the title */
  meta?: ReactNode;
  /** Right-side slot: search, filters, etc. */
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6 ${className}`}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="es-page-lead-eyebrow">
            {eyebrowMobile ? (
              <>
                <span className="sm:hidden">{eyebrowMobile}</span>
                <span className="hidden sm:inline">{eyebrow}</span>
              </>
            ) : (
              eyebrow
            )}
          </p>
        ) : null}
        <h1 className="es-page-lead-title">{title}</h1>
        {meta ? <div className="mt-3 text-sm leading-relaxed tracking-wide text-mute">{meta}</div> : null}
      </div>
      {end ? <div className="w-full shrink-0 sm:w-auto">{end}</div> : null}
    </div>
  );
}
