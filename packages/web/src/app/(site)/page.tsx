'use client';

/**
 * 春雪社 guest home — Cinema Lab as the sole public world container.
 * Loads the curated featured run; falls back to a quiet waiting state.
 */

import { useEffect, useState } from 'react';
import { LabStage } from '@/components/lab/LabStage';
import { labApi } from '@/components/lab/useLab';
import { LabDialogProvider } from '@/components/lab/LabDialog';

export default function ChunxueHomePage() {
    const [runId, setRunId] = useState<string | null>(null);
    const [brand, setBrand] = useState('春雪社');
    const [featuredCastNames, setFeaturedCastNames] = useState<string[]>(['柳安春', '蘇映雪', '金鳳']);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void labApi
            .publicConfig()
            .then((cfg) => {
                if (cancelled) return;
                setBrand(cfg.brand || '春雪社');
                setFeaturedCastNames(cfg.featuredCastNames?.length ? cfg.featuredCastNames : ['柳安春', '蘇映雪', '金鳳']);
                setRunId(cfg.runId);
                setReady(cfg.ready);
                if (!cfg.ready) setError(cfg.runId ? '公開卷尚未就緒' : '尚未策展公開卷（LAB_PUBLIC_RUN_ID 或 public.json）');
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (runId && ready) {
        return (
            <LabDialogProvider>
                <div className="min-h-dvh bg-canvas text-ink">
                    <LabStage
                        runId={runId}
                        role="viewer"
                        brand={brand}
                        featuredCastNames={featuredCastNames}
                        enableFirstVisit
                    />
                </div>
            </LabDialogProvider>
        );
    }

    return (
        <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6">
            <div
                aria-hidden
                className="absolute inset-0 bg-cover bg-center opacity-50 bg-[url('/hero/saga-day.webp')] dark:bg-[url('/hero/saga-night.webp')] dark:opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/70 to-canvas/40" />
            <div className="relative z-10 max-w-md text-center">
                <p className="font-serif text-xs tracking-[0.5em] text-cinnabar">{brand}</p>
                <h1 className="mt-4 font-serif text-3xl tracking-[0.2em] text-ink">世界即將開幕</h1>
                <p className="mt-6 font-serif text-sm leading-loose tracking-[0.15em] text-mute">
                    {error || '正在迎賓…'}
                </p>
                <p className="mt-10 font-serif text-2xs tracking-[0.3em] text-mute/70">
                    片場入口 · <a className="text-cinnabar hover:underline" href="/lab">/lab</a>
                </p>
            </div>
        </main>
    );
}
