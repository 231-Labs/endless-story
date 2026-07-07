'use server';

/**
 * Upload a vault layout JSON blob to Walrus. Returns the blob id for
 * `chamber::save_layout` — the wallet signs that call client-side.
 */

import { blob } from '@endless-story/memwal';
import type { VaultLayoutBlob } from '@/lib/chamber/vault-layout';

export interface SaveVaultLayoutResult {
  ok: boolean;
  blobId?: string;
  error?: string;
}

export async function uploadVaultLayout(layout: VaultLayoutBlob): Promise<SaveVaultLayoutResult> {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(layout));
    const put = await blob.putBlob(bytes, {
      network: 'testnet',
      contentType: 'application/json',
      epochs: 30,
    });
    return { ok: true, blobId: put.blobId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
