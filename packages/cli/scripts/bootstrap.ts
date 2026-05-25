/**
 * Phase 2.3 bootstrap — seed the world after `deploy.ts` publishes the package.
 *
 * 4 sequential txs (Sui rule: an object shared in tx N can only be used by
 * shared-ref in tx N+1):
 *
 *   1. World + Faucet — create the shared World + Faucet, transfer caps to admin
 *   2. Locations      — 3 shared Locations under the World
 *   3. Saga           — 1 shared Saga, transfer StorytellerCap to admin
 *   4. Scenes         — 3 shared Scenes anchored to the locations
 *
 * Reads `packageId` from `contract-ids.ts` (so `deploy.ts` must have run).
 * Discovers the publisher's `TreasuryCap<CURRENCY>` automatically.
 * Rewrites `contract-ids.ts` with the full deployment snapshot.
 *
 * Usage:
 *   pnpm --filter @endless-story/cli bootstrap --env devnet
 *
 * Flags:
 *   --env devnet|testnet|mainnet|localnet  (required)
 *   --dry-run                              (print plan, don't submit)
 *   --story-id spring-snow                 (default 'spring-snow')
 *
 * See AGENTS.md → 「下次接班」Phase 2 step 2.3.
 */
import * as path from 'node:path';
import * as url from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
import {
  ENDLESS_STORY_DEPLOYMENT,
  loadKeypair,
  makeSuiClient,
  tx as endlessTx,
  type SuiClient,
  type SuiNetwork,
} from '@endless-story/sdk';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { flag, hasFlag, requireFlag } from '../src/lib/flags';
import { writeContractIds } from '../src/lib/contract-ids-writer';

const VALID_NETWORKS: ReadonlySet<SuiNetwork> = new Set(['devnet', 'testnet', 'mainnet', 'localnet']);

// 4 world attributes — keep in sync with packages/web/src/lib/chain/schema.ts
// DEFAULT_ATTRIBUTE_SCHEMA. Server-side rolling and on-chain validation use
// these exact keys.
const ATTRIBUTE_DEFS = [
  { key: 'appearance', label: '外貌', min: 0n, max: 100n },
  { key: 'constitution', label: '筋骨', min: 0n, max: 100n },
  { key: 'acuity', label: '機敏', min: 0n, max: 100n },
  { key: 'disposition', label: '心性', min: 0n, max: 100n },
] as const;

const SPECIES_KINDS = ['human', 'spirit', 'beast'];

// 3 demo locations (春雪社 in Shanghai, mid-1920s).
const LOCATIONS = [
  { name: '春雪社·內庭', description: '梨園後台，戲服箱櫃倚牆而立。', terrain: 'indoor', x: 100n, y: 100n },
  { name: '上海戲樓', description: '夜半的霓虹打在台口，看客還未散場。', terrain: 'urban', x: 100n, y: 200n },
  { name: '蘇州河碼頭', description: '貨船汽笛、煤煙、河水的腥味。', terrain: 'urban', x: 200n, y: 100n },
] as const;

// 1 scene per location for Phase 2; can expand later.
const SCENES = [
  { name: '化妝間', description: '燈下整裝，鏡中映出戲妝半完的臉。', privacy: 1, atmosphere: 80n, danger: 0n, prosperity: 50n },
  { name: '台口看戲', description: '前排正廳，包廂裡有客點頭打拍。', privacy: 0, atmosphere: 90n, danger: 10n, prosperity: 70n },
  { name: '碼頭夜談', description: '燈油未滅，江湖客在燈籠下交換情報。', privacy: 2, atmosphere: 50n, danger: 40n, prosperity: 30n },
] as const;

function parseFlags() {
  const env = requireFlag('--env') as SuiNetwork;
  if (!VALID_NETWORKS.has(env)) {
    throw new Error(`--env must be one of ${[...VALID_NETWORKS].join(' / ')}, got "${env}"`);
  }
  const dryRun = hasFlag('--dry-run');
  const storyId = flag('--story-id', 'spring-snow')!;
  return { env, dryRun, storyId };
}

async function findTreasuryCap(client: SuiClient, owner: string, packageId: string): Promise<string> {
  const want = `0x2::coin::TreasuryCap<${packageId}::currency::CURRENCY>`;
  let cursor: string | null | undefined = null;
  for (;;) {
    const page = await client.getOwnedObjects({
      owner,
      cursor,
      limit: 50,
      options: { showType: true },
    });
    for (const obj of page.data) {
      const data = obj.data;
      if (data?.type === want && data.objectId) return data.objectId;
    }
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  throw new Error(
    `TreasuryCap<CURRENCY> not found for ${owner}. ` +
      `Re-publish via deploy.ts (the publisher always receives the cap).`,
  );
}

interface ObjectChange {
  type: string;
  objectType?: string;
  objectId?: string;
  sender?: string;
  owner?: unknown;
}

function findCreatedByType(changes: ObjectChange[], typeSuffix: string): string[] {
  const out: string[] = [];
  for (const c of changes) {
    if (c.type !== 'created') continue;
    if (c.objectType && c.objectType.endsWith(typeSuffix) && c.objectId) {
      out.push(c.objectId);
    }
  }
  return out;
}

function firstOrThrow(arr: string[], label: string): string {
  if (arr.length === 0) throw new Error(`bootstrap: expected created ${label} but found none`);
  return arr[0];
}

async function runTx(
  client: SuiClient,
  signer: Ed25519Keypair,
  tx: Transaction,
  label: string,
): Promise<ObjectChange[]> {
  console.log(`\n[tx] ${label}`);
  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`tx "${label}" failed: ${res.effects?.status?.error ?? 'unknown'}`);
  }
  console.log(`   digest ${res.digest}`);
  return (res.objectChanges ?? []) as ObjectChange[];
}

async function main() {
  const { env, dryRun, storyId } = parseFlags();

  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..', '..');
  const sharedSrcDir = path.join(repoRoot, 'packages', 'shared', 'src');

  console.log('endless-story · Phase 2.3 bootstrap');
  console.log(`   env       ${env}`);
  console.log(`   storyId   ${storyId}`);
  console.log(`   dryRun    ${dryRun}`);

  const deployment = ENDLESS_STORY_DEPLOYMENT;
  if (!deployment.packageId) {
    throw new Error(
      'packageId missing — run `pnpm --filter @endless-story/cli deploy --env <env>` first.',
    );
  }
  if (deployment.network !== env) {
    throw new Error(`contract-ids.ts network=${deployment.network} but --env=${env}`);
  }
  console.log(`   packageId ${deployment.packageId}`);

  if (dryRun) {
    console.log('\n[dry-run] flags + packageId OK. Skipping submission.');
    return;
  }

  const signer = loadKeypair(0);
  const admin = signer.toSuiAddress();
  const client = makeSuiClient({ network: env });
  console.log(`   admin     ${admin}`);

  // ─── Discover TreasuryCap ──────────────────────────────────────────
  console.log('\n[scan] looking for TreasuryCap<CURRENCY>…');
  const treasuryCapId = await findTreasuryCap(client, admin, deployment.packageId);
  console.log(`   treasury  ${treasuryCapId}`);

  // ═══════════════════════════════════════════════════════════════════
  // Tx 1: World + Faucet (no cross-dependency in same PTB)
  // ═══════════════════════════════════════════════════════════════════
  const tx1 = new Transaction();
  const info = tx1.add(
    endlessTx.world.newWorldInfo({ name: '無盡故事', description: '上海灘的梨園。' }),
  );
  const currency = tx1.add(
    endlessTx.world.newCurrencyDisplay({ name: 'Endless', symbol: 'ENDLESS' }),
  );

  const attrDefs = ATTRIBUTE_DEFS.map((d) =>
    tx1.add(
      endlessTx.world.newAttributeDefinition({
        key: d.key,
        label: d.label,
        minValue: d.min,
        maxValue: d.max,
      }),
    ),
  );
  const attrDefsVec = tx1.makeMoveVec({
    elements: attrDefs,
    type: `${deployment.packageId}::world::AttributeDefinition`,
  });

  const rules = tx1.add(
    endlessTx.world.newWorldRules({
      speciesKinds: SPECIES_KINDS,
      attributeDefinitions: attrDefsVec,
    }),
  );

  const worldAdminCap = tx1.add(endlessTx.world.createWorld({ info, currency, rules }));
  tx1.transferObjects([worldAdminCap], admin);

  const faucetAdminCap = tx1.add(
    endlessTx.faucet.createFaucetWithDefaults({ treasuryCap: treasuryCapId }),
  );
  tx1.transferObjects([faucetAdminCap], admin);

  const changes1 = await runTx(client, signer, tx1, 'Tx 1 — World + Faucet');
  const worldId = firstOrThrow(findCreatedByType(changes1, '::world::World'), 'World');
  const adminCapId = firstOrThrow(findCreatedByType(changes1, '::world::AdminCap'), 'AdminCap');
  const faucetId = firstOrThrow(findCreatedByType(changes1, '::faucet::Faucet'), 'Faucet');
  const faucetAdminCapId = firstOrThrow(
    findCreatedByType(changes1, '::faucet::FaucetAdminCap'),
    'FaucetAdminCap',
  );
  console.log(`   world     ${worldId}`);
  console.log(`   adminCap  ${adminCapId}`);
  console.log(`   faucet    ${faucetId}`);
  console.log(`   fAdminCap ${faucetAdminCapId}`);

  // ═══════════════════════════════════════════════════════════════════
  // Tx 2: Locations
  // ═══════════════════════════════════════════════════════════════════
  const tx2 = new Transaction();
  LOCATIONS.forEach((loc, i) => {
    const locInfo = tx2.add(
      endlessTx.world.newLocationInfo({
        index: BigInt(i),
        name: loc.name,
        description: loc.description,
        terrain: loc.terrain,
      }),
    );
    const pos = tx2.add(endlessTx.world.newPosition({ x: loc.x, y: loc.y }));
    const graph = tx2.add(endlessTx.world.newLocationGraph({ adjacentIndices: [] }));
    tx2.add(
      endlessTx.world.createLocation({
        adminCap: adminCapId,
        world: worldId,
        info: locInfo,
        position: pos,
        graph,
      }),
    );
  });
  const changes2 = await runTx(client, signer, tx2, 'Tx 2 — 3 Locations');
  const locationIds = findCreatedByType(changes2, '::world::Location');
  if (locationIds.length !== LOCATIONS.length) {
    throw new Error(`expected ${LOCATIONS.length} locations, got ${locationIds.length}`);
  }
  console.log(`   locations ${locationIds.length} created`);

  // ═══════════════════════════════════════════════════════════════════
  // Tx 3: Saga
  // ═══════════════════════════════════════════════════════════════════
  const tx3 = new Transaction();
  const kind = tx3.add(endlessTx.saga.kindStandard());
  const storytellerCap = tx3.add(
    endlessTx.saga.createSaga({
      world: worldId,
      kind,
      name: '春雪社',
      description: '民國上海，霓虹半夜，戲樓未散。',
      metadataUri: '',
      ownerBps: 4000,
      storytellerBps: 4000,
      treasuryBps: 2000,
      coveredLocationIds: locationIds,
      departurePolicy: 'free',
    }),
  );
  tx3.transferObjects([storytellerCap], admin);
  const changes3 = await runTx(client, signer, tx3, 'Tx 3 — Saga');
  const sagaId = firstOrThrow(findCreatedByType(changes3, '::saga::Saga'), 'Saga');
  const storytellerCapId = firstOrThrow(
    findCreatedByType(changes3, '::saga::StorytellerCap'),
    'StorytellerCap',
  );
  console.log(`   saga         ${sagaId}`);
  console.log(`   sttellerCap  ${storytellerCapId}`);

  // ═══════════════════════════════════════════════════════════════════
  // Tx 4: Scenes
  // ═══════════════════════════════════════════════════════════════════
  const tx4 = new Transaction();
  SCENES.forEach((scene, i) => {
    const sceneInfo = tx4.add(
      endlessTx.scene.newSceneInfo({
        name: scene.name,
        description: scene.description,
        metadataUri: '',
      }),
    );
    const sceneAccess = tx4.add(
      endlessTx.scene.newSceneAccess({ privacyLevel: scene.privacy }),
    );
    const sceneParams = tx4.add(
      endlessTx.scene.newSceneParams({
        atmosphere: scene.atmosphere,
        danger: scene.danger,
        prosperity: scene.prosperity,
      }),
    );
    tx4.add(
      endlessTx.scene.createScene({
        cap: storytellerCapId,
        saga: sagaId,
        location: locationIds[i],
        info: sceneInfo,
        access: sceneAccess,
        posX: 0n,
        posY: 0n,
        params: sceneParams,
        causalCommitmentIds: [],
      }),
    );
  });
  const changes4 = await runTx(client, signer, tx4, 'Tx 4 — 3 Scenes');
  const sceneIds = findCreatedByType(changes4, '::scene::Scene');
  if (sceneIds.length !== SCENES.length) {
    throw new Error(`expected ${SCENES.length} scenes, got ${sceneIds.length}`);
  }
  console.log(`   scenes    ${sceneIds.length} created`);

  // ═══════════════════════════════════════════════════════════════════
  // Write contract-ids.ts
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[contract-ids] writing snapshot…');
  const deployedAt = new Date().toISOString();
  writeContractIds(
    sharedSrcDir,
    {
      network: env,
      packageId: deployment.packageId,
      adminCapId,
      worldId,
      locationIds,
      sagaId,
      storytellerCapId,
      sceneIds,
      faucetId,
      faucetAdminCapId,
      storyId,
    },
    deployedAt,
  );

  console.log('\n[done] Bootstrap complete.');
  console.log(`   network    ${env}`);
  console.log(`   world      ${worldId}`);
  console.log(`   saga       ${sagaId}`);
  console.log(`   scenes     ${sceneIds.length}`);
  console.log(`   faucet     ${faucetId}`);
  console.log('\nNext: run test-recruit-e2e to verify the full mint flow.');
}

main().catch((e) => {
  console.error(`\n[fatal] ${(e as Error).message}`);
  process.exit(1);
});
