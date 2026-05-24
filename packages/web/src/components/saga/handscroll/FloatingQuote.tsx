'use client';

import { useRef, type ReactNode } from 'react';
import { motion, useInView } from 'framer-motion';
import type { Character } from '@endless-story/shared';

/**
 * 場景進入 viewport 時，題款由下而上浮升、淡出時下沉。
 * vertical-rl 直書顯示。
 * children 是內容 — 為將來 LLM streaming token 預留接口。
 */
export function FloatingQuote({
  speaker,
  children,
  leftPct,
  topPct,
  delaySeconds = 0,
}: {
  speaker?: Character | null;
  children: ReactNode;
  leftPct: number; // 相對於手卷容器
  topPct: number;
  delaySeconds?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4, margin: '-15% 0px -15% 0px' });

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-30"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: 'translate(-50%, 0)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        transition={{
          duration: 1.2,
          delay: delaySeconds,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="flex flex-col items-center rounded-md bg-surface/55 px-2 py-3 backdrop-blur-sm dark:bg-elevated/45"
        style={{ writingMode: 'vertical-rl' as const }}
      >
        <span className="font-serif text-sm leading-snug tracking-[0.18em] text-ink/85 drop-shadow-sm sm:text-base">
          {children}
        </span>
        {speaker ? (
          <span className="mt-3 font-serif text-xs tracking-[0.3em] text-cinnabar/80">
            — {speaker.name}
          </span>
        ) : null}
      </motion.div>
    </div>
  );
}
