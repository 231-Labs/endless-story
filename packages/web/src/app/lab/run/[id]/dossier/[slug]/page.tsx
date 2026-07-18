/**
 * 單卷事件卷宗 — reuse the reader site's EventDossier (客觀正史 + 多視角
 * 主觀閱讀) directly on an engine-compiled dossier bundle. Server component:
 * reads the run directory, no chain, no wallet.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventDossier } from '@/components/feed/EventDossier';
import { readDossier } from '@/lib/lab/artifacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LabDossierPage({
    params,
}: {
    params: Promise<{ id: string; slug: string }>;
}) {
    // Page params keep their percent-encoding (unlike route-handler params);
    // run ids may contain CJK, so decode before touching the filesystem layer.
    const { id: rawId, slug: rawSlug } = await params;
    const id = decodeURIComponent(rawId);
    const slug = decodeURIComponent(rawSlug);
    let dossier: ReturnType<typeof readDossier>;
    try {
        dossier = readDossier(id, slug);
    } catch {
        dossier = null;
    }
    if (!dossier) notFound();

    return (
        <main className="min-h-screen bg-canvas">
            <div className="border-b border-hairline/60 px-5 py-3 sm:px-8">
                <Link
                    href={`/lab/run/${id}/reading`}
                    className="font-serif text-2xs tracking-[0.3em] text-mute hover:text-cinnabar"
                >
                    ← 回讀卷處
                </Link>
            </div>
            <EventDossier event={dossier.bundle.event} manifest={dossier.bundle.manifest} />
        </main>
    );
}
