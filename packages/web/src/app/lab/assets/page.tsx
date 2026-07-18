'use client';

/**
 * 圖庫 — art + words for the world's faces: character portraits, scene fan
 * faces, location oil panels, per-entity 描述 override, and per-character
 * multimedia gallery (many images + video clips). Everything keyed by entity
 * NAME, so one upload serves every run of the same story.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconBurn } from '@/components/lab/LabIcons';
import { LabPageHeader } from '@/components/lab/LabPageHeader';
import { useLabDialog } from '@/components/lab/LabDialog';
import { labApi } from '@/components/lab/useLab';
import { useToast } from '@/components/common/Toaster';
import { sceneArtFor, terrainArtFor } from '@/components/saga/handscroll/terrainArt';
import { labAssetKeyFor, type LabSeedSummary } from '@/lib/lab/types';

type Kind = 'location' | 'scene' | 'character';

interface Entity {
    kind: Kind;
    name: string;
    hint?: string;
    /** 劇本原描述 —— 「述」對話盒以此打底，改起來不用從零。 */
    desc?: string;
}

interface StoredAsset {
    kind: string;
    file: string;
    key: string;
    url: string;
}

const KIND_LABEL: Record<Kind, string> = { location: '地界', scene: '場景', character: '人物' };

const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'];
const VIDEO_MIME = ['video/mp4', 'video/webm'];
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_BYTES = 48 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('讀檔失敗'));
        reader.readAsDataURL(file);
    });
}

export default function LabAssetsPage() {
    const dialog = useLabDialog();
    const toast = useToast();
    const [seeds, setSeeds] = useState<LabSeedSummary[]>([]);
    const [seedKey, setSeedKey] = useState<string | null>(null);
    const [entities, setEntities] = useState<Entity[]>([]);
    const [assets, setAssets] = useState<StoredAsset[]>([]);
    const [notes, setNotes] = useState<Array<{ kind: string; key: string; note: string }>>([]);
    const [error, setError] = useState<string | null>(null);
    const [busyName, setBusyName] = useState<string | null>(null);

    const loadAssets = useCallback(async () => {
        const { assets, notes } = await labApi.assets();
        setAssets(assets);
        setNotes(notes);
    }, []);

    // 頁面層擋掉瀏覽器預設：拖檔落在卡外不要整頁跳圖
    useEffect(() => {
        const prevent = (e: DragEvent) => e.preventDefault();
        window.addEventListener('dragover', prevent);
        window.addEventListener('drop', prevent);
        return () => {
            window.removeEventListener('dragover', prevent);
            window.removeEventListener('drop', prevent);
        };
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
                    locations?: Array<{ name: string; terrain?: string; description?: string }>;
                    scenes?: Array<{ name: string; description?: string }>;
                    founding_cast?: Array<{ name: string; role?: string; description?: string }>;
                };
                setEntities([
                    ...(raw.locations ?? []).map((l): Entity => ({ kind: 'location', name: l.name, hint: l.terrain, desc: l.description })),
                    ...(raw.scenes ?? []).map((s): Entity => ({ kind: 'scene', name: s.name, desc: s.description })),
                    ...(raw.founding_cast ?? []).map((c): Entity => ({ kind: 'character', name: c.name, hint: c.role, desc: c.description })),
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
    const noteByKindKey = useMemo(() => {
        const m = new Map<string, string>();
        for (const n of notes) m.set(`${n.kind}/${n.key}`, n.note);
        return m;
    }, [notes]);

    const upload = async (entity: Entity, file: File) => {
        setBusyName(entity.name);
        setError(null);
        try {
            await labApi.uploadAsset(entity.kind, entity.name, await readFileAsDataUrl(file));
            await loadAssets();
            toast(`「${entity.name}」之圖已上。`, 'success');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyName(null);
        }
    };

    const removePrimary = async (entity: Entity, asset: StoredAsset) => {
        const ok = await dialog.confirm({
            title: `焚去「${entity.name}」之圖？`,
            body: '焚後回落館藏畫作或名款。',
            confirmLabel: '焚',
            danger: true,
        });
        if (!ok) return;
        setBusyName(entity.name);
        try {
            await labApi.deleteAsset(asset.kind, asset.file);
            await loadAssets();
            toast('已焚。', 'info');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyName(null);
        }
    };

    const editNote = async (entity: Entity, currentNote: string | undefined) => {
        const note = await dialog.prompt({
            title: `「${entity.name}」的描述`,
            body: currentNote
                ? '現用自撰之述（已帶入）；改後定稿，清空即回落劇本原文。'
                : '劇本原文已帶入打底 —— 就地增刪即可；清空定稿即回落原文。',
            defaultValue: currentNote ?? entity.desc ?? '',
            multiline: true,
            confirmLabel: '定稿',
        });
        if (note === null) return; // 取消 —— 一字不動；清空定稿才回落原文
        setBusyName(entity.name);
        try {
            await labApi.saveAssetNote(entity.kind, entity.name, note);
            await loadAssets();
            toast(note ? '描述已定。' : '描述已清，回落原文。', 'success');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyName(null);
        }
    };

    const manageGallery = async (entity: Entity, galleryInput: HTMLInputElement | null) => {
        try {
            const { gallery } = await labApi.gallery(entity.kind, entity.name);
            if (!gallery.length) {
                galleryInput?.click();
                return;
            }
            const picked = await dialog.choose({
                title: `「${entity.name}」的影像 · ${gallery.length} 件`,
                options: [
                    { key: '__add__', label: '＋ 添新影像', hint: '多張圖（≤6MB）或影片 mp4/webm（≤48MB）' },
                    ...gallery.map((g) => ({
                        key: g.file,
                        label: `焚去 ${g.type === 'video' ? '影' : '圖'} · ${g.file}`,
                    })),
                ],
            });
            if (picked === '__add__') {
                galleryInput?.click();
            } else if (picked) {
                await labApi.deleteGalleryItem(entity.kind, labAssetKeyFor(entity.name), picked);
                toast('影像已焚。', 'info');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const uploadGallery = async (entity: Entity, file: File) => {
        setBusyName(entity.name);
        try {
            await labApi.addGalleryItem(entity.kind, entity.name, await readFileAsDataUrl(file));
            toast(`「${entity.name}」影像已添。`, 'success');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyName(null);
        }
    };

    /** 拖入美術集：整批逐件上傳，不合規者略過並各自報一聲。 */
    const dropGallery = async (entity: Entity, files: File[]) => {
        setBusyName(entity.name);
        let added = 0;
        try {
            for (const f of files) {
                const isImage = IMAGE_MIME.includes(f.type);
                const isVideo = VIDEO_MIME.includes(f.type);
                if (!isImage && !isVideo) {
                    toast(`「${f.name}」非圖非影（收 png/jpg/webp、mp4/webm），略過。`, 'error');
                    continue;
                }
                if (isImage && f.size > MAX_IMAGE_BYTES) {
                    toast(`「${f.name}」逾 6MB，略過。`, 'error');
                    continue;
                }
                if (isVideo && f.size > MAX_VIDEO_BYTES) {
                    toast(`「${f.name}」逾 48MB，略過。`, 'error');
                    continue;
                }
                await labApi.addGalleryItem(entity.kind, entity.name, await readFileAsDataUrl(f));
                added += 1;
            }
            if (added) toast(`「${entity.name}」美術集已添 ${added} 件。`, 'success');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyName(null);
        }
    };

    /** 拖入肖像：取第一張合規的圖；人物卡上多拖的其餘檔順手入美術集。 */
    const dropPortrait = async (entity: Entity, files: File[]) => {
        const img = files.find((f) => IMAGE_MIME.includes(f.type) && f.size <= MAX_IMAGE_BYTES);
        if (!img) {
            toast('肖像只收圖（png/jpg/webp ≤6MB）。', 'error');
            return;
        }
        await upload(entity, img);
        const rest = files.filter((f) => f !== img);
        if (rest.length && entity.kind === 'character') await dropGallery(entity, rest);
    };

    return (
        <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
            <LabPageHeader
                eyebrow="片場 · 圖庫"
                title="人物與場景之圖"
                titleTip="以名為鍵：同名者，眾卷共用一圖一述。未上傳者以館藏畫作或紙面名款代之。自本機拖檔入卡即上 —— 人物卡上落肖像、下落美術集（可整批）。"
                backHref="/lab"
            >
                <p className="mt-1 font-serif text-2xs tracking-[0.2em] text-mute/70">
                    自本機拖檔入卡即上 —— 人物卡上落肖像、下落美術集（可整批）
                </p>
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
            </LabPageHeader>

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
                                const note = noteByKindKey.get(`${entity.kind}/${key}`);
                                const builtin = entity.kind === 'location'
                                    ? terrainArtFor(entity.name)
                                    : entity.kind === 'scene'
                                        ? sceneArtFor(entity.name)
                                        : null;
                                return (
                                    <EntityCard
                                        key={`${entity.kind}/${entity.name}`}
                                        entity={entity}
                                        src={stored?.url ?? builtin ?? null}
                                        origin={stored ? 'custom' : builtin ? 'builtin' : 'none'}
                                        hasNote={Boolean(note)}
                                        busy={busyName === entity.name}
                                        onUpload={(file) => void upload(entity, file)}
                                        onDelete={stored ? () => void removePrimary(entity, stored) : undefined}
                                        onEditNote={() => void editNote(entity, note)}
                                        onManageGallery={entity.kind === 'character' ? (input) => void manageGallery(entity, input) : undefined}
                                        onUploadGallery={(file) => void uploadGallery(entity, file)}
                                        onDropPortrait={(files) => void dropPortrait(entity, files)}
                                        onDropGallery={entity.kind === 'character' ? (files) => void dropGallery(entity, files) : undefined}
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
    hasNote,
    busy,
    onUpload,
    onDelete,
    onEditNote,
    onManageGallery,
    onUploadGallery,
    onDropPortrait,
    onDropGallery,
}: {
    entity: Entity;
    src: string | null;
    origin: 'custom' | 'builtin' | 'none';
    hasNote: boolean;
    busy: boolean;
    onUpload: (file: File) => void;
    onDelete?: () => void;
    onEditNote: () => void;
    onManageGallery?: (galleryInput: HTMLInputElement | null) => void;
    onUploadGallery: (file: File) => void;
    onDropPortrait: (files: File[]) => void;
    /** 有此者（人物卡）拖入時分上下兩落點：肖像／美術集。 */
    onDropGallery?: (files: File[]) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    // 拖入計數（enter/leave 在子元素間穿梭會連發，計數歸零才真離開）
    const [dragDepth, setDragDepth] = useState(0);
    const [dropZone, setDropZone] = useState<'portrait' | 'gallery'>('portrait');
    const dragging = dragDepth > 0;
    const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
    return (
        <div
            className="group relative overflow-hidden rounded-xl bg-surface/70 shadow-[0_2px_16px_rgba(20,12,8,0.14)] transition-shadow duration-300 hover:shadow-[0_4px_22px_rgba(20,12,8,0.22)] dark:bg-elevated/40"
            onDragEnter={(e) => {
                if (!hasFiles(e)) return;
                e.preventDefault();
                setDragDepth((d) => d + 1);
            }}
            onDragOver={(e) => {
                if (hasFiles(e)) e.preventDefault();
            }}
            onDragLeave={(e) => {
                if (!hasFiles(e)) return;
                setDragDepth((d) => Math.max(0, d - 1));
            }}
            onDrop={(e) => {
                if (!hasFiles(e)) return;
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files);
                const zone = dropZone;
                setDragDepth(0);
                setDropZone('portrait');
                if (!files.length || busy) return;
                if (onDropGallery && zone === 'gallery') onDropGallery(files);
                else onDropPortrait(files);
            }}
        >
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
            <input
                ref={galleryInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadGallery(file);
                    e.target.value = '';
                }}
            />
            <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <p className="min-w-0 truncate font-serif text-2xs tracking-[0.15em] text-ink/85" title={entity.hint ? `${entity.name} · ${entity.hint}` : entity.name}>
                    {origin === 'custom' ? <span className="mr-1 text-cinnabar" title="自上之圖">●</span> : null}
                    {entity.name}
                </p>
                <span className="flex shrink-0 items-center gap-1.5">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onEditNote}
                        aria-label={`改「${entity.name}」的描述`}
                        title={hasNote ? '描述（已自撰）' : '描述（現用劇本原文）'}
                        className={`font-serif text-2xs tracking-[0.1em] transition ${hasNote ? 'text-cinnabar' : 'text-mute/60 hover:text-cinnabar'}`}
                    >
                        述
                    </button>
                    {onManageGallery ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => onManageGallery(galleryInputRef.current)}
                            aria-label={`「${entity.name}」的多媒體影像`}
                            title="多媒體：多張圖＋影片（人物內頁展示）"
                            className="font-serif text-2xs tracking-[0.1em] text-mute/60 transition hover:text-cinnabar"
                        >
                            影
                        </button>
                    ) : null}
                    {onDelete ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onDelete}
                            aria-label={`焚去「${entity.name}」之圖`}
                            title="焚去此圖（回落館藏／名款）"
                            className="text-mute/60 transition hover:text-cinnabar"
                        >
                            <IconBurn />
                        </button>
                    ) : null}
                </span>
            </div>

            {/* 拖入落點紗 —— 人物卡分上下（肖像／美術集），其餘整卡換圖 */}
            {dragging ? (
                <div className="absolute inset-0 z-10 flex flex-col bg-canvas/75 backdrop-blur-sm">
                    <div
                        onDragOver={() => setDropZone('portrait')}
                        className={`flex flex-1 items-center justify-center font-serif text-sm tracking-[0.35em] transition ${
                            dropZone === 'portrait' ? 'bg-cinnabar/20 text-cinnabar' : 'text-mute'
                        }`}
                    >
                        {onDropGallery ? '肖像' : '上圖'}
                    </div>
                    {onDropGallery ? (
                        <div
                            onDragOver={() => setDropZone('gallery')}
                            className={`flex flex-1 items-center justify-center font-serif text-sm tracking-[0.35em] transition ${
                                dropZone === 'gallery' ? 'bg-jade/20 text-jade' : 'text-mute'
                            }`}
                        >
                            美術集
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
