'use server';

/**
 * Admin server actions — proxy to the self-hosted Walrus asset service
 * (docs/narrative/ASSET_MANAGEMENT.md; Zeabur, assets.zeabur.app). Secret stays server-side.
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

// Result of a manual auto-renewal sweep (POST /api/assets/renew-due). Arrays from the
// service are flattened to counts for the admin toast.
export interface RenewSweepResult {
  ok: boolean;
  configured: boolean;
  note?: string;
  walletBlocked?: boolean;
  dueCount?: number;
  renewedCount?: number;
  failedCount?: number;
  skippedCount?: number;
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
// A sweep does on-chain `walrus extend` calls; give it more room than a plain read.
// Big backlogs should rely on the service's own interval sweeper, not this button.
const RENEW_TIMEOUT = 120_000;

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

/** Trigger an auto-renewal sweep now (same logic the service runs on its interval). */
export async function renewDueAction(): Promise<RenewSweepResult> {
  const base = assetBase();
  if (!base) return { ok: false, configured: false, error: 'ASSET_SERVICE_URL 未設定' };
  try {
    const res = await fetch(`${base}/api/assets/renew-due`, {
      method: 'POST',
      headers: assetHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(RENEW_TIMEOUT),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      note?: string;
      walletBlocked?: boolean;
      dueCount?: number;
      renewed?: unknown[];
      failed?: unknown[];
      skipped?: unknown[];
    };
    if (!res.ok) {
      return { ok: false, configured: true, error: body.error ?? `${res.status} ${res.statusText}` };
    }
    return {
      ok: true,
      configured: true,
      note: body.note,
      walletBlocked: body.walletBlocked,
      dueCount: body.dueCount ?? 0,
      renewedCount: body.renewed?.length ?? 0,
      failedCount: body.failed?.length ?? 0,
      skippedCount: body.skipped?.length ?? 0,
    };
  } catch (err) {
    return { ok: false, configured: true, error: errMsg(err) };
  }
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
      let msg = text.slice(0, 200);
      try {
        const j = JSON.parse(text) as { error?: string };
        if (j?.error) msg = j.error; // surface the service's friendly message, not raw JSON
      } catch {
        /* not JSON — keep the raw text */
      }
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
