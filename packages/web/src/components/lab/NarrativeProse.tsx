'use client';

/**
 * NarrativeProse — the shared 讀卷 book-render for woven POV / chapter bodies,
 * plus the reader-scale stepper that drives it. Extracted from the character
 * sheet's 述 tab so every reading surface (人物內頁述頁、讀卷處、…) speaks the
 * same 絹本/serif page: centred 場景題, ornamental 分隔, 首行縮排 paragraphs at
 * book line-height, and a －/＋ font-scale the reader controls (persisted).
 */

import { useEffect, useState } from 'react';

/** 述頁讀者字級 —— the reading-view font sizes the operator can step through. */
export const READER_SCALES = [0.9, 1, 1.15, 1.32, 1.52, 1.75] as const;

/** 讀者字級記於此鍵 —— sticks across 卷／角色／頁. */
const READER_SCALE_KEY = 'es-lab-reader-scale';

/** 讀卷欄基準字級（px）—— the reader scale multiplies this. */
export const READER_BASE_PX = 15.5;

/** 述文分塊 —— the woven POV body carries light markup: `# 場景題`, `---` 分隔線,
 *  and prose / 對白 paragraphs. Parse it so the body renders as a page, not raw
 *  pre-wrapped text. Pure; tolerant of blank lines and half/full-width rules. */
export type ProseBlock = { kind: 'head' | 'rule' | 'para'; text: string };
export function parseProse(body: string): ProseBlock[] {
    const out: ProseBlock[] = [];
    for (const raw of body.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const h = /^#{1,4}\s*(.+)$/.exec(line);
        if (h) { out.push({ kind: 'head', text: h[1].trim() }); continue; }
        if (/^([-–—]{2,}|·{3,}|\*{3,}|—+)$/.test(line)) { out.push({ kind: 'rule', text: '' }); continue; }
        out.push({ kind: 'para', text: line });
    }
    return out;
}

/** 述頁 —— one woven body as a reading page: centred 場景題, ornamental 分隔, and
 *  首行縮排 paragraphs at book line-height. Font-size is inherited from the
 *  reader-scaled container, so everything zooms together. */
export function NarrativeProse({ body }: { body: string }) {
    const blocks = parseProse(body);
    return (
        <div className="space-y-[0.72em]" style={{ lineHeight: 1.95 }}>
            {blocks.map((b, i) => {
                if (b.kind === 'head') {
                    return (
                        <div key={i} className="flex items-center justify-center gap-3 pt-[0.5em]">
                            <span aria-hidden className="h-px w-8 bg-cinnabar/25" />
                            <span className="font-serif text-[1.02em] tracking-[0.22em] text-cinnabar/80">{b.text}</span>
                            <span aria-hidden className="h-px w-8 bg-cinnabar/25" />
                        </div>
                    );
                }
                if (b.kind === 'rule') {
                    return <div key={i} aria-hidden className="py-[0.15em] text-center font-serif text-[0.8em] tracking-[0.6em] text-cinnabar/25">❖</div>;
                }
                return <p key={i} className="font-serif text-ink/90" style={{ textIndent: '2em' }}>{b.text}</p>;
            })}
        </div>
    );
}

/** useReaderScale —— the reader font-scale stepper as a hook: current scale + a
 *  px size for the reading column, plus dec／inc that persist to localStorage.
 *  Pair with <ReaderScaleControl reader={…}/> for the －/＋ chrome. */
export type ReaderScale = {
    idx: number;
    scale: number;
    px: number;
    dec: () => void;
    inc: () => void;
};
export function useReaderScale(): ReaderScale {
    const [idx, setIdx] = useState(1);
    useEffect(() => {
        try {
            const saved = Number(localStorage.getItem(READER_SCALE_KEY));
            if (Number.isInteger(saved) && saved >= 0 && saved < READER_SCALES.length) setIdx(saved);
        } catch { /* no storage — keep the default */ }
    }, []);
    const step = (delta: number) =>
        setIdx((i) => {
            const next = Math.max(0, Math.min(READER_SCALES.length - 1, i + delta));
            try { localStorage.setItem(READER_SCALE_KEY, String(next)); } catch { /* no storage */ }
            return next;
        });
    const scale = READER_SCALES[idx];
    return { idx, scale, px: Math.round(READER_BASE_PX * scale), dec: () => step(-1), inc: () => step(1) };
}

/** 讀者字級控 —— 縮小／百分比／放大 stepper. Same chrome as the sheet's 述頁 so
 *  every reading surface offers the identical control. */
export function ReaderScaleControl({ reader, className = '' }: { reader: ReaderScale; className?: string }) {
    const { idx, scale, dec, inc } = reader;
    return (
        <div className={`flex items-center justify-end gap-2 ${className}`}>
            <span className="font-serif text-2xs tracking-[0.2em] text-mute/55">字級</span>
            <button
                type="button"
                onClick={dec}
                disabled={idx === 0}
                title="縮小"
                className="flex h-6 w-6 items-center justify-center rounded-md border border-hairline bg-canvas/70 font-serif text-sm leading-none text-ink/70 transition hover:border-cinnabar/40 hover:text-cinnabar disabled:opacity-30 dark:bg-white/[0.04]"
            >
                －
            </button>
            <span className="w-9 text-center font-serif text-2xs tabular-nums text-mute/70">{Math.round(scale * 100)}%</span>
            <button
                type="button"
                onClick={inc}
                disabled={idx === READER_SCALES.length - 1}
                title="放大"
                className="flex h-6 w-6 items-center justify-center rounded-md border border-hairline bg-canvas/70 font-serif text-sm leading-none text-ink/70 transition hover:border-cinnabar/40 hover:text-cinnabar disabled:opacity-30 dark:bg-white/[0.04]"
            >
                ＋
            </button>
        </div>
    );
}
