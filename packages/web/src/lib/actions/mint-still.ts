'use server';

/**
 * Mint a 劇照 Still NFT from a character's event moment (B-lite economy).
 *
 * Storyteller-gated: the admin keypair holds the StorytellerCap, builds a PTB
 * (`still::mint_still` → transfer to recipient) and signs. The recipient then
 * owns a Kiosk-tradeable Still; hanging it in a chamber is just a placement
 * referencing it via `source_object` (no chamber.move change).
 *
 * NOTE: requires a deployment that includes `still.move` — on the current
 * testnet deployment (pre-still) this returns a FunctionNotFound error until
 * the next redeploy.
 */

import { Transaction } from '@mysten/sui/transactions';
import { tx as endlessTx, ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { getAdminContext } from '../chain/admin-signer.js';

export interface MintStillInput {
  /** character the moment belongs to (royalty target, follow-up). */
  characterId: string;
  /** Walrus blob id of the image (canonical). */
  walrusBlobId: string;
  /** resolved aggregator url for wallets/Display. */
  imageUrl: string;
  /** 題名, e.g. 「水袖那一夜」. */
  title: string;
  /** 1-based edition number. */
  edition?: number;
  /** recipient wallet; defaults to the admin (custodial until claimed). */
  recipient?: string;
}

export interface MintStillResult {
  ok: boolean;
  stillId?: string;
  digest?: string;
  error?: string;
}

export async function mintStillAction(input: MintStillInput): Promise<MintStillResult> {
  const d = ENDLESS_STORY_DEPLOYMENT;
  if (!d.packageId) return { ok: false, error: '合約尚未部署 — packageId 為空。' };
  if (!d.storytellerCapId || !d.sagaId) {
    return { ok: false, error: '世界尚未種子化 — 缺 storytellerCap / saga。' };
  }
  if (!input.characterId || !input.walrusBlobId || !input.title) {
    return { ok: false, error: '缺少 characterId / walrusBlobId / title。' };
  }

  let admin;
  try {
    admin = getAdminContext();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'admin keypair 載入失敗' };
  }

  const tx = new Transaction();
  const still = tx.add(
    endlessTx.still.mintStill({
      cap: d.storytellerCapId,
      saga: d.sagaId,
      characterId: input.characterId,
      walrusBlobId: input.walrusBlobId,
      imageUrl: input.imageUrl,
      title: input.title,
      edition: BigInt(input.edition ?? 1),
    }),
  );
  tx.transferObjects([still], input.recipient ?? admin.address);

  let result;
  try {
    result = await admin.client.signAndExecuteTransaction({
      transaction: tx,
      signer: admin.signer,
      options: { showEffects: true, showObjectChanges: true },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  let stillId: string | undefined;
  const changes = (result.objectChanges ?? []) as Array<{
    type: string;
    objectType?: string;
    objectId?: string;
  }>;
  for (const c of changes) {
    if (c.type === 'created' && c.objectType?.endsWith('::still::Still')) {
      stillId = c.objectId;
    }
  }
  return { ok: true, stillId, digest: result.digest };
}
