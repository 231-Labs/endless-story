/** 圖庫 API: list（含描述/多媒體）/ 上圖 / 描述 / gallery / delete. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import {
    addGalleryItem,
    deleteAsset,
    deleteGalleryItem,
    isAssetKind,
    listAssetNotes,
    listAssets,
    listGallery,
    saveAsset,
    saveAssetNote,
} from '@/lib/lab/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const url = new URL(req.url);
        const galleryKind = url.searchParams.get('galleryKind');
        const galleryName = url.searchParams.get('galleryName');
        if (galleryKind && galleryName) {
            if (!isAssetKind(galleryKind)) return fail(new Error('bad kind'));
            return ok({ gallery: listGallery(galleryKind, galleryName) });
        }
        return ok({ assets: listAssets(), notes: listAssetNotes() });
    } catch (error) {
        return fail(error, 500);
    }
}

export async function POST(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const body = (await req.json()) as {
            kind?: string;
            name?: string;
            dataUrl?: string;
            note?: string;
            galleryDataUrl?: string;
        };
        if (!body.kind || !isAssetKind(body.kind)) return fail(new Error('kind must be character|scene|location'));
        if (!body.name?.trim()) return fail(new Error('name is required'));
        if (body.galleryDataUrl) return ok({ added: addGalleryItem(body.kind, body.name, body.galleryDataUrl) }, 201);
        if (body.note !== undefined) {
            saveAssetNote(body.kind, body.name, body.note);
            return ok({ noted: body.name });
        }
        if (!body.dataUrl) return fail(new Error('dataUrl / note / galleryDataUrl — one of them is required'));
        return ok({ saved: saveAsset(body.kind, body.name, body.dataUrl) }, 201);
    } catch (error) {
        return fail(error);
    }
}

export async function DELETE(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const url = new URL(req.url);
        const kind = url.searchParams.get('kind') ?? '';
        if (!isAssetKind(kind)) return fail(new Error('kind must be character|scene|location'));
        const galleryKey = url.searchParams.get('galleryKey');
        const galleryFile = url.searchParams.get('galleryFile');
        if (galleryKey && galleryFile) {
            deleteGalleryItem(kind, galleryKey, galleryFile);
            return ok({ deleted: `${galleryKey}/${galleryFile}` });
        }
        const file = url.searchParams.get('file') ?? '';
        deleteAsset(kind, file);
        return ok({ deleted: file });
    } catch (error) {
        return fail(error);
    }
}
