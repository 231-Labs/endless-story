'use server';

/**
 * 戲坊 Kiosk — admin mints + lists a Still; buyer purchases via wallet PTB.
 *
 * Curio 珍玩尚無鏈上 NFT → 仍走 demo-local。劇照在 chainReady 時走 Kiosk。
 */

import { Transaction } from '@mysten/sui/transactions';
import {
  ENDLESS_STORY_DEPLOYMENT,
  tx as endlessTx,
} from '@endless-story/sdk';
import { getAdminContext } from '@/lib/chain/admin-signer';
import {
  getShopChainStatus,
  shopKioskIds,
  suiToMist,
  type StillListingRef,
} from '@/lib/chamber/shop-kiosk-config';
import type { ShopWare } from '@/lib/chamber/shop-catalog';

export interface PrepareStillPurchaseInput {
  ware: Pick<
    ShopWare,
    'key' | 'kind' | 'title' | 'limit' | 'priceSui' | 'walrusBlobId' | 'imageUrl'
  >;
  characterId: string;
}

export type PrepareStillPurchaseResult =
  | { ok: true; mode: 'chain'; listing: StillListingRef }
  | { ok: true; mode: 'demo'; reason: string }
  | { ok: false; error: string; soldOut?: boolean };

export async function getShopChainStatusAction() {
  return getShopChainStatus();
}

function stillType(): string {
  const pkg = ENDLESS_STORY_DEPLOYMENT.latestPackageId || ENDLESS_STORY_DEPLOYMENT.packageId;
  return `${pkg}::still::Still`;
}

/** Admin PTB: optional edition cap → mint → place + list on 戲坊 Kiosk. */
export async function prepareStillPurchase(
  input: PrepareStillPurchaseInput,
): Promise<PrepareStillPurchaseResult> {
  const status = getShopChainStatus();
  if (!status.chainReady) {
    return {
      ok: true,
      mode: 'demo',
      reason: status.blockers[0] ?? '鏈上戲坊尚未就緒',
    };
  }

  const { ware, characterId } = input;
  if (ware.kind !== 'still') {
    return { ok: true, mode: 'demo', reason: '此品項尚無鏈上版次' };
  }
  if (!characterId.startsWith('0x')) {
    return { ok: false, error: '角色 ID 須為鏈上 object id 才能鑄造劇照。' };
  }
  const walrusBlobId = ware.walrusBlobId?.trim();
  const imageUrl = ware.imageUrl?.trim();
  if (!walrusBlobId || !imageUrl) {
    return { ok: true, mode: 'demo', reason: '此劇照缺少 Walrus 錨點，暫以本地入藏。' };
  }

  const kiosk = shopKioskIds()!;
  const { client, signer } = getAdminContext();
  const cap = ENDLESS_STORY_DEPLOYMENT.storytellerCapId;
  const saga = ENDLESS_STORY_DEPLOYMENT.sagaId;
  const registry = ENDLESS_STORY_DEPLOYMENT.stillRegistryId;
  const transferPolicyId = ENDLESS_STORY_DEPLOYMENT.stillTransferPolicyId;
  const priceMist = suiToMist(ware.priceSui);

  try {
    const tx = new Transaction();

    if (ware.limit === 1) {
      tx.add(
        endlessTx.still.setEditionLimit({
          cap,
          saga,
          registry,
          momentKey: walrusBlobId,
          limit: 1,
        }),
      );
    }

    const still = tx.add(
      endlessTx.still.mintStill({
        cap,
        saga,
        registry,
        characterId,
        walrusBlobId,
        imageUrl,
        title: ware.title,
      }),
    );

    endlessTx.still.placeAndList(tx, {
      kiosk: kiosk.kioskId,
      kioskCap: kiosk.kioskCapId,
      still,
      priceMist,
    });

    const res = await client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showObjectChanges: true, showEffects: true },
    });

    const full = await client.waitForTransaction({
      digest: res.digest,
      options: { showObjectChanges: true, showEffects: true },
    });

    if (full.effects?.status?.status !== 'success') {
      const err = full.effects?.status?.error ?? '鑄造上架失敗';
      if (/EEditionSoldOut|edition sold out/i.test(err)) {
        return { ok: false, error: '首演原件已售出', soldOut: true };
      }
      return { ok: false, error: err };
    }

    const type = stillType();
    const created = (full.objectChanges ?? []).find(
      (c) => c.type === 'created' && 'objectType' in c && c.objectType === type,
    );
    if (!created || !('objectId' in created)) {
      return { ok: false, error: '劇照物件未找到（mint 輸出解析失敗）' };
    }

    const listing: StillListingRef = {
      kioskId: kiosk.kioskId,
      stillId: created.objectId,
      priceMist: priceMist.toString(),
      transferPolicyId,
      title: ware.title,
    };

    return { ok: true, mode: 'chain', listing };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/EEditionSoldOut|edition sold out/i.test(msg)) {
      return { ok: false, error: '首演原件已售出', soldOut: true };
    }
    return { ok: false, error: msg };
  }
}
