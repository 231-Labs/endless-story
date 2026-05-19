'use client';

import { useRouter } from 'next/navigation';

export function BackButton({
  fallback,
  label = '返回人物誌',
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
      className="group inline-flex items-center gap-2 text-sm tracking-widest text-mute transition-colors hover:text-ink"
    >
      <span aria-hidden className="transition-transform group-hover:-translate-x-1">←</span>
      <span>{label}</span>
    </button>
  );
}
