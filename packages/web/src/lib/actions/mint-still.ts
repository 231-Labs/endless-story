'use server';

/**
 * Mint a 劇照 Still NFT from a character's event moment (B-lite economy).
 *
 * Storyteller-gated: the admin keypair holds the StorytellerCap, builds a PTB
 * (`still::mint_still` → transfer to recipient) and signs. The recipient then
 * owns a Kiosk-tradeable Still; hanging it in a chamber is just a placement
 * referencing it via `source_object` (no chamber.move change).
 *
 * Live: `still.move` + the bootstrapped `StillRegistry` (Tx 6.5) are both on
 * the current testnet deployment, so this mints for real. `recipient` (any
 * wallet) receives the Still and can trade it via Kiosk or hang it in a 藏閣.
 *
 * This is the FREE admin path: the troupe minting 劇照 for automation or as a
 * gift, with the admin covering gas and no charge to the recipient. The public
 * 設定集 collect button does NOT call this — fans self-mint and pay a fee via
 * `still::mint_still_paid` (see GalleryTab). Keep this for admin / automation /
 * gifting use; it has no UI affordance yet.
 */

import { Transaction } from '@mysten/sui/transactions';
import { tx as endlessTx, ENDLESS_STORY_DEPLOYMENT, findCreatedObjectId } from '@endless-story/sdk';
import { getAdminContext, execAdminTx } from '../chain/admin-signer.js';

export interface MintStillInput {
  /** character the moment belongs to (royalty target, follow-up). */
  characterId: string;
  /** Walrus blob id of the image — also the moment key for editioning. */
  walrusBlobId: string;
  /** resolved aggregator url for wallets/Display. */
  imageUrl: string;
  /** 題名, e.g. 「水袖那一夜」. */
  title: string;
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
  const registryId = d.stillRegistryId || process.env.STILL_REGISTRY_ID || '';
  if (!registryId) {
    return { ok: false, error: '缺 StillRegistry — 需要含 still.move 的部署 + bootstrap（Tx 6.5）。' };
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
      registry: registryId,
      characterId: input.characterId,
      walrusBlobId: input.walrusBlobId,
      imageUrl: input.imageUrl,
      title: input.title,
    }),
  );
  tx.transferObjects([still], input.recipient ?? admin.address);

  let result;
  try {
    result = await execAdminTx(admin, tx);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const stillId = findCreatedObjectId(result, '::still::Still');
  return { ok: true, stillId, digest: result.digest };
}
