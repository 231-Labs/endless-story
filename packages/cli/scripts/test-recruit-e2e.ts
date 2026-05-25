/**
 * Phase 2.3 acceptance — pure-cli end-to-end recruit flow against a live chain.
 *
 * Exercises the contract path WITHOUT the LLM / wizard layer, so any failure
 * here is a contract / sdk / bootstrap issue and NOT a web issue.
 *
 * Sequence:
 *   1. Faucet drip → admin gets ENDLESS coins
 *   2. Mint a GenesisVoucher with no_requirements (admin = both payer + storyteller)
 *   3. HKDF-roll attributes from voucher.attribute_seed
 *   4. Redeem voucher → Character + OwnerCap + ControlCap (admin holds all)
 *   5. Print the Character object id for explorer inspection
 *
 * Usage:
 *   pnpm --filter @endless-story/cli test-e2e --env devnet
 *
 * Flags:
 *   --env devnet|testnet|mainnet|localnet  (required, must match deployment)
 *   --skip-drip                            (assume faucet drip already done)
 */
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import {
  ENDLESS_STORY_DEPLOYMENT,
  makeSuiClient,
  tx as endlessTx,
  type SuiNetwork,
} from '@endless-story/sdk';
import { loadKeypair } from '@endless-story/sdk/node';
import { generateAttributeSeed, rollAttributesFromSeed } from '@endless-story/llm/seed';
import type { AttributeKey } from '@endless-story/llm/prompts';
import { hasFlag, requireFlag } from '../src/lib/flags';

const VALID_NETWORKS: ReadonlySet<SuiNetwork> = new Set(['devnet', 'testnet', 'mainnet', 'localnet']);

const SCHEMA: AttributeKey[] = [
  { key: 'appearance', label: '外貌', min: 0, max: 100 },
  { key: 'constitution', label: '筋骨', min: 0, max: 100 },
  { key: 'acuity', label: '機敏', min: 0, max: 100 },
  { key: 'disposition', label: '心性', min: 0, max: 100 },
];

const VOUCHER_TTL_MS = 24n * 60n * 60n * 1000n; // 24h

interface ObjectChange {
  type: string;
  objectType?: string;
  objectId?: string;
}

function findCreated(changes: ObjectChange[], typeSuffix: string): string[] {
  return changes
    .filter((c): c is ObjectChange => c.type === 'created' && !!c.objectId && !!c.objectType)
    .filter((c) => c.objectType!.endsWith(typeSuffix))
    .map((c) => c.objectId!);
}

async function main() {
  const env = requireFlag('--env') as SuiNetwork;
  if (!VALID_NETWORKS.has(env)) {
    throw new Error(`--env must be one of ${[...VALID_NETWORKS].join(' / ')}`);
  }
  const skipDrip = hasFlag('--skip-drip');

  const d = ENDLESS_STORY_DEPLOYMENT;
  if (!d.packageId) throw new Error('not deployed');
  if (!d.sagaId || !d.worldId || !d.faucetId || !d.storytellerCapId) {
    throw new Error('bootstrap incomplete — missing saga / world / faucet / storytellerCap');
  }
  if (d.network !== env) throw new Error(`network mismatch: deployment=${d.network} --env=${env}`);

  const signer = loadKeypair(0);
  const admin = signer.toSuiAddress();
  const client = makeSuiClient({ network: env });

  console.log('endless-story · Phase 2.3 e2e test');
  console.log(`   admin    ${admin}`);
  console.log(`   saga     ${d.sagaId}`);
  console.log(`   scene[0] ${d.sceneIds[0]}`);

  // ═══════════════════════════════════════════════════════════════════
  // Step 1: drip
  // ═══════════════════════════════════════════════════════════════════
  if (!skipDrip) {
    console.log('\n[step 1] drip ENDLESS from faucet…');
    const tx = new Transaction();
    tx.add(endlessTx.faucet.drip({ faucet: d.faucetId }));
    const res = await client.signAndExecuteTransaction({
      transaction: tx,
      signer,
      options: { showEffects: true },
    });
    if (res.effects?.status?.status !== 'success') {
      throw new Error(`drip failed: ${res.effects?.status?.error}`);
    }
    console.log(`   digest ${res.digest}`);
  } else {
    console.log('\n[step 1] skipped (--skip-drip)');
  }

  // ═══════════════════════════════════════════════════════════════════
  // Step 2: find an ENDLESS coin to pay with, then mint the voucher
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[step 2] mint GenesisVoucher…');
  const coinType = `${d.packageId}::currency::CURRENCY`;
  const coinsRes = await client.getCoins({ owner: admin, coinType, limit: 5 });
  const coin = coinsRes.data[0];
  if (!coin) throw new Error('no ENDLESS coins owned by admin — drip first');
  console.log(`   coin    ${coin.coinObjectId} (balance: ${coin.balance})`);

  const seed = generateAttributeSeed();
  const seedHex = Array.from(seed)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  console.log(`   seed    ${seedHex.slice(0, 16)}… (32 bytes)`);

  const tx2 = new Transaction();
  // Use the full ENDLESS coin as payment (refund-on-coin doesn't auto-give change
  // for an exact-amount Coin, but mint_genesis_voucher accepts the whole coin
  // amount as paid value).
  const reqs = tx2.add(endlessTx.recruit.noRequirements());
  tx2.add(
    endlessTx.recruit.mintGenesisVoucher({
      saga: d.sagaId,
      payment: coin.coinObjectId,
      attributeSeed: Array.from(seed),
      hint: null,
      requirements: reqs,
      intentHint: null,
      ttlMs: VOUCHER_TTL_MS,
    }),
  );
  const mintRes = await client.signAndExecuteTransaction({
    transaction: tx2,
    signer,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (mintRes.effects?.status?.status !== 'success') {
    throw new Error(`mint voucher failed: ${mintRes.effects?.status?.error}`);
  }
  const voucherId = findCreated((mintRes.objectChanges ?? []) as ObjectChange[], '::recruit::GenesisVoucher')[0];
  if (!voucherId) throw new Error('voucher not created');
  console.log(`   voucher ${voucherId}`);
  console.log(`   digest  ${mintRes.digest}`);

  // ═══════════════════════════════════════════════════════════════════
  // Step 3: roll attrs
  // ═══════════════════════════════════════════════════════════════════
  const rolled = rollAttributesFromSeed(seed, SCHEMA);
  console.log('\n[step 3] HKDF roll:');
  for (const r of rolled) {
    console.log(`   ${r.label.padEnd(4)} = ${r.value}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Step 4: redeem
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[step 4] redeem voucher…');
  const tx3 = new Transaction();
  const physical = tx3.add(
    endlessTx.character.newPhysicalFacts({
      species: 'human',
      gender: '男',
      body: '勻稱',
      ageYears: 24,
    }),
  );
  const profile = tx3.add(
    endlessTx.character.newCharacterProfile({
      name: '林霽虹',
      description: '少年武生剛入梨園，眉目英朗，手腳俐落。鏈上 e2e 測試角色。',
      physicalFacts: physical,
    }),
  );
  // Empty MediaAsset vector (typed via bcs for the makeMoveVec).
  const mediaAssets = tx3.makeMoveVec({
    elements: [],
    type: `${d.packageId}::character::MediaAsset`,
  });
  const attrElements = rolled.map((rv) =>
    tx3.add(
      endlessTx.character.newAttributeValue({
        key: rv.key,
        value: BigInt(rv.value),
        seed: Array.from(seed),
      }),
    ),
  );
  const attributes = tx3.makeMoveVec({
    elements: attrElements,
    type: `${d.packageId}::character::AttributeValue`,
  });
  tx3.add(
    endlessTx.recruit.redeemVoucherToCharacter({
      cap: d.storytellerCapId,
      saga: d.sagaId,
      world: d.worldId,
      scene: d.sceneIds[0],
      voucher: voucherId,
      profile,
      mediaAssets,
      attributes,
    }),
  );
  const redeemRes = await client.signAndExecuteTransaction({
    transaction: tx3,
    signer,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (redeemRes.effects?.status?.status !== 'success') {
    throw new Error(`redeem failed: ${redeemRes.effects?.status?.error}`);
  }

  const characterId = findCreated((redeemRes.objectChanges ?? []) as ObjectChange[], '::character::Character')[0];
  const ownerCapId = findCreated((redeemRes.objectChanges ?? []) as ObjectChange[], '::character::OwnerCap')[0];
  const controlCapId = findCreated((redeemRes.objectChanges ?? []) as ObjectChange[], '::character::ControlCap')[0];

  console.log(`   digest        ${redeemRes.digest}`);
  console.log(`   character     ${characterId ?? '(not found!)'}`);
  console.log(`   ownerCap      ${ownerCapId ?? '(not found)'}`);
  console.log(`   controlCap    ${controlCapId ?? '(not found)'}`);

  // Suppress unused bcs import warning while we don't yet need bcs-encoded args here.
  void bcs;

  if (!characterId) {
    throw new Error('Character object not found in redeem result');
  }
  console.log('\nOK e2e flow succeeded. Inspect:');
  console.log(`   https://suiscan.xyz/${env}/object/${characterId}`);
}

main().catch((e) => {
  console.error(`\n[fatal] ${(e as Error).message}`);
  process.exit(1);
});
