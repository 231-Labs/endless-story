/**
 * Upgrade the existing endless_story Sui package without resetting live objects.
 *
 * This is intentionally separate from deploy.ts:
 * - deploy.ts publishes a fresh package lineage for demo resets.
 * - upgrade.ts uses the existing UpgradeCap and keeps packageId as the
 *   original type anchor while writing latestPackageId for Move calls.
 */
import * as path from 'node:path';
import * as url from 'node:url';
import * as fs from 'node:fs';
import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, type SuiNetwork } from '@endless-story/shared/contract-ids';
import { makeSuiClient } from '@endless-story/sdk';
import { loadKeypair } from '@endless-story/sdk/node';
import { flag, hasFlag, requireFlag } from '../src/lib/flags';
import { assertActiveEnv, loadBytecodeDump } from '../src/lib/sui-publish';
import { writeContractIds } from '../src/lib/contract-ids-writer';

const VALID_NETWORKS: ReadonlySet<SuiNetwork> = new Set(['devnet', 'testnet', 'mainnet', 'localnet']);

type BuildDump = {
  modules: string[];
  dependencies: string[];
  digest?: number[];
};

type UpgradeCapInfo = {
  id: string;
  packageId: string;
  version: string;
  policy: number;
};

function repoPaths() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..', '..');
  return {
    repoRoot,
    contractsDir: path.join(repoRoot, 'contracts', 'endless_story'),
    sharedSrcDir: path.join(repoRoot, 'packages', 'shared', 'src'),
  };
}

function buildPackage(contractsDir: string): BuildDump {
  // Shared resolver: pre-built dump in-container (DEPLOY_BYTECODE_DUMP_PATH),
  // else `sui move build` from source (local dev).
  const dump = loadBytecodeDump(contractsDir) as BuildDump;
  // An upgrade ticket needs the package digest for the compatibility check.
  if (!dump.digest?.length) {
    throw new Error('bytecode dump missing digest (required for upgrade compatibility)');
  }
  return dump;
}

function fieldsFromUpgradeCapObject(obj: unknown): UpgradeCapInfo | null {
  const data = obj as {
    data?: {
      objectId?: string;
      content?: {
        dataType?: string;
        fields?: {
          package?: string;
          version?: string;
          policy?: number | string;
        };
      };
    };
  };
  const id = data.data?.objectId;
  const fields = data.data?.content?.fields;
  if (!id || !fields?.package || fields.policy == null || fields.version == null) return null;
  return {
    id,
    packageId: fields.package,
    version: String(fields.version),
    policy: Number(fields.policy),
  };
}

async function listUpgradeCaps(client: ReturnType<typeof makeSuiClient>, owner: string): Promise<UpgradeCapInfo[]> {
  const caps: UpgradeCapInfo[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.getOwnedObjects({
      owner,
      cursor,
      filter: { StructType: '0x2::package::UpgradeCap' },
      options: { showContent: true },
    });
    for (const item of page.data) {
      const cap = fieldsFromUpgradeCapObject(item);
      if (cap) caps.push(cap);
    }
    cursor = page.hasNextPage ? page.nextCursor ?? undefined : undefined;
  } while (cursor);
  return caps;
}

async function getUpgradeCap(
  client: ReturnType<typeof makeSuiClient>,
  owner: string,
  targetPackageId: string,
  explicitCapId?: string,
): Promise<UpgradeCapInfo> {
  if (explicitCapId) {
    const obj = await client.getObject({ id: explicitCapId, options: { showContent: true } });
    const cap = fieldsFromUpgradeCapObject(obj);
    if (!cap) throw new Error(`object ${explicitCapId} is not an UpgradeCap`);
    if (cap.packageId !== targetPackageId) {
      throw new Error(`UpgradeCap ${cap.id} points at ${cap.packageId}, expected ${targetPackageId}`);
    }
    return cap;
  }

  const caps = await listUpgradeCaps(client, owner);
  const matching = caps.filter((cap) => cap.packageId === targetPackageId);
  if (matching.length !== 1) {
    console.error(JSON.stringify({ owner, targetPackageId, caps }, null, 2));
    throw new Error(`expected exactly one UpgradeCap for ${targetPackageId}, found ${matching.length}`);
  }
  return matching[0]!;
}

function buildUpgradeTransaction(params: {
  sender: string;
  gasBudget: string;
  upgradeCap: UpgradeCapInfo;
  targetPackageId: string;
  dump: BuildDump;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(params.sender);
  tx.setGasBudget(BigInt(params.gasBudget));

  const cap = tx.object(params.upgradeCap.id);
  const ticket = tx.moveCall({
    target: '0x2::package::authorize_upgrade',
    arguments: [cap, tx.pure.u8(params.upgradeCap.policy), tx.pure.vector('u8', params.dump.digest!)],
  });
  const receipt = tx.upgrade({
    modules: params.dump.modules,
    dependencies: params.dump.dependencies,
    package: params.targetPackageId,
    ticket,
  });
  tx.moveCall({
    target: '0x2::package::commit_upgrade',
    arguments: [cap, receipt],
  });

  return tx;
}

async function main() {
  const env = requireFlag('--env') as SuiNetwork;
  if (!VALID_NETWORKS.has(env)) {
    throw new Error(`--env must be one of ${[...VALID_NETWORKS].join(' / ')}, got "${env}"`);
  }
  if (ENDLESS_STORY_DEPLOYMENT.network !== env) {
    throw new Error(`contract-ids network=${ENDLESS_STORY_DEPLOYMENT.network} but --env=${env}`);
  }
  if (!ENDLESS_STORY_DEPLOYMENT.packageId) {
    throw new Error('contract-ids missing original packageId; run deploy first');
  }

  const dryRun = hasFlag('--dry-run');
  const gasBudget = flag('--gas-budget', '2000000000')!;
  const explicitCapId = flag('--upgrade-cap-id');
  const targetPackageId = flag(
    '--package-id',
    ENDLESS_STORY_DEPLOYMENT.latestPackageId || ENDLESS_STORY_DEPLOYMENT.packageId,
  )!;
  const jsonOut = flag('--json-out');

  const { contractsDir, sharedSrcDir } = repoPaths();
  console.log('endless-story · package upgrade');
  console.log(`   env             ${env}`);
  console.log(`   originalPackage ${ENDLESS_STORY_DEPLOYMENT.packageId}`);
  console.log(`   targetPackage   ${targetPackageId}`);
  console.log(`   gasBudget       ${gasBudget}`);
  console.log(`   dryRun          ${dryRun}`);

  // assertActiveEnv guards LOCAL `sui client` usage (wrong active-env footgun).
  // In CLI-free / container mode (pre-built bytecode dump + programmatic signing
  // via SUI_ADMIN_PRIVATE_KEY) there is no sui client config to check and the
  // network is taken from --env, so skip it.
  if (!process.env.DEPLOY_BYTECODE_DUMP_PATH?.trim()) {
    assertActiveEnv(env);
  }

  const signer = loadKeypair();
  const sender = signer.toSuiAddress();
  const client = makeSuiClient({ network: env });

  console.log('\n[cap] locating UpgradeCap…');
  const upgradeCap = await getUpgradeCap(client, sender, targetPackageId, explicitCapId);
  console.log(`   cap      ${upgradeCap.id}`);
  console.log(`   package  ${upgradeCap.packageId}`);
  console.log(`   version  ${upgradeCap.version}`);
  console.log(`   policy   ${upgradeCap.policy}`);

  console.log('\n[build] compiling package bytecode…');
  const dump = buildPackage(contractsDir);
  console.log(`   modules ${dump.modules.length}`);
  console.log(`   deps    ${dump.dependencies.length}`);
  console.log(`   digest  ${dump.digest!.slice(0, 8).join(',')}...`);

  const tx = buildUpgradeTransaction({ sender, gasBudget, upgradeCap, targetPackageId, dump });

  if (dryRun) {
    console.log('\n[dry-run] submitting dry run…');
    const bytes = await tx.build({ client });
    const res = await client.dryRunTransactionBlock({ transactionBlock: bytes });
    const ok = res.effects.status.status === 'success';
    console.log(`   status ${res.effects.status.status}`);
    if (res.effects.status.error) console.log(`   error  ${res.effects.status.error}`);
    if (jsonOut) {
      fs.writeFileSync(jsonOut, JSON.stringify(res, null, 2), 'utf-8');
      console.log(`   wrote  ${jsonOut}`);
    }
    if (!ok) process.exit(1);
    console.log('\n[ready] upgrade dry-run passed.');
    return;
  }

  console.log('\n[upgrade] signing and executing…');
  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`upgrade failed: ${res.effects?.status?.error ?? 'unknown'}`);
  }
  await client.waitForTransaction({ digest: res.digest });

  const published = (res.objectChanges ?? []).find((o: { type: string }) => o.type === 'published') as
    | { packageId?: string }
    | undefined;
  if (!published?.packageId) {
    console.error(JSON.stringify(res.objectChanges ?? [], null, 2));
    throw new Error('upgrade succeeded but no upgraded package id was found in objectChanges');
  }

  const deployedAt = new Date().toISOString();
  const snapshot = {
    network: env,
    packageId: ENDLESS_STORY_DEPLOYMENT.packageId,
    latestPackageId: published.packageId,
    adminCapId: ENDLESS_STORY_DEPLOYMENT.adminCapId,
    worldId: ENDLESS_STORY_DEPLOYMENT.worldId,
    locationIds: ENDLESS_STORY_DEPLOYMENT.locationIds,
    sagaId: ENDLESS_STORY_DEPLOYMENT.sagaId,
    storytellerCapId: ENDLESS_STORY_DEPLOYMENT.storytellerCapId,
    sceneIds: ENDLESS_STORY_DEPLOYMENT.sceneIds,
    faucetId: ENDLESS_STORY_DEPLOYMENT.faucetId,
    faucetAdminCapId: ENDLESS_STORY_DEPLOYMENT.faucetAdminCapId,
    dreamConfigId: ENDLESS_STORY_DEPLOYMENT.dreamConfigId,
    dreamAdminCapId: ENDLESS_STORY_DEPLOYMENT.dreamAdminCapId,
    // Preserve still ledger ids — these survive an upgrade (same original
    // package anchors the Still type) and dropping them breaks 劇照 mint/shop.
    stillRegistryId: ENDLESS_STORY_DEPLOYMENT.stillRegistryId,
    stillTransferPolicyId: ENDLESS_STORY_DEPLOYMENT.stillTransferPolicyId,
    stillMintConfigId: ENDLESS_STORY_DEPLOYMENT.stillMintConfigId,
    demoCharacters: ENDLESS_STORY_DEPLOYMENT.demoCharacters,
    storyId: ENDLESS_STORY_DEPLOYMENT.storyId,
  };
  console.log('\n[contract-ids] writing upgraded snapshot…');
  writeContractIds(sharedSrcDir, snapshot, deployedAt);

  // Runtime manifest: lets a running web container adopt the upgraded ids
  // WITHOUT a rebuild (read on boot via DEPLOYMENT_MANIFEST_PATH). The source
  // contract-ids.ts above is the committed seed; this volume file is what a
  // remote, in-container upgrade actually relies on. Best-effort.
  const manifestPath = process.env.DEPLOYMENT_MANIFEST_PATH?.trim();
  if (manifestPath) {
    try {
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      fs.writeFileSync(manifestPath, JSON.stringify({ ...snapshot, deployedAt }, null, 2), 'utf-8');
      console.log(`[manifest] wrote runtime deployment manifest: ${manifestPath}`);
    } catch (e) {
      console.warn(`[manifest] failed to write ${manifestPath}: ${(e as Error).message}`);
    }
  }

  console.log('\n[done] Package upgrade complete.');
  console.log(`   originalPackage ${ENDLESS_STORY_DEPLOYMENT.packageId}`);
  console.log(`   latestPackage   ${published.packageId}`);
  console.log(`   cap             ${upgradeCap.id}`);
  console.log(`   digest          ${res.digest}`);
  console.log(`   deployedAt      ${deployedAt}`);
}

main().catch((e) => {
  console.error(`\n[fatal] ${(e as Error).message}`);
  process.exit(1);
});
