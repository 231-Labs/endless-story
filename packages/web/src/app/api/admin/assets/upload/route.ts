/**
 * Admin 影片/資產上傳代傳 — 瀏覽器 multipart → 此 route → asset 服務 `POST /api/assets`。
 * 密鑰(ASSET_SERVICE_SECRET / RELAYER_SECRET)只在 server 端,不進前端。
 *
 * ⚠️ Vercel serverless 請求 body 上限約 4.5MB。Hero loop 影片本來就該壓小(<4.5MB)。
 *    日後要傳大檔,改成「前端直傳 asset 服務 + 簽章授權」即可繞過 Vercel(另案)。
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function assetBase(): string {
  return (process.env.ASSET_SERVICE_URL ?? '').trim().replace(/\/$/, '');
}

export async function POST(req: Request): Promise<NextResponse> {
  const base = assetBase();
  if (!base) return NextResponse.json({ error: 'ASSET_SERVICE_URL 未設定' }, { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 });

  const category = String(form.get('category') ?? '').trim();
  const label = String(form.get('label') ?? '').trim();
  if (!category || !label) return NextResponse.json({ error: 'category 與 label 必填' }, { status: 400 });

  const qs = new URLSearchParams({ category, label });
  for (const k of ['epochs', 'deletable', 'meta'] as const) {
    const v = String(form.get(k) ?? '').trim();
    if (v) qs.set(k, v);
  }

  const secret = process.env.ASSET_SERVICE_SECRET ?? process.env.RELAYER_SECRET;
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const res = await fetch(`${base}/api/assets?${qs.toString()}`, {
      method: 'POST',
      headers: {
        'content-type': file.type || 'application/octet-stream',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: bytes,
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
