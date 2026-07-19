'use client';

/**
 * LabPageHeader — 片場各分頁共用的簷下頂欄：飛簷＋珠簾作簷口裝飾，
 * 題款（眉批＋大題）居左，右手一列印鍵 —— 日夜鍵永在，其餘由頁面補
 * （actions），回程鍵收尾。所有印鍵都在簾「下」的常流之中，永不與簾疊。
 *
 * 回程鍵＝「回上頁」：跨頁面來的（?from=/lab/...）就回那一頁，否則回
 * backHref 預設地。圖庫這種「首頁與觀測台皆可入」的頁，靠此不再一律墜回首頁。
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BeadCurtain, LabEaves } from './LabOrnaments';
import { IconBack } from './LabIcons';
import { ThemeToggle } from '@/components/common/ThemeToggle';

export const LAB_ICON_BUTTON = 'es-icon-button !h-11 !w-11 text-[20px]';

/** 讀取來處：只認站內 /lab 路徑，防開放重導。客端後讀，不觸 prerender。 */
function useFromHref(): string | null {
    const [from, setFrom] = useState<string | null>(null);
    useEffect(() => {
        const raw = new URLSearchParams(window.location.search).get('from');
        if (raw && raw.startsWith('/lab')) setFrom(raw);
    }, []);
    return from;
}

export function LabPageHeader({
    eyebrow,
    title,
    titleTip,
    backHref,
    backTitle = '回片場',
    actions,
    children,
}: {
    eyebrow: string;
    title: string;
    titleTip?: string;
    backHref?: string;
    backTitle?: string;
    /** 額外印鍵（置於日夜鍵之後、回程鍵之前）。 */
    actions?: ReactNode;
    /** 題款列之下的頁面自有列（如籤頁 nav）。 */
    children?: ReactNode;
}) {
    const fromHref = useFromHref();
    const effectiveBack = fromHref ?? backHref;
    const effectiveTitle = fromHref ? '回上頁' : backTitle;
    return (
        <header className="relative pt-5">
            <LabEaves />
            <BeadCurtain className="-mt-2 h-14 opacity-60" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="es-page-lead-eyebrow">{eyebrow}</p>
                    <h1 className="font-serif text-2xl tracking-[0.18em] text-ink" title={titleTip}>
                        {title}
                    </h1>
                </div>
                <span className="flex items-center gap-2">
                    <ThemeToggle className={LAB_ICON_BUTTON} />
                    {actions}
                    {effectiveBack ? (
                        <Link href={effectiveBack} aria-label={effectiveTitle} title={effectiveTitle} className={LAB_ICON_BUTTON}>
                            <IconBack />
                        </Link>
                    ) : null}
                </span>
            </div>
            {children}
        </header>
    );
}
