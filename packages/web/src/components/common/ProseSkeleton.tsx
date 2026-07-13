/**
 * Pulsing prose-line placeholder for a body of text streaming in from Walrus
 * (POV chapter, reflection). Reads as "paragraphs are coming", where a bare
 * 「讀取中…」line reads as a possibly-empty state.
 */
export function ProseSkeleton({ lines = 6, className }: { lines?: number; className?: string }) {
  const widths = ['w-full', 'w-[94%]', 'w-full', 'w-[88%]', 'w-[96%]', 'w-2/3'];
  return (
    <div role="status" aria-label="讀取中" className={`animate-pulse space-y-3 ${className ?? ''}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} aria-hidden className={`h-3.5 rounded bg-hairline/40 ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}
