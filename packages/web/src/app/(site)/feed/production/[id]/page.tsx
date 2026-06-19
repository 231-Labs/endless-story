import Link from 'next/link';
import { charactersApi, productionsApi } from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { Markdown } from '@/components/common/Markdown';
import { objectUrl } from '@/lib/explorer';

/**
 * 戲折（排戲）閱讀頁 — a whole 劇目 the troupe wrote/cast/performed itself.
 *
 * The body is the assembled 戲折 (班底·分場·折子戲中戲章回·角兒私詞), anchored as
 * an es:production commitment (subject=saga). The footer carries the on-chain
 * commitment + the cast (co-owners). See docs/PRODUCTION_ENGINE.md §10.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const prod = await productionsApi.getProduction(id).catch(() => null);
    if (!prod) return { title: '找不到戲折' };
    const title = firstHeading(prod.body) ?? prod.title ?? `${prod.classicSource ?? ''} · 新戲`;
    return {
        title,
        description: prod.body.replace(/^#.*$/m, '').replace(/[#*>|-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120),
    };
}

export default async function ProductionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const prod = await productionsApi.getProduction(id);

    if (!prod) {
        return (
            <main className="min-h-screen">
                <SiteNav />
                <section className="flex flex-col items-center px-5 py-24 text-center sm:px-10">
                    <p className="font-serif text-xl tracking-[0.2em] text-ink">找不到這齣戲</p>
                    <p className="mt-3 text-sm text-mute">可能還沒排成，或網址抄錯了一個字。</p>
                    <Link href="/feed?mode=visual" className="mt-8 es-button-ghost">
                        回梨園排戲
                    </Link>
                </section>
            </main>
        );
    }

    const characters = prod.castIds.length
        ? await charactersApi.listSagaCharacters(prod.sagaId).catch(() => [])
        : [];
    const byId = new Map(characters.map((c) => [c.id, c]));

    return (
        <main className="min-h-screen">
            <SiteNav />
            <div className="px-5 py-10 sm:px-10 sm:py-14">
                <div className="mx-auto max-w-3xl">
                    <Link href="/feed?mode=visual" aria-label="回梨園排戲" className="es-icon-button mb-6 h-8 w-8">
                        <span aria-hidden className="text-base">←</span>
                    </Link>

                    <div className="flex flex-wrap items-center gap-3 text-xs tracking-widest text-mute/80">
                        {prod.day != null ? (
                            <span className="rounded border border-hairline/50 bg-canvas/50 px-2.5 py-1">DAY {prod.day}</span>
                        ) : null}
                        {prod.classicSource ? <span>{prod.classicSource} · 舊戲新唱</span> : null}
                        <span className="text-cinnabar font-medium">戲班自編自演 · {prod.castIds.length} 角</span>
                    </div>

                    <Markdown
                        source={prod.body}
                        className="chapter-prose mt-8 text-lg leading-loose text-ink/85 sm:text-xl sm:leading-[2.2]"
                    />

                    {/* 鏈上查驗 + 共有 IP（cast）footer */}
                    <div className="mt-14 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline/50 pt-6 text-2xs tracking-widest text-mute/70">
                        <span className="text-mute/80">此折錨定於鏈上 ·</span>
                        <a href={objectUrl(prod.commitmentId)} target="_blank" rel="noopener noreferrer" className="hover:text-cinnabar">
                            戲折 commitment
                        </a>
                    </div>

                    {prod.castIds.length ? (
                        <footer className="mt-10 border-t border-hairline/50 pt-8">
                            <p className="text-2xs uppercase tracking-[0.25em] text-mute">共有此戲的角兒</p>
                            <div className="mt-4 flex flex-wrap gap-3">
                                {prod.castIds.map((cid) => {
                                    const c = byId.get(cid);
                                    const label = c?.name ?? `${cid.slice(0, 8)}…`;
                                    return (
                                        <Link
                                            key={cid}
                                            href={{ pathname: '/dossier', query: { id: cid } }}
                                            className="rounded-full border border-hairline/60 bg-surface/40 px-4 py-2 text-sm tracking-widest text-ink transition-colors hover:border-cinnabar/40 hover:text-cinnabar"
                                        >
                                            {label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </footer>
                    ) : null}
                </div>
            </div>
        </main>
    );
}

function firstHeading(body: string): string | null {
    const m = body.match(/^#{1,3}\s+(.+)$/m);
    return m ? m[1].replace(/^春雪社\s*·\s*戲折\s*·\s*/, '').trim() : null;
}
