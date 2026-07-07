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
  signAndExecute,
  findCreatedObjectId,
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
const ENDLESS_DECIMALS = 6;
const VOUCHER_PRICE = 100n * 10n ** BigInt(ENDLESS_DECIMALS); // 100 ENDLESS
const REFILL_AMOUNT = 1_000n * 10n ** BigInt(ENDLESS_DECIMALS); // 1000 ENDLESS

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

  const signer = loadKeypair();
  const admin = signer.toSuiAddress();
  const client = makeSuiClient({ network: env });

  console.log('endless-story · Phase 2.3 e2e test');
  console.log(`   admin    ${admin}`);
  console.log(`   saga     ${d.sagaId}`);
  console.log(`   scene[0] ${d.sceneIds[0]}`);

  if (!d.faucetAdminCapId) throw new Error('faucetAdminCap missing — re-run bootstrap');

  // ═══════════════════════════════════════════════════════════════════
  // Step 1: ensure admin has ≥ VOUCHER_PRICE ENDLESS
  //  - check current balance first
  //  - if short, admin_mint (with tiny salt to dodge Sui tx-digest dedup)
  // ═══════════════════════════════════════════════════════════════════
  const coinType = `${d.packageId}::currency::CURRENCY`;
  let currentCoins = await client.core.listCoins({ owner: admin, coinType, limit: 20 });
  let currentBalance = currentCoins.objects.reduce((s, c) => s + BigInt(c.balance), 0n);
  console.log(`\n[step 1] current ENDLESS balance: ${currentBalance}`);
  if (!skipDrip && currentBalance < VOUCHER_PRICE) {
    // Salt amount with current ms so each run is a distinct tx payload — Sui's
    // tx-digest dedup would otherwise reuse the prior run's cached effects.
    const salt = BigInt(Date.now() % 100_000);
    const amount = REFILL_AMOUNT + salt;
    console.log(`         admin_mint ${amount} (REFILL_AMOUNT + ${salt} salt)…`);
    const tx = new Transaction();
    tx.add(
      endlessTx.faucet.adminMint({
        admin: d.faucetAdminCapId,
        faucet: d.faucetId,
        amount,
        recipient: admin,
      }),
    );
    const res = await signAndExecute(client, { transaction: tx, signer, waitForFinality: true });
    if (!res.success) {
      throw new Error(`admin_mint failed: ${res.error}`);
    }
    console.log(`         digest ${res.digest}`);
    // Poll until indexer catches up.
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 800));
      currentCoins = await client.core.listCoins({ owner: admin, coinType, limit: 20 });
      currentBalance = currentCoins.objects.reduce((s, c) => s + BigInt(c.balance), 0n);
      if (currentBalance >= VOUCHER_PRICE) break;
    }
    console.log(`         balance after refill: ${currentBalance}`);
  } else if (skipDrip) {
    console.log('         skipped (--skip-drip)');
  }
  if (currentBalance < VOUCHER_PRICE) {
    throw new Error(`insufficient ENDLESS after refill: have ${currentBalance}, need ${VOUCHER_PRICE}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Step 2: find an ENDLESS coin to pay with, then mint the voucher
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[step 2] mint GenesisVoucher…');
  // step 1 guaranteed balance ≥ VOUCHER_PRICE; just reuse the snapshot.
  const coinsRes = currentCoins;
  console.log(`   coins   ${coinsRes.objects.length} (total ${currentBalance})`);

  const seed = generateAttributeSeed();
  const seedHex = Array.from(seed)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  console.log(`   seed    ${seedHex.slice(0, 16)}… (32 bytes)`);

  const tx2 = new Transaction();
  // Merge all coins into the first, then split exactly VOUCHER_PRICE for
  // payment. This matches what the wizard does — leaves change behind so
  // subsequent runs still have a balance.
  const coinIds = coinsRes.objects.map((c) => c.objectId);
  const primary = tx2.object(coinIds[0]);
  if (coinIds.length > 1) {
    tx2.mergeCoins(
      primary,
      coinIds.slice(1).map((id) => tx2.object(id)),
    );
  }
  const [payment] = tx2.splitCoins(primary, [VOUCHER_PRICE]);

  const reqs = tx2.add(endlessTx.recruit.noRequirements());
  // mint_genesis_voucher returns GenesisVoucher by value — must transfer.
  const voucher = tx2.add(
    endlessTx.recruit.mintGenesisVoucher({
      saga: d.sagaId,
      payment,
      attributeSeed: Array.from(seed),
      hint: null,
      requirements: reqs,
      intentHint: null,
      ttlMs: VOUCHER_TTL_MS,
    }),
  );
  tx2.transferObjects([voucher], admin);
  const mintRes = await signAndExecute(client, { transaction: tx2, signer, waitForFinality: true });
  if (!mintRes.success) {
    throw new Error(`mint voucher failed: ${mintRes.error}`);
  }
  const voucherId = findCreatedObjectId(mintRes, '::recruit::GenesisVoucher');
  if (!voucherId) throw new Error('voucher not created');
  // Wait for the fullnode to serve the voucher object so step 4 can read it back.
  for (let i = 0; i < 15; i++) {
    try {
      const probe = await client.core.getObject({ objectId: voucherId });
      if (probe.object) break;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 600));
  }
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
  // redeem_voucher_to_character transfers the OwnerCap to voucher.payer
  // (= admin in this test) on-chain and returns only the ControlCap.
  const controlCap = tx3.add(
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
  tx3.transferObjects([controlCap], admin);
  const redeemRes = await signAndExecute(client, { transaction: tx3, signer, waitForFinality: true });
  if (!redeemRes.success) {
    throw new Error(`redeem failed: ${redeemRes.error}`);
  }

  const characterId = findCreatedObjectId(redeemRes, '::character::Character');
  const ownerCapId = findCreatedObjectId(redeemRes, '::character::OwnerCap');
  const controlCapId = findCreatedObjectId(redeemRes, '::character::ControlCap');

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
  console.log(`   https://${env === 'mainnet' ? '' : `${env}.`}suivision.xyz/object/${characterId}`);
}

main().catch((e) => {
  console.error(`\n[fatal] ${(e as Error).message}`);
  process.exit(1);
});
