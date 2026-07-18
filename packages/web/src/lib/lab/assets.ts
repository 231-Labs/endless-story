/**
 * 圖庫 — the lab's art asset store: character portraits, scene fan faces,
 * location oil panels. Filesystem-only, keyed by entity NAME (seeds refer to
 * entities by name, and forked runs keep names), so one upload serves every
 * run of the same story.
 *
 *   $LAB_DATA_DIR/assets/<kind>/<name>.<png|jpg|webp>
 *
 * Resolution order in the UI: lab asset → name-matched built-in art
 * (`terrainArt.ts` regex library) → paper/medallion fallback.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureDir, labDataDir } from './paths';
import { labAssetKeyFor } from './types';

export type AssetKind = 'character' | 'scene' | 'location';

const KINDS: AssetKind[] = ['character', 'scene', 'location'];
const EXTS = ['png', 'jpg', 'webp'] as const;
const MAX_BYTES = 6 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    webp: 'image/webp',
};

export function assetsDir(kind: AssetKind): string {
    return path.join(labDataDir(), 'assets', kind);
}

export function isAssetKind(value: string): value is AssetKind {
    return (KINDS as string[]).includes(value);
}

/** Entity names are CJK-friendly; strip only what the filesystem cannot hold. */
export const assetKeyFor = labAssetKeyFor;

/** Public URL for an entity's uploaded art, or undefined when none exists. */
export function assetUrlFor(kind: AssetKind, name: string): string | undefined {
    let key: string;
    try {
        key = assetKeyFor(name);
    } catch {
        return undefined;
    }
    for (const ext of EXTS) {
        const file = `${key}.${ext}`;
        if (fs.existsSync(path.join(assetsDir(kind), file))) {
            return `/api/lab/assets/file/${kind}/${encodeURIComponent(file)}`;
        }
    }
    return undefined;
}

export interface StoredAsset {
    kind: AssetKind;
    file: string;
    key: string;
    url: string;
    bytes: number;
}

export function listAssets(): StoredAsset[] {
    const out: StoredAsset[] = [];
    for (const kind of KINDS) {
        let files: string[];
        try {
            files = fs.readdirSync(assetsDir(kind));
        } catch {
            continue;
        }
        for (const file of files) {
            const ext = file.split('.').pop() ?? '';
            if (!MIME_BY_EXT[ext]) continue;
            const stat = fs.statSync(path.join(assetsDir(kind), file));
            out.push({
                kind,
                file,
                key: file.slice(0, -(ext.length + 1)),
                url: `/api/lab/assets/file/${kind}/${encodeURIComponent(file)}`,
                bytes: stat.size,
            });
        }
    }
    return out;
}

/** Decode a data-URL upload, validate type + size, store under the entity name. */
export function saveAsset(kind: AssetKind, name: string, dataUrl: string): StoredAsset {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl);
    if (!match) throw new Error('upload must be a png/jpeg/webp data URL');
    const ext = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length) throw new Error('empty image');
    if (bytes.length > MAX_BYTES) throw new Error(`image too large (>${Math.round(MAX_BYTES / 1024 / 1024)}MB)`);
    const key = assetKeyFor(name);
    ensureDir(assetsDir(kind));
    // one art per entity: replace any other extension variant
    for (const other of EXTS) {
        const stale = path.join(assetsDir(kind), `${key}.${other}`);
        if (other !== ext && fs.existsSync(stale)) fs.rmSync(stale);
    }
    const file = `${key}.${ext}`;
    fs.writeFileSync(path.join(assetsDir(kind), file), bytes);
    return {
        kind,
        file,
        key,
        url: `/api/lab/assets/file/${kind}/${encodeURIComponent(file)}`,
        bytes: bytes.length,
    };
}

export function deleteAsset(kind: AssetKind, file: string): void {
    if (!/^[^/\\]+\.(png|jpg|webp)$/.test(file) || file.includes('..')) throw new Error(`invalid asset file: ${file}`);
    fs.rmSync(path.join(assetsDir(kind), file), { force: true });
}

// ── 描述 sidecar（<key>.txt）— 圖庫可改人物/場景/地界的展示描述 ─────────────

export function assetNoteFor(kind: AssetKind, name: string): string | undefined {
    try {
        const text = fs.readFileSync(path.join(assetsDir(kind), `${assetKeyFor(name)}.txt`), 'utf8').trim();
        return text || undefined;
    } catch {
        return undefined;
    }
}

export function saveAssetNote(kind: AssetKind, name: string, note: string): void {
    const key = assetKeyFor(name);
    const file = path.join(assetsDir(kind), `${key}.txt`);
    const trimmed = note.trim();
    if (!trimmed) {
        fs.rmSync(file, { force: true });
        return;
    }
    if (trimmed.length > 2000) throw new Error('描述太長（>2000 字）');
    ensureDir(assetsDir(kind));
    fs.writeFileSync(file, `${trimmed}\n`, 'utf8');
}

export function listAssetNotes(): Array<{ kind: AssetKind; key: string; note: string }> {
    const out: Array<{ kind: AssetKind; key: string; note: string }> = [];
    for (const kind of KINDS) {
        let files: string[];
        try {
            files = fs.readdirSync(assetsDir(kind));
        } catch {
            continue;
        }
        for (const file of files) {
            if (!file.endsWith('.txt')) continue;
            const note = fs.readFileSync(path.join(assetsDir(kind), file), 'utf8').trim();
            if (note) out.push({ kind, key: file.slice(0, -'.txt'.length), note });
        }
    }
    return out;
}

// ── 多媒體 gallery（<kind>/<key>-gallery/）— 多張圖 + 影片 ────────────────────

const GALLERY_MIME: Record<string, string> = {
    ...MIME_BY_EXT,
    mp4: 'video/mp4',
    webm: 'video/webm',
};
const MAX_VIDEO_BYTES = 48 * 1024 * 1024;

function galleryDir(kind: AssetKind, key: string): string {
    return path.join(assetsDir(kind), `${key}-gallery`);
}

export interface GalleryItem {
    file: string;
    url: string;
    type: 'image' | 'video';
    bytes: number;
}

export function listGallery(kind: AssetKind, name: string): GalleryItem[] {
    let key: string;
    try {
        key = assetKeyFor(name);
    } catch {
        return [];
    }
    let files: string[];
    try {
        files = fs.readdirSync(galleryDir(kind, key));
    } catch {
        return [];
    }
    return files
        .filter((file) => GALLERY_MIME[file.split('.').pop() ?? ''])
        .sort()
        .map((file) => {
            const ext = file.split('.').pop()!;
            return {
                file,
                url: `/api/lab/assets/gallery?kind=${kind}&key=${encodeURIComponent(key)}&file=${encodeURIComponent(file)}`,
                type: ext === 'mp4' || ext === 'webm' ? 'video' as const : 'image' as const,
                bytes: fs.statSync(path.join(galleryDir(kind, key), file)).size,
            };
        });
}

export function addGalleryItem(kind: AssetKind, name: string, dataUrl: string): GalleryItem {
    const match = /^data:(image\/(?:png|jpeg|webp)|video\/(?:mp4|webm));base64,(.+)$/s.exec(dataUrl);
    if (!match) throw new Error('gallery upload must be png/jpeg/webp/mp4/webm data URL');
    const mime = match[1];
    const ext = mime === 'image/png' ? 'png'
        : mime === 'image/webp' ? 'webp'
            : mime === 'image/jpeg' ? 'jpg'
                : mime === 'video/mp4' ? 'mp4' : 'webm';
    const isVideo = mime.startsWith('video/');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length) throw new Error('empty media');
    const cap = isVideo ? MAX_VIDEO_BYTES : MAX_BYTES;
    if (bytes.length > cap) throw new Error(`media too large (>${Math.round(cap / 1024 / 1024)}MB)`);
    const key = assetKeyFor(name);
    ensureDir(galleryDir(kind, key));
    const file = `g${Date.now().toString(36)}.${ext}`;
    fs.writeFileSync(path.join(galleryDir(kind, key), file), bytes);
    return {
        file,
        url: `/api/lab/assets/gallery?kind=${kind}&key=${encodeURIComponent(key)}&file=${encodeURIComponent(file)}`,
        type: isVideo ? 'video' : 'image',
        bytes: bytes.length,
    };
}

export function deleteGalleryItem(kind: AssetKind, key: string, file: string): void {
    if (!/^[^/\\]+\.(png|jpg|webp|mp4|webm)$/.test(file) || file.includes('..') || key.includes('..') || /[/\\]/.test(key)) {
        throw new Error(`invalid gallery ref: ${key}/${file}`);
    }
    fs.rmSync(path.join(galleryDir(kind, key), file), { force: true });
}

export function readGalleryFile(kind: AssetKind, key: string, file: string): { bytes: Buffer; mime: string } | null {
    if (!/^[^/\\]+\.(png|jpg|webp|mp4|webm)$/.test(file) || file.includes('..') || key.includes('..') || /[/\\]/.test(key)) return null;
    const ext = file.split('.').pop()!;
    try {
        return { bytes: fs.readFileSync(path.join(galleryDir(kind, key), file)), mime: GALLERY_MIME[ext] };
    } catch {
        return null;
    }
}

export function readAssetFile(kind: AssetKind, file: string): { bytes: Buffer; mime: string } | null {
    if (!/^[^/\\]+\.(png|jpg|webp)$/.test(file) || file.includes('..')) return null;
    const ext = file.split('.').pop()!;
    try {
        return { bytes: fs.readFileSync(path.join(assetsDir(kind), file)), mime: MIME_BY_EXT[ext] };
    } catch {
        return null;
    }
}
