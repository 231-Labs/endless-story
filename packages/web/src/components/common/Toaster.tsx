'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * 極簡全域 toast — 行動回饋的單一出口（訂閱、領銀、託夢…）。
 * 視窗底部置中、自動消退；同視覺語言（surface / hairline / cinnabar）。
 */

type ToastTone = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const TONE_ACCENT: Record<ToastTone, string> = {
  info: 'border-hairline',
  success: 'border-jade/50',
  error: 'border-cinnabar/50',
};

const TONE_DOT: Record<ToastTone, string> = {
  info: 'bg-mute',
  success: 'bg-jade',
  error: 'bg-cinnabar',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))] z-[90] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-in-up flex max-w-[min(92vw,26rem)] items-center gap-2.5 rounded-full border bg-surface/95 px-4 py-2.5 text-sm leading-snug text-ink shadow-lg backdrop-blur-md dark:bg-elevated/95 ${TONE_ACCENT[t.tone]}`}
          >
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[t.tone]}`} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
