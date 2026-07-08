'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
 * 題字流 — a scene's recent beats as a single drifting inscription that cycles
 * (輪播): one column stands at the anchor, holds a beat, then rises and thins
 * like incense smoke as the next takes its place. One at a time, never stacked.
 */
export function FloatingStream({
  lines,
  leftPct,
  topPct,
}: {
  /** Newest first. */
  lines: StreamLine[];
  leftPct: number;
  topPct: number;
}) {
  const items = lines.slice(0, 5);
  const [idx, setIdx] = useState(0);
  // Signature of the current set — reset to the newest line whenever it changes.
  const sig = items.map((l) => l.key).join('|');
  useEffect(() => {
    setIdx(0);
  }, [sig]);
  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 4200);
    return () => clearInterval(t);
  }, [items.length, sig]);

  const cur = items[idx];
  if (!cur) return null;
  const style = (cur.kind && KIND_STYLE[cur.kind]) || { glyph: '', tint: 'text-cinnabar/80' };
  const text = cur.text.length > 20 ? `${cur.text.slice(0, 20)}…` : cur.text;

  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{ left: `${leftPct}%`, top: `${topPct}%`, transform: 'translate(-50%, 0)' }}
    >
      {/* mode="wait": the old column drifts fully out before the next rises —
          strictly one at a time, so columns never overlap. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={cur.key}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -44, transition: { duration: 1.1, ease: 'easeOut' } }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center rounded-md bg-surface/55 px-2 py-3 shadow-sm ring-1 ring-hairline/40 backdrop-blur-sm [writing-mode:vertical-rl] dark:bg-elevated/45"
          style={{ transform: 'translateX(-50%)' }}
        >
          {style.glyph ? (
            <span
              className={`mb-2 font-serif text-[10px] tracking-[0.2em] ${style.tint} opacity-70`}
              aria-hidden
            >
              {style.glyph}
            </span>
          ) : null}
          <span
            className="block font-serif text-sm leading-snug tracking-[0.16em] text-ink/85 drop-shadow-sm"
            // vertical-rl inline size = height; capping it wraps a long line into
            // a second column (to the left) instead of spilling past the painting.
            style={{ maxHeight: 'min(30dvh, 13rem)' }}
          >
            「{text}」
          </span>
          {cur.speakerName ? (
            <span className={`mt-3 font-serif text-xs tracking-[0.3em] ${style.tint}`}>
              — {cur.speakerName}
            </span>
          ) : null}
        </motion.div>
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
        <span
          className="block font-serif text-sm leading-snug tracking-[0.16em] text-ink/85 drop-shadow-sm"
          style={{ maxHeight: 'min(30dvh, 13rem)' }}
        >
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
