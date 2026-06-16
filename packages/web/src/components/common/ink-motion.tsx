'use client';

// 墨韻 — shared "which is active" indicators that flow to their new home.
// InkUnderline: framer-motion layoutId underline (text tab rows). FlowIndicator:
// a measured pill that CSS-transitions to the active tab's box (capsule bars,
// where framer's layout projection collapses an inset-0 child to 0×0).

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const INK_TWEEN = { type: 'tween' as const, ease: [0.22, 1, 0.36, 1] as const, duration: 0.3 };

export function InkUnderline({ groupId }: { groupId: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      layoutId={`${groupId}-underline`}
      className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-cinnabar"
      transition={reduce ? { duration: 0 } : INK_TWEEN}
    />
  );
}

export interface IndicatorBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Tracks the active tab's box. Tag tabs with data-flow-key, ref the (relative)
// container, feed box to <FlowIndicator>.
export function useFlowingIndicator<T extends HTMLElement = HTMLDivElement>(activeKey: string) {
  const containerRef = useRef<T>(null);
  const [box, setBox] = useState<IndicatorBox | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const el = container.querySelector<HTMLElement>(`[data-flow-key="${CSS.escape(activeKey)}"]`);
      if (!el) {
        setBox(null);
        return;
      }
      setBox({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    for (const child of Array.from(container.children)) ro.observe(child);
    // Re-measure when tabs are added/removed without activeKey changing (e.g.
    // DossierTabs reveals owner-only tabs once the wallet connects).
    const mo = new MutationObserver(() => {
      for (const child of Array.from(container.children)) ro.observe(child);
      measure();
    });
    mo.observe(container, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [activeKey]);

  return { containerRef, box };
}

// Render as the first child of the (relative) tab container; labels go above with z-10.
export function FlowIndicator({ box, className = '' }: { box: IndicatorBox | null; className?: string }) {
  if (!box) return null;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute left-0 top-0 rounded-full bg-ink ${className}`}
      style={{
        transform: `translate(${box.left}px, ${box.top}px)`,
        width: box.width,
        height: box.height,
        transition:
          'transform 300ms var(--ease-ink), width 300ms var(--ease-ink), height 300ms var(--ease-ink)',
      }}
    />
  );
}
