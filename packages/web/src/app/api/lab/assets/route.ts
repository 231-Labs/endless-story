/** 圖庫 API: list / upload (data URL) / delete. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { deleteAsset, isAssetKind, listAssets, saveAsset } from '@/lib/lab/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        return ok({ assets: listAssets() });
    } catch (error) {
        return fail(error, 500);
    }
}

export async function POST(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const body = (await req.json()) as { kind?: string; name?: string; dataUrl?: string };
        if (!body.kind || !isAssetKind(body.kind)) return fail(new Error('kind must be character|scene|location'));
        if (!body.name?.trim() || !body.dataUrl) return fail(new Error('name and dataUrl are required'));
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
        const file = url.searchParams.get('file') ?? '';
        if (!isAssetKind(kind)) return fail(new Error('kind must be character|scene|location'));
        deleteAsset(kind, file);
        return ok({ deleted: file });
    } catch (error) {
        return fail(error);
    }
}
