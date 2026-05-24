'use client';

import { useEffect, useState } from 'react';

interface SectionDef {
  id: string;
  label: string;
  sub: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'saga-handscroll', label: '戲樓', sub: '展卷' },
  { id: 'saga-constellation', label: '人物', sub: '圖譜' },
  { id: 'saga-charter', label: '本班', sub: '規則' },
];

/**
 * 春雪社頁右側細鋸 — 三段切換 + 鍵盤 1 / 2 / 3 快捷。
 * 不奪手卷視覺主體，回訪者可一鍵跳關係圖／本班規則。
 */
export function SagaSectionRail() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  // 用 IntersectionObserver 在外層 main 的捲動容器內偵測當前可見的 section
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    const targets = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => Boolean(el)
    );
    if (targets.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        // 取交集面積最大者
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { root: main, threshold: [0.25, 0.5, 0.75] }
    );
    targets.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // 鍵盤快捷
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      const idx = ['1', '2', '3'].indexOf(e.key);
      if (idx < 0) return;
      jump(SECTIONS[idx].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav
      className="pointer-events-none fixed right-4 top-1/2 z-[60] -translate-y-1/2 sm:right-6"
      aria-label="春雪社章節"
    >
      <ul className="flex flex-col items-end gap-5">
        {SECTIONS.map((s, i) => {
          const active = activeId === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => jump(s.id)}
                className="pointer-events-auto group flex items-center gap-3 outline-none focus-visible:opacity-100"
                aria-label={`跳到 ${s.label}（${s.sub}）`}
                aria-current={active ? 'true' : undefined}
                title={`${i + 1} · ${s.label}`}
              >
                <span
                  className={`font-serif text-2xs tracking-[0.4em] transition-all duration-300 ${
                    active
                      ? 'text-cinnabar opacity-100'
                      : 'text-mute opacity-0 group-hover:opacity-90 group-focus-visible:opacity-90'
                  }`}
                >
                  {s.label}
                </span>
                <span
                  aria-hidden
                  className={`block h-px transition-all duration-300 ${
                    active
                      ? 'w-7 bg-cinnabar'
                      : 'w-3 bg-mute/40 group-hover:w-5 group-hover:bg-mute group-focus-visible:w-5 group-focus-visible:bg-mute'
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
