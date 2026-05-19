'use client';

import { useRouter } from 'next/navigation';

export function BackButton({
  fallback,
  ariaLabel = '返回',
}: {
  fallback: string;
  ariaLabel?: string;
}) {
  const router = useRouter();

  const onClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallback);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="es-icon-button h-8 w-8"
    >
      <span aria-hidden className="text-base">←</span>
    </button>
  );
}
