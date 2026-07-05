'use client';

import { useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import type { Character } from '@endless-story/shared';

/** Register of the line → a brush-mark glyph + on-brand tint, so the world reads
 *  alive in more than one key: 爭(act) hot, 暖(warmth) cool, 行/念 neutral. */
const KIND_STYLE: Record<string, { glyph: string; tint: string }> = {
  act: { glyph: '爭', tint: 'text-cinnabar' },
  warmth: { glyph: '暖', tint: 'text-jade' },
  social: { glyph: '敘', tint: 'text-jade/85' },
  move: { glyph: '行', tint: 'text-mute' },
  plan: { glyph: '念', tint: 'text-mute' },
  priv: { glyph: '幽', tint: 'text-mute/80' },
};

/**
 * As a scene enters the viewport the quote floats up, then sinks as it fades.
 * Rendered vertical-rl (top-to-bottom columns). A small register glyph caps the
 * column and tints the speaker, so a glance reads 爭/暖/行 without reading the
 * line. `children` is the content — left open for future LLM token streaming.
 */
export interface StreamLine {
  /** Stable identity across polls (ts + speaker works). */
  key: string;
  text: string;
  speakerName?: string;
  kind?: string;
}

/**
 * 題字流 — a scene's recent beats as drifting inscriptions. The newest line
 * stands at the anchor; older ones rise, drift a hair sideways and thin out
 * like incense smoke, then leave. Same brush language as FloatingQuote.
 */
export function FloatingStream({
  lines,
  leftPct,
  topPct,
}: {
  /** Newest first; at most 3 are shown. */
  lines: StreamLine[];
  leftPct: number;
  topPct: number;
}) {
  const shown = lines.slice(0, 3);
  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{ left: `${leftPct}%`, top: `${topPct}%`, transform: 'translate(-50%, 0)' }}
    >
      <AnimatePresence>
        {shown.map((l, idx) => {
          const style = (l.kind && KIND_STYLE[l.kind]) || { glyph: '', tint: 'text-cinnabar/80' };
          const text = l.text.length > 20 ? `${l.text.slice(0, 20)}…` : l.text;
          return (
            // Static wrapper owns centering so framer's transform can't clobber
            // it; the column drifts STRAIGHT up — 飄要直，像香煙不像柳絮。
            <div key={l.key} className="absolute left-0 top-0 -translate-x-1/2">
              <motion.div
                initial={{ opacity: 0, y: 26 }}
                animate={{ opacity: [1, 0.5, 0.24][idx] ?? 0.2, y: -idx * 52 }}
                exit={{ opacity: 0, y: -160, transition: { duration: 2.4, ease: 'easeOut' } }}
                transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center rounded-md bg-surface/55 px-2 py-3 shadow-sm ring-1 ring-hairline/40 backdrop-blur-sm [writing-mode:vertical-rl] dark:bg-elevated/45"
              >
                {style.glyph ? (
                  <span
                    className={`mb-2 font-serif text-[10px] tracking-[0.2em] ${style.tint} opacity-70`}
                    aria-hidden
                  >
                    {style.glyph}
                  </span>
                ) : null}
                <span className="font-serif text-sm leading-snug tracking-[0.16em] text-ink/85 drop-shadow-sm">
                  「{text}」
                </span>
                {l.speakerName && idx === 0 ? (
                  <span className={`mt-3 font-serif text-xs tracking-[0.3em] ${style.tint}`}>
                    — {l.speakerName}
                  </span>
                ) : null}
              </motion.div>
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function FloatingQuote({
  speaker,
  children,
  leftPct,
  topPct,
  delaySeconds = 0,
  kind,
}: {
  speaker?: Character | null;
  children: ReactNode;
  leftPct: number; // relative to the handscroll container
  topPct: number;
  delaySeconds?: number;
  kind?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // once + low threshold: fire as soon as it's partly on the first screen and
  // never hide again, so it doesn't require scrolling away and back to appear.
  const inView = useInView(ref, { once: true, amount: 0.1 });
  const style = (kind && KIND_STYLE[kind]) || { glyph: '', tint: 'text-cinnabar/80' };

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-30"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        // Top-aligned: topPct sits below the title; the column only grows downward, never over the title.
        transform: 'translate(-50%, 0)',
        // Max height + clip: keep very long quotes from spilling off the bottom (already truncated to 20 chars, rarely hits).
        maxHeight: '52dvh',
        overflow: 'hidden',
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
        className="flex flex-col items-center rounded-md bg-surface/55 px-2 py-3 shadow-sm ring-1 ring-hairline/40 backdrop-blur-sm dark:bg-elevated/45"
        style={{ writingMode: 'vertical-rl' as const }}
      >
        {style.glyph ? (
          <span
            className={`mb-2 font-serif text-[10px] tracking-[0.2em] ${style.tint} opacity-70`}
            aria-hidden
          >
            {style.glyph}
          </span>
        ) : null}
        <span className="font-serif text-sm leading-snug tracking-[0.16em] text-ink/85 drop-shadow-sm">
          {children}
        </span>
        {speaker ? (
          <span className={`mt-3 font-serif text-xs tracking-[0.3em] ${style.tint}`}>
            — {speaker.name}
          </span>
        ) : null}
      </motion.div>
    </div>
  );
}
