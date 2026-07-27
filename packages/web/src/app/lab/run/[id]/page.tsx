'use client';

/**
 * 觀測台 — one run's live stage.
 * Directors (LAB_SECRET / open local) see 片場 controls.
 * Guests on the featured public run see 春雪社 chrome.
 */

import { use, useEffect, useState } from 'react';
import { LabStage } from '@/components/lab/LabStage';
import { labApi, type LabClientRole } from '@/components/lab/useLab';

export default function LabRunPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: rawId } = use(params);
    const id = decodeURIComponent(rawId);
    const [role, setRole] = useState<LabClientRole | null>(null);
    const [brand, setBrand] = useState('春雪社');
    const [featuredCastNames, setFeaturedCastNames] = useState<string[]>(['柳安春', '蘇映雪', '金鳳']);
    const [publicRunId, setPublicRunId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void labApi
            .role()
            .then((res) => {
                if (cancelled) return;
                setRole(res.director ? 'director' : 'viewer');
                setBrand(res.brand || '春雪社');
                setFeaturedCastNames(res.featuredCastNames?.length ? res.featuredCastNames : ['柳安春', '蘇映雪', '金鳳']);
                setPublicRunId(res.publicRunId);
            })
            .catch(() => {
                if (!cancelled) setRole('viewer');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!role) {
        return (
            <main className="flex min-h-dvh items-center justify-center">
                <p className="font-serif text-sm tracking-[0.3em] text-mute">展卷中…</p>
            </main>
        );
    }

    // Non-directors may only open the curated public run as guests.
    if (role === 'viewer' && publicRunId && publicRunId !== id) {
        return (
            <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
                <p className="font-serif text-sm tracking-[0.3em] text-mute">此卷僅片場可見</p>
                <a href={`/lab/run/${encodeURIComponent(publicRunId)}`} className="font-serif text-sm tracking-[0.3em] text-cinnabar">
                    前往春雪社
                </a>
            </main>
        );
    }

    return (
        <LabStage
            runId={id}
            role={role}
            brand={brand}
            featuredCastNames={featuredCastNames}
            enableFirstVisit={role === 'viewer'}
        />
    );
}
