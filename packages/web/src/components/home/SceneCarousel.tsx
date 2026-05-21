'use client';

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { ClipAspect, SceneClip } from '@endless-story/shared';

const ASPECT_CLASS: Record<ClipAspect, string> = {
  '16/9': 'aspect-video',
  '9/16': 'aspect-[9/16]',
  '1/1': 'aspect-square',
  '4/3': 'aspect-[4/3]',
  '3/4': 'aspect-[3/4]',
};

const ASPECT_RATIO: Record<ClipAspect, number> = {
  '16/9': 16 / 9,
  '9/16': 9 / 16,
  '1/1': 1,
  '4/3': 4 / 3,
  '3/4': 3 / 4,
};

function aspectClass(aspect?: ClipAspect): string {
  return ASPECT_CLASS[aspect ?? '16/9'];
}

function aspectRatio(aspect?: ClipAspect): number {
  return ASPECT_RATIO[aspect ?? '16/9'];
}

export function SceneCarousel({ clips }: { clips: SceneClip[] }) {
  const [active, setActive] = useState<SceneClip | null>(null);

  return (
    <>
      <section className="border-t border-hairline px-5 py-14 sm:px-10 sm:py-[4.5rem] lg:flex lg:min-h-[48svh] lg:items-center">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="font-serif text-xl tracking-wide text-ink sm:text-2xl">今日場景</h2>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:mt-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {clips.map((clip) => (
              <SceneCard
                key={clip.id}
                clip={clip}
                isActive={active?.id === clip.id}
                onOpen={() => setActive(clip)}
              />
            ))}
          </div>
        </div>
      </section>

      <SceneFloatingCard clip={active} onClose={() => setActive(null)} />
    </>
  );
}

function SceneCard({
  clip,
  isActive,
  onOpen,
}: {
  clip: SceneClip;
  isActive: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`展開 ${clip.title}`}
      aria-pressed={isActive}
      className="group block w-full text-left"
    >
      <div
        className={`relative aspect-video overflow-hidden rounded-md bg-surface dark:bg-elevated/45 ring-1 transition-all duration-300 ${
          isActive
            ? 'ring-cinnabar shadow-md shadow-cinnabar/10'
            : 'ring-hairline hover:shadow-md hover:shadow-ink/5'
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-elevated/10 via-transparent to-canvas/15" />
        <div className="absolute inset-0 flex items-center justify-center text-mute/45 transition-colors group-hover:text-cinnabar/70">
          <PlayIcon />
        </div>
        <div className="absolute right-2 top-2 rounded bg-elevated/85 px-2 py-0.5 text-2xs tracking-wider text-ink shadow-sm backdrop-blur">
          {clip.durationSeconds}s
        </div>
      </div>
      <div className="mt-3">
        <p
          className={`font-serif text-base transition-colors ${
            isActive ? 'text-cinnabar' : 'text-ink group-hover:text-cinnabar'
          }`}
        >
          {clip.title}
        </p>
        <p className="mt-1 text-2xs tracking-widest text-mute">DAY {clip.day}</p>
      </div>
    </button>
  );
}

type DragState =
  | { type: 'move'; offsetX: number; offsetY: number }
  | {
      type: 'resize';
      startX: number;
      startY: number;
      startW: number;
      startH: number;
      aspect: number;
    };

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_WIDTH = 240;
const TARGET_MAX_DIM = 540;

function computeInitialBox(aspect: ClipAspect | undefined): Box {
  if (typeof window === 'undefined') {
    return { x: 100, y: 80, w: 480, h: 270 };
  }
  const ratio = aspectRatio(aspect);
  // Pick width that yields a similar diagonal across aspects, clamped by viewport
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  let w: number;
  let h: number;
  if (ratio >= 1) {
    w = Math.min(TARGET_MAX_DIM, viewportW - 64);
    h = w / ratio;
  } else {
    h = Math.min(TARGET_MAX_DIM, viewportH - 160);
    w = h * ratio;
  }
  // Cap height too
  if (h > viewportH - 80) {
    h = viewportH - 80;
    w = h * ratio;
  }
  const x = Math.max(16, (viewportW - w) / 2);
  const y = Math.max(60, Math.min(120, viewportH - h - 60));
  return { x, y, w, h };
}

function SceneFloatingCard({
  clip,
  onClose,
}: {
  clip: SceneClip | null;
  onClose: () => void;
}) {
  const [shownClip, setShownClip] = useState<SceneClip | null>(clip);
  const [visible, setVisible] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Mount/unmount with transition
  useEffect(() => {
    if (clip) {
      setShownClip(clip);
      // Initialize box only on fresh open (not when swapping clips while open)
      setBox((prev) => prev ?? computeInitialBox(clip.aspect));
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const id = setTimeout(() => {
      setShownClip(null);
      setBox(null);
    }, 280);
    return () => clearTimeout(id);
  }, [clip]);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (shownClip) {
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [shownClip, onClose]);

  if (!shownClip || !box) return null;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const card = cardRef.current;
    if (!card) return;

    if (target.closest('[data-resize-handle]')) {
      e.stopPropagation();
      card.setPointerCapture(e.pointerId);
      dragRef.current = {
        type: 'resize',
        startX: e.clientX,
        startY: e.clientY,
        startW: box.w,
        startH: box.h,
        aspect: box.w / box.h,
      };
      return;
    }

    if (target.closest('[data-drag-handle]')) {
      e.stopPropagation();
      card.setPointerCapture(e.pointerId);
      dragRef.current = {
        type: 'move',
        offsetX: e.clientX - box.x,
        offsetY: e.clientY - box.y,
      };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ref = dragRef.current;
    if (!ref) return;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    if (ref.type === 'move') {
      const nx = Math.max(0, Math.min(viewportW - box.w, e.clientX - ref.offsetX));
      const ny = Math.max(0, Math.min(viewportH - box.h, e.clientY - ref.offsetY));
      setBox((prev) => (prev ? { ...prev, x: nx, y: ny } : prev));
      return;
    }

    if (ref.type === 'resize') {
      const dx = e.clientX - ref.startX;
      let nw = Math.max(MIN_WIDTH, ref.startW + dx);
      let nh = nw / ref.aspect;
      // Clamp to viewport from current top-left
      const maxW = viewportW - box.x - 8;
      const maxH = viewportH - box.y - 8;
      if (nw > maxW) {
        nw = maxW;
        nh = nw / ref.aspect;
      }
      if (nh > maxH) {
        nh = maxH;
        nw = nh * ref.aspect;
      }
      setBox((prev) => (prev ? { ...prev, w: nw, h: nh } : prev));
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    cardRef.current?.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  return (
    <div
      ref={cardRef}
      role="complementary"
      aria-label={`場景詳情 · ${shownClip.title}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`fixed z-50 overflow-hidden rounded-lg bg-elevated ring-1 ring-hairline shadow-2xl shadow-ink/30 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        touchAction: 'none',
      }}
    >
      {/* Drag handle — top 32px invisible bar */}
      <div
        data-drag-handle
        className="absolute inset-x-0 top-0 z-20 h-8 cursor-move"
        aria-hidden
      >
        {/* Visible grip on hover */}
        <div className="pointer-events-none absolute left-1/2 top-2 flex -translate-x-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100">
          <span className="block h-1 w-6 rounded-full bg-canvas/60" />
        </div>
      </div>

      {/* Close X */}
      <button
        type="button"
        onClick={onClose}
        aria-label="關閉"
        className="absolute right-2 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-surface/85 text-base text-ink/80 backdrop-blur transition-colors hover:bg-surface hover:text-ink"
      >
        ×
      </button>

      {/* Image fills the card */}
      <div className="absolute inset-0 bg-surface dark:bg-elevated/45">
        {shownClip.videoUrl ? (
          <video
            src={shownClip.videoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-elevated/10 via-transparent to-canvas/20" />
            <div className="flex h-full w-full items-center justify-center text-mute/45">
              <PlayIcon size={Math.min(box.w, box.h) * 0.18} />
            </div>
          </>
        )}
        <div className="absolute left-3 top-3 rounded bg-elevated/85 px-2 py-0.5 text-2xs tracking-wider text-ink shadow-sm backdrop-blur">
          {shownClip.durationSeconds}s
        </div>
      </div>

      {/* Bottom overlay — title + day, semi-transparent gradient */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-canvas via-canvas/80 to-transparent p-4 pt-12 text-ink">
        <p className="text-2xs tracking-widest text-mute">DAY {shownClip.day}</p>
        <p className="mt-1 font-serif text-base">{shownClip.title}</p>
        {shownClip.chapterId ? (
          <a
            href={`/feed/chapter/${shownClip.chapterId}`}
            className="pointer-events-auto mt-2 inline-block text-sm text-cinnabar hover:underline"
          >
            讀對應章回 →
          </a>
        ) : null}
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        data-resize-handle
        aria-hidden
        className="absolute bottom-0 right-0 z-30 h-5 w-5 cursor-se-resize"
      >
        <svg
          className="absolute bottom-1 right-1 h-3 w-3 text-mute"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M11 1L1 11 M11 5L5 11 M11 9L9 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Aspect ratio enforcer for the inner content */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${aspectClass(shownClip.aspect)}`}
      />
    </div>
  );
}

function PlayIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <polygon points="6 4 20 12 6 20" fill="currentColor" />
    </svg>
  );
}
