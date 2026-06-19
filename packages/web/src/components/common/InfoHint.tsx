'use client';

import { useId, type ReactNode } from 'react';

/** Discreet ⓘ that reveals help text on hover/focus. Pure CSS (named group +
 *  focus-within), so it works without JS. `align` anchors the bubble's edge. */
export function InfoHint({
  children,
  label = '說明',
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  /** Accessible name for the trigger (screen readers). */
  label?: string;
  align?: 'left' | 'right';
  className?: string;
}) {
  const id = useId();
  return (
    <span className={`group/info relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-mute/60 transition-colors duration-150 hover:text-cinnabar focus:text-cinnabar focus:outline-none focus-visible:ring-1 focus-visible:ring-cinnabar/40"
      >
        <InfoIcon className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        id={id}
        className={[
          'pointer-events-none absolute top-[calc(100%+0.45rem)] z-50 w-max max-w-[18rem]',
          align === 'right' ? 'right-0' : 'left-0',
          'invisible translate-y-1 rounded-md border border-hairline bg-elevated px-3 py-2',
          'text-2xs font-normal leading-relaxed tracking-normal text-ink opacity-0 shadow-lg shadow-black/10',
          'transition duration-150 group-hover/info:visible group-hover/info:translate-y-0 group-hover/info:opacity-100',
          'group-focus-within/info:visible group-focus-within/info:translate-y-0 group-focus-within/info:opacity-100',
          'dark:shadow-black/40',
        ].join(' ')}
      >
        {children}
      </span>
    </span>
  );
}

function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
