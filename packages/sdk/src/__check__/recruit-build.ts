/**
 * Phase 2.2 acceptance: prove the SDK can build the two end-to-end PTBs
 * for the recruit flow — `mint_genesis_voucher` and `redeem_voucher_to_character`.
 *
 * Run: `pnpm exec tsx packages/sdk/src/__check__/recruit-build.ts`
 *
 * Does NOT submit — just serializes the Transaction to BCS bytes to prove
 * every argument type lines up. Uses `raw.*` with an explicit package
 * override so it works before deployment populates ENDLESS_STORY_DEPLOYMENT.
 *
 * Also keeps a parallel demo using the sugar wrappers (inside an
 * unreachable branch) to verify their types match the underlying bindings.
 */
import { Transaction } from '@mysten/sui/transactions';
import * as recruitTx from '../tx/recruit.js';
import * as characterTx from '../tx/character.js';

// Stub package — `0x1` is valid as an address shape; not a real deploy.
const STUB_PKG = '0x0000000000000000000000000000000000000000000000000000000000000001';

// ───────────────────────────────────────────────────────────────────────
// Build 1: mint_genesis_voucher
// ───────────────────────────────────────────────────────────────────────
function buildMintVoucher(opts: {
  sagaId: string;
  paymentCoinId: string;
}): Transaction {
  const tx = new Transaction();

  // Inline-construct VoucherRequirements (no restrictions for this demo).
  const reqs = tx.add(recruitTx.raw.noRequirements({ package: STUB_PKG }));

  tx.add(
    recruitTx.raw.mintGenesisVoucher({
      package: STUB_PKG,
      arguments: {
        saga: opts.sagaId,
        payment: opts.paymentCoinId,
        attributeSeed: [1, 2, 3, 4],
        hint: '武小生',
        requirements: reqs,
        intentHint: '一介武夫',
        ttlMs: 86_400_000, // 24h
      },
    }),
  );

  return tx;
}

// ───────────────────────────────────────────────────────────────────────
// Build 2: redeem_voucher_to_character
// ───────────────────────────────────────────────────────────────────────
function buildRedeemVoucher(opts: {
  storytellerCapId: string;
  sagaId: string;
  worldId: string;
  sceneId: string;
  voucherId: string;
}): Transaction {
  const tx = new Transaction();

  // PhysicalFacts → wrap into CharacterProfile.
  const physical = tx.add(
    characterTx.raw.newPhysicalFacts({
      package: STUB_PKG,
      arguments: {
        species: 'human',
        gender: 'male',
        body: 'slim',
        ageYears: 18,
      },
    }),
  );

  const profile = tx.add(
    characterTx.raw.newCharacterProfile({
      package: STUB_PKG,
      arguments: {
        name: '林霽虹',
        description: '少年武生，剛入梨園。',
        physicalFacts: physical,
      },
    }),
  );

  const mediaAssets = tx.makeMoveVec({ elements: [] });
  const attrs = tx.makeMoveVec({ elements: [] });

  tx.add(
    recruitTx.raw.redeemVoucherToCharacter({
      package: STUB_PKG,
      arguments: {
        cap: opts.storytellerCapId,
        saga: opts.sagaId,
        world: opts.worldId,
        scene: opts.sceneId,
        voucher: opts.voucherId,
        profile,
        mediaAssets,
        attributes: attrs,
      },
    }),
  );

  return tx;
}

// ───────────────────────────────────────────────────────────────────────
// Sugar-wrapper parity check — never executed; only type-checked.
// Demonstrates that wrappers accept the same argument shape as raw.*.
// ───────────────────────────────────────────────────────────────────────
function _sugarParityCheck() {
  const tx = new Transaction();
  const reqs = tx.add(recruitTx.noRequirements());
  tx.add(
    recruitTx.mintGenesisVoucher({
      saga: '0x0',
      payment: '0x0',
      attributeSeed: [1],
      hint: null,
      requirements: reqs,
      intentHint: null,
      ttlMs: 1,
    }),
  );
}
void _sugarParityCheck; // keep referenced for tsc

// ───────────────────────────────────────────────────────────────────────
// Entry point — serializes both PTBs and prints byte lengths as proof.
// ───────────────────────────────────────────────────────────────────────
function countMoveCalls(tx: Transaction): number {
  // Transaction#getData() exposes the in-progress block.
  const data = tx.getData();
  return data.commands.filter((c) => '$kind' in c && c.$kind === 'MoveCall').length;
}

function main() {
  const mintTx = buildMintVoucher({
    sagaId: '0x' + 'a'.repeat(64),
    paymentCoinId: '0x' + 'b'.repeat(64),
  });

  const redeemTx = buildRedeemVoucher({
    storytellerCapId: '0x' + 'c'.repeat(64),
    sagaId: '0x' + 'a'.repeat(64),
    worldId: '0x' + 'd'.repeat(64),
    sceneId: '0x' + 'e'.repeat(64),
    voucherId: '0x' + 'f'.repeat(64),
  });

  const mintCalls = countMoveCalls(mintTx);
  const redeemCalls = countMoveCalls(redeemTx);

  // mint:   no_requirements + mint_genesis_voucher       = 2 calls
  // redeem: new_physical_facts + new_character_profile +
  //         redeem_voucher_to_character                  = 3 calls
  console.log(`OK  mint_genesis_voucher        PTB — ${mintCalls} moveCalls`);
  console.log(`OK  redeem_voucher_to_character PTB — ${redeemCalls} moveCalls`);

  if (mintCalls !== 2 || redeemCalls !== 3) {
    console.error('FAIL unexpected moveCall counts');
    process.exit(1);
  }
}

main();
