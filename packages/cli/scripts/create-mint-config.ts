/**
 * One-off: create the saga's `StillMintConfig` (self-serve mint fee) on an
 * already-bootstrapped world, then write its id into contract-ids.ts.
 *
 * Full `bootstrap.ts` now creates this as Tx 6.6, but the live testnet world
 * was bootstrapped before self-serve minting existed — re-bootstrapping would
 * wipe the world. This script adds JUST the config to the existing saga.
 *
 *   pnpm --filter @endless-story/cli run create-mint-config -- --env testnet
 *   pnpm --filter @endless-story/cli run create-mint-config -- --env testnet --fee 2000000
 *
 * Must be run by the StorytellerCap holder (same keypair as deploy/bootstrap).
 * Refuses if a config id is already set unless `--force` (a second config would
 * orphan the first; the fee is mutable in place via `still::set_mint_fee`).
 */
import * as path from 'node:path';
import * as url from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, type SuiNetwork } from '@endless-story/shared/contract-ids';
import { makeSuiClient, tx as endlessTx } from '@endless-story/sdk';
import { loadKeypair } from '@endless-story/sdk/node';
import { flag, hasFlag, requireFlag } from '../src/lib/flags';
import { assertActiveEnv } from '../src/lib/sui-publish';
import { writeContractIds } from '../src/lib/contract-ids-writer';

/** 1 ENDLESS — currency has 6 decimals (mirrors still::DEFAULT_MINT_FEE). */
const DEFAULT_FEE = 1_000_000n;

async function main() {
  const env = requireFlag('--env') as SuiNetwork;
  const force = hasFlag('--force');
  const fee = BigInt(flag('--fee', DEFAULT_FEE.toString())!);

  const d = ENDLESS_STORY_DEPLOYMENT;
  if (!d.packageId) throw new Error('packageId missing — run deploy + bootstrap first.');
  if (d.network !== env) throw new Error(`contract-ids network=${d.network} but --env=${env}`);
  if (!d.storytellerCapId || !d.sagaId) {
    throw new Error('world not seeded — missing storytellerCapId / sagaId.');
  }
  if (d.stillMintConfigId && !force) {
    throw new Error(
      `stillMintConfigId already set (${d.stillMintConfigId}). ` +
        'Use still::set_mint_fee to change the fee, or pass --force to create a fresh config.',
    );
  }

  assertActiveEnv(env);
  const signer = loadKeypair();
  const client = makeSuiClient({ network: env });

  console.log('endless-story · create StillMintConfig');
  console.log(`   env     ${env}`);
  console.log(`   signer  ${signer.toSuiAddress()}`);
  console.log(`   saga    ${d.sagaId}`);
  console.log(`   fee     ${fee} base units (${Number(fee) / 1e6} ENDLESS)`);

  const tx = new Transaction();
  tx.add(endlessTx.still.createMintConfig({ cap: d.storytellerCapId, saga: d.sagaId, fee }));
  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`tx failed: ${res.effects?.status?.error ?? 'unknown'}`);
  }

  const changes = (res.objectChanges ?? []) as Array<{
    type: string;
    objectType?: string;
    objectId?: string;
  }>;
  const created = changes.find(
    (c) => c.type === 'created' && c.objectType?.endsWith('::still::StillMintConfig'),
  );
  if (!created?.objectId) throw new Error('created StillMintConfig not found in objectChanges.');
  const stillMintConfigId = created.objectId;

  console.log(`   digest  ${res.digest}`);
  console.log(`   config  ${stillMintConfigId}`);

  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..', '..');
  const sharedSrcDir = path.join(repoRoot, 'packages', 'shared', 'src');
  console.log('\n[contract-ids] writing snapshot…');
  writeContractIds(
    sharedSrcDir,
    {
      network: d.network,
      packageId: d.packageId,
      latestPackageId: d.latestPackageId,
      adminCapId: d.adminCapId,
      worldId: d.worldId,
      locationIds: d.locationIds,
      sagaId: d.sagaId,
      storytellerCapId: d.storytellerCapId,
      sceneIds: d.sceneIds,
      faucetId: d.faucetId,
      faucetAdminCapId: d.faucetAdminCapId,
      dreamConfigId: d.dreamConfigId,
      dreamAdminCapId: d.dreamAdminCapId,
      stillRegistryId: d.stillRegistryId,
      stillTransferPolicyId: d.stillTransferPolicyId,
      stillMintConfigId,
      demoCharacters: d.demoCharacters,
      storyId: d.storyId,
    },
    new Date().toISOString(),
  );

  console.log('\n[done] StillMintConfig live + contract-ids updated.');
  console.log('   Rebuild + redeploy web so the new id ships; then fans can self-mint.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
