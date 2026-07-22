/**
 * 片場印記 — thin ink-stroke icons, 1em square, currentColor. Every icon is
 * paired with an aria-label/title at the call site; the glyphs stay wordless.
 */

import type { SVGProps } from 'react';

function base(props: SVGProps<SVGSVGElement>) {
    return {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        width: '1em',
        height: '1em',
        'aria-hidden': true,
        ...props,
    };
}

/** 走一拍 — a single brush-tipped play stroke. */
export function IconStep(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M7 4.5c4.5 1.8 7.5 4.3 11 7.5-3.5 3.2-6.5 5.7-11 7.5z" />
        </svg>
    );
}

/** 連走 — two strokes, the world keeps walking. */
export function IconRun(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M4 5.5c3.2 1.5 5.4 3.5 7.8 6.5-2.4 3-4.6 5-7.8 6.5z" />
            <path d="M13 5.5c3.2 1.5 5.4 3.5 7.8 6.5-2.4 3-4.6 5-7.8 6.5z" />
        </svg>
    );
}

/** 停 — two settled bars. */
export function IconPause(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M8.5 5v14M15.5 5v14" />
        </svg>
    );
}

/** 另開一卷 — a branch leaving the main stem. */
export function IconFork(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M7 4v16" />
            <path d="M7 9c6 0 10 2 10 7v4" />
            <circle cx="7" cy="4" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="17" cy="20" r="1.6" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** 卷宗與章回 — a handscroll with rolled ends. */
export function IconScroll(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <rect x="6.5" y="6" width="11" height="12" rx="1" />
            <path d="M6.5 8H5a1.5 1.5 0 0 1 0-3h1.5M17.5 16H19a1.5 1.5 0 0 1 0 3h-1.5" />
            <path d="M9.5 10h5M9.5 13.5h5" />
        </svg>
    );
}

/** 物界 — a sealed box of world objects. */
export function IconObjects(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M4.5 8.5 12 5l7.5 3.5v7L12 19l-7.5-3.5z" />
            <path d="M4.5 8.5 12 12l7.5-3.5M12 12v7" />
        </svg>
    );
}

/** 劇本館 — an opened folio. */
export function IconSeed(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M12 6.5C10 5 7.5 4.5 4.5 4.8v13.4c3-.3 5.5.2 7.5 1.7 2-1.5 4.5-2 7.5-1.7V4.8c-3-.3-5.5.2-7.5 1.7z" />
            <path d="M12 6.5v13.4" />
        </svg>
    );
}

/** 圖庫 — a framed mountain-and-sun study. */
export function IconGallery(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <rect x="4.5" y="5" width="15" height="14" rx="1" />
            <circle cx="15.2" cy="9.6" r="1.7" />
            <path d="M4.5 16.5 9.5 11l5 5.5" />
        </svg>
    );
}

/** 展覽室 — a hung plaque (匾額). */
export function IconExhibit(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M6 8 4.5 4.5M18 8l1.5-3.5" />
            <rect x="3.5" y="8" width="17" height="10" rx="1" />
            <path d="M7.5 13h2M12 11.5v3M14.5 13h2" />
        </svg>
    );
}

/** 焚 — a small flame for irreversible deletion. */
export function IconBurn(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M12 4.5c1 2.6 4.8 4.4 4.8 8.3a4.8 4.8 0 0 1-9.6 0c0-1.6.6-2.8 1.6-4.1.3 1 .9 1.8 1.8 2.3-.3-2.4.3-4.6 1.4-6.5z" />
        </svg>
    );
}

/** 回 — return arrow, used for back links and closing sheets. */
export function IconBack(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M10 6.5 4.8 12l5.2 5.5M5.5 12H16a3.5 3.5 0 0 1 0 7h-2" />
        </svg>
    );
}

/** 行蹤 — footprints, someone moved. */
export function IconMove(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <ellipse cx="8.5" cy="8" rx="2" ry="3" transform="rotate(-20 8.5 8)" fill="currentColor" stroke="none" />
            <ellipse cx="15" cy="15.5" rx="2" ry="3" transform="rotate(-20 15 15.5)" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** 導出 — a tray with a brush-stroke arrow descending into it (download/export). */
export function IconExport(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M12 4v10" />
            <path d="M8.5 10.5 12 14l3.5-3.5" />
            <path d="M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3" />
        </svg>
    );
}

/** 天時 — a sun rising over the horizon (clock-bound world events). */
export function IconWorld(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M3.5 17.5h17" />
            <path d="M7.5 17.5a4.5 4.5 0 0 1 9 0" />
            <path d="M12 5.5v2.4M5.7 8.2l1.5 1.5M18.3 8.2l-1.5 1.5" />
        </svg>
    );
}

/** 香火 — an incense stick in its holder, one wisp of smoke curling up. */
export function IconIncense(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M12 19.5v-8" />
            <path d="M9.5 19.5h5" />
            <path d="M12 11c1.5-1.3-1.5-2.7 0-4 1.5-1.3-1.5-2.7 0-4" />
            <circle cx="12" cy="11" r="0.9" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** 注夢 — a crescent moon with a single twinkle (the deep-night dream). */
export function IconDream(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M16.2 4.6A7.6 7.6 0 1 0 19.5 13.4 6.1 6.1 0 0 1 16.2 4.6Z" />
            <path d="M7 5v2M6 6h2" />
        </svg>
    );
}

/** 訪談 — 一問一答隔桌相對（兩帖，一實一虛）。 */
export function IconInterview(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(props)}>
            <path d="M4 5.5h9v6.5h-5l-2.5 2.5v-2.5H4z" />
            <path d="M14.5 10h5.5v5.5h-1.5v2l-2-2h-2z" strokeDasharray="0" />
        </svg>
    );
}
