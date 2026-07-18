'use client';

/**
 * 圖庫 — art management for the lab: character portraits, scene fan faces,
 * location oil panels. Assets are keyed by entity NAME, so one upload serves
 * every run of the same story; a run picks them up on its next live poll.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BeadCurtain, LabEaves } from '@/components/lab/LabOrnaments';
import { IconBack, IconBurn } from '@/components/lab/LabIcons';
import { labApi } from '@/components/lab/useLab';
import { sceneArtFor, terrainArtFor } from '@/components/saga/handscroll/terrainArt';
import { labAssetKeyFor, type LabSeedSummary } from '@/lib/lab/types';

type Kind = 'location' | 'scene' | 'character';

interface Entity {
    kind: Kind;
    name: string;
    hint?: string;
}

interface StoredAsset {
    kind: string;
    file: string;
    key: string;
    url: string;
}

const KIND_LABEL: Record<Kind, string> = { location: '地界', scene: '場景', character: '人物' };

export default function LabAssetsPage() {
    const [seeds, setSeeds] = useState<LabSeedSummary[]>([]);
    const [seedKey, setSeedKey] = useState<string | null>(null);
    const [entities, setEntities] = useState<Entity[]>([]);
    const [assets, setAssets] = useState<StoredAsset[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busyName, setBusyName] = useState<string | null>(null);

    const loadAssets = useCallback(async () => {
        const { assets } = await labApi.assets();
        setAssets(assets);
    }, []);

    useEffect(() => {
        void (async () => {
            try {
                const [{ seeds }] = await Promise.all([labApi.seeds(), loadAssets()]);
                setSeeds(seeds);
                // land on the fullest story, not the smoke-test stub
                const first = seeds.find((s) => s.castCount > 0) ?? seeds[0];
                if (first) setSeedKey(`${first.source}/${first.id}`);
                setError(null);
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
        })();
    }, [loadAssets]);

    // Entity roster comes from the chosen seed JSON (names are the asset keys).
    useEffect(() => {
        if (!seedKey) return;
        const [source, ...rest] = seedKey.split('/');
        void (async () => {
            try {
                const { json } = await labApi.seedText(source, rest.join('/'));
                const raw = JSON.parse(json) as {
                    locations?: Array<{ name: string; terrain?: string }>;
                    scenes?: Array<{ name: string }>;
                    founding_cast?: Array<{ name: string; role?: string }>;
                };
                setEntities([
                    ...(raw.locations ?? []).map((l): Entity => ({ kind: 'location', name: l.name, hint: l.terrain })),
                    ...(raw.scenes ?? []).map((s): Entity => ({ kind: 'scene', name: s.name })),
                    ...(raw.founding_cast ?? []).map((c): Entity => ({ kind: 'character', name: c.name, hint: c.role })),
                ]);
                setError(null);
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
        })();
    }, [seedKey]);

    const assetByKindKey = useMemo(() => {
        const m = new Map<string, StoredAsset>();
        for (const a of assets) m.set(`${a.kind}/${a.key}`, a);
        return m;
    }, [assets]);

    const upload = async (entity: Entity, file: File) => {
        setBusyName(entity.name);
        setError(null);
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(new Error('讀檔失敗'));
                reader.readAsDataURL(file);
            });
            await labApi.uploadAsset(entity.kind, entity.name, dataUrl);
            await loadAssets();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyName(null);
        }
    };

    const remove = async (asset: StoredAsset) => {
        setBusyName(asset.key);
        try {
            await labApi.deleteAsset(asset.kind, asset.file);
            await loadAssets();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyName(null);
        }
    };

    return (
        <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
            <header className="relative pt-5">
                <LabEaves />
                <BeadCurtain className="-mt-2 h-14 opacity-60" />
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                        <p className="es-page-lead-eyebrow">片場 · 圖庫</p>
                        <h1 className="font-serif text-2xl tracking-[0.18em] text-ink" title="以名為鍵：同名者，眾卷共用一圖。未上傳者以館藏畫作或紙面名款代之。">
                            人物與場景之圖
                        </h1>
                    </div>
                    <Link href="/lab" className="inline-flex items-center gap-1.5 font-serif text-2xs tracking-[0.3em] text-mute hover:text-cinnabar">
                        <IconBack /> 片場
                    </Link>
                </div>
                <nav className="mt-4 flex gap-1.5 overflow-x-auto no-scrollbar">
                    {seeds.map((s) => {
                        const key = `${s.source}/${s.id}`;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setSeedKey(key)}
                                title={`${s.source === 'custom' ? '自撰' : '館藏'} · ${s.id}`}
                                className={`shrink-0 rounded-full px-3.5 py-1.5 font-serif text-xs tracking-[0.2em] transition ${
                                    seedKey === key ? 'bg-cinnabar text-white' : 'text-mute hover:text-ink'
                                }`}
                            >
                                {s.label ?? s.id}
                                {s.source === 'custom' ? <span className="ml-1 opacity-70">·自撰</span> : null}
                            </button>
                        );
                    })}
                </nav>
            </header>

            {error ? <p className="mt-4 font-serif text-xs text-cinnabar" role="alert">{error}</p> : null}

            {(['location', 'scene', 'character'] as Kind[]).map((kind) => {
                const list = entities.filter((e) => e.kind === kind);
                if (!list.length) return null;
                return (
                    <section key={kind} className="mt-8">
                        <h2 className="font-serif text-sm tracking-[0.35em] text-cinnabar/90">{KIND_LABEL[kind]}</h2>
                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                            {list.map((entity) => {
                                let key: string;
                                try {
                                    key = labAssetKeyFor(entity.name);
                                } catch {
                                    return null;
                                }
                                const stored = assetByKindKey.get(`${entity.kind}/${key}`);
                                const builtin = entity.kind === 'location'
                                    ? terrainArtFor(entity.name)
                                    : entity.kind === 'scene'
                                        ? sceneArtFor(entity.name)
                                        : null;
                                const src = stored?.url ?? builtin ?? null;
                                const busy = busyName === entity.name || busyName === key;
                                return (
                                    <EntityCard
                                        key={`${entity.kind}/${entity.name}`}
                                        entity={entity}
                                        src={src}
                                        origin={stored ? 'custom' : builtin ? 'builtin' : 'none'}
                                        busy={busy}
                                        onUpload={(file) => void upload(entity, file)}
                                        onDelete={stored ? () => void remove(stored) : undefined}
                                    />
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </main>
    );
}

function EntityCard({
    entity,
    src,
    origin,
    busy,
    onUpload,
    onDelete,
}: {
    entity: Entity;
    src: string | null;
    origin: 'custom' | 'builtin' | 'none';
    busy: boolean;
    onUpload: (file: File) => void;
    onDelete?: () => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <div className="es-card group relative overflow-hidden p-0">
            <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                title={`為「${entity.name}」上圖（png/jpg/webp ≤6MB）${origin === 'builtin' ? '；現用館藏畫' : origin === 'custom' ? '；現用自上之圖' : ''}`}
                className="block aspect-square w-full overflow-hidden text-left"
            >
                {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={entity.name} className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.04] ${busy ? 'opacity-40' : ''}`} />
                ) : (
                    <span className="flex h-full w-full items-center justify-center bg-gradient-to-b from-surface to-canvas font-serif text-lg tracking-[0.2em] text-mute/70 dark:from-elevated/50">
                        {entity.name.slice(0, 2)}
                    </span>
                )}
            </button>
            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(file);
                    e.target.value = '';
                }}
            />
            <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <p className="min-w-0 truncate font-serif text-2xs tracking-[0.15em] text-ink/85" title={entity.hint ? `${entity.name} · ${entity.hint}` : entity.name}>
                    {origin === 'custom' ? <span className="mr-1 text-cinnabar" title="自上之圖">●</span> : null}
                    {entity.name}
                </p>
                {onDelete ? (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onDelete}
                        aria-label={`焚去「${entity.name}」之圖`}
                        title="焚去此圖（回落館藏／名款)"
                        className="shrink-0 text-mute/60 transition hover:text-cinnabar"
                    >
                        <IconBurn />
                    </button>
                ) : null}
            </div>
        </div>
    );
}
