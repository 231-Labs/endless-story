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

export function readAssetFile(kind: AssetKind, file: string): { bytes: Buffer; mime: string } | null {
    if (!/^[^/\\]+\.(png|jpg|webp)$/.test(file) || file.includes('..')) return null;
    const ext = file.split('.').pop()!;
    try {
        return { bytes: fs.readFileSync(path.join(assetsDir(kind), file)), mime: MIME_BY_EXT[ext] };
    } catch {
        return null;
    }
}
