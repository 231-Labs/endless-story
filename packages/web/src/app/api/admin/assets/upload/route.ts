/**
 * Admin video/asset upload proxy — browser multipart → this route → asset service `POST /api/assets`.
 * Secrets (ASSET_SERVICE_SECRET / RELAYER_SECRET) stay server-side, never reach the frontend.
 *
 * ⚠️ Vercel serverless request body cap is ~4.5MB. Hero loop videos should be small anyway (<4.5MB).
 *    To upload larger files later, switch to "frontend direct-upload to asset service + signed auth" to bypass Vercel (separate task).
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
