'use client';

import { useRouter } from 'next/navigation';

export function BackButton({
  fallback,
  label = '返回班底名冊',
  ariaLabel = '返回',
}: {
  fallback: string;
  label?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();

  const onClick = () => {
    router.push(fallback);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="group inline-flex items-center gap-2 text-sm tracking-widest text-mute transition-colors hover:text-cinnabar"
    >
      <span aria-hidden className="transition-transform group-hover:-translate-x-1">←</span>
      <span className="border-b border-transparent transition-colors group-hover:border-cinnabar/40">
        {label}
      </span>
    </button>
  );
}
