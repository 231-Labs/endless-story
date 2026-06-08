'use server';

/**
 * Admin server actions — proxy to the self-hosted Walrus asset service
 * (docs/WALRUS_ASSETS.md; Zeabur, assets.zeabur.app). Secret stays server-side.
 *
 * Uploads (large files) go through the route handler `app/api/admin/assets/upload`,
 * NOT a server action (Next.js server action body defaults to 1MB; video must use the
 * route handler).
 *
 * env: `ASSET_SERVICE_URL` (= https://assets.<domain>), `ASSET_SERVICE_SECRET` (= the asset
 * service's RELAYER_SECRET; fallback RELAYER_SECRET).
 */

export type AssetCategory = 'hero-clip' | 'character-image' | 'scene-anchor' | 'chapter-text';
export type AssetStatus = 'live' | 'unpublished';

export interface AssetView {
  id: string;
  category: AssetCategory;
  label: string;
  blobId: string;
  suiObjectId: string;
  contentType: string;
  sizeBytes: number;
  deletable: boolean;
  status: AssetStatus;
  autoRenew: boolean;
  endEpoch: number;
  meta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  currentEpoch: number | null;
  epochsRemaining: number | null;
  expiresAt: string | null;
  expiringSoon: boolean;
}

export interface AssetListState {
  configured: boolean;
  assets: AssetView[];
  currentEpoch: number | null;
  error?: string;
}

export interface WalletState {
  configured: boolean;
  sui: number | null;
  wal: number | null;
  error?: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function assetBase(): string {
  return (process.env.ASSET_SERVICE_URL ?? '').trim().replace(/\/$/, '');
}

function assetHeaders(json = false): Record<string, string> {
  const secret = process.env.ASSET_SERVICE_SECRET ?? process.env.RELAYER_SECRET;
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    ...(secret ? { authorization: `Bearer ${secret}` } : {}),
  };
}

const TIMEOUT = 15_000;

export async function listAssetsAction(category?: AssetCategory): Promise<AssetListState> {
  const base = assetBase();
  if (!base) return { configured: false, assets: [], currentEpoch: null };
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  try {
    const res = await fetch(`${base}/api/assets${qs}`, {
      headers: assetHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return { configured: true, assets: [], currentEpoch: null, error: `${res.status} ${res.statusText}` };
    const body = (await res.json()) as { assets?: AssetView[]; currentEpoch?: number | null };
    return { configured: true, assets: body.assets ?? [], currentEpoch: body.currentEpoch ?? null };
  } catch (err) {
    return { configured: true, assets: [], currentEpoch: null, error: errMsg(err) };
  }
}

export async function getAssetWalletAction(): Promise<WalletState> {
  const base = assetBase();
  if (!base) return { configured: false, sui: null, wal: null };
  try {
    const res = await fetch(`${base}/api/assets/wallet`, {
      headers: assetHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return { configured: true, sui: null, wal: null, error: `${res.status} ${res.statusText}` };
    const body = (await res.json()) as { sui?: number | null; wal?: number | null };
    return { configured: true, sui: body.sui ?? null, wal: body.wal ?? null };
  } catch (err) {
    return { configured: true, sui: null, wal: null, error: errMsg(err) };
  }
}

export async function extendAssetAction(id: string, epochs: number): Promise<ActionResult> {
  return mutate(`/api/assets/${encodeURIComponent(id)}/extend`, 'POST', { epochs });
}

export async function patchAssetAction(
  id: string,
  patch: { status?: AssetStatus; autoRenew?: boolean; label?: string },
): Promise<ActionResult> {
  return mutate(`/api/assets/${encodeURIComponent(id)}`, 'PATCH', patch);
}

export async function deleteAssetAction(id: string): Promise<ActionResult> {
  return mutate(`/api/assets/${encodeURIComponent(id)}`, 'DELETE');
}

async function mutate(path: string, method: string, body?: unknown): Promise<ActionResult> {
  const base = assetBase();
  if (!base) return { ok: false, error: 'ASSET_SERVICE_URL 未設定' };
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: assetHeaders(body != null),
      ...(body != null ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `${res.status} ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
