/**
 * Phase 2.3 bootstrap — seed the world after `deploy.ts` publishes the package.
 *
 * Sequential txs (Sui rule: an object shared in tx N can only be used by
 * shared-ref in tx N+1):
 *
 *   1. World + Faucet — create the shared World + Faucet, transfer caps to admin
 *   1b. Time config   — optional story override for WorldTimeConfig
 *   2. Locations      — shared Locations under the World
 *   3. Saga           — 1 shared Saga, transfer StorytellerCap to admin
 *   4. Saga config    — optional saga skill defs + card weighting
 *   5. Scenes         — shared Scenes anchored to the locations
 *   6. DreamConfig    — owner dream pricing
 *   7. Resources      — contested drama resources
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
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
import {
  ENDLESS_STORY_DEPLOYMENT,
  makeSuiClient,
  read,
  tx as endlessTx,
  type SuiClient,
  type SuiNetwork,
} from '@endless-story/sdk';
import { loadKeypair } from '@endless-story/sdk/node';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { StoryPreset } from '@endless-story/shared';
import { flag, hasFlag, requireFlag } from '../src/lib/flags';
import { writeContractIds } from '../src/lib/contract-ids-writer';

const VALID_NETWORKS: ReadonlySet<SuiNetwork> = new Set(['devnet', 'testnet', 'mainnet', 'localnet']);

function parseFlags() {
  const env = requireFlag('--env') as SuiNetwork;
  if (!VALID_NETWORKS.has(env)) {
    throw new Error(`--env must be one of ${[...VALID_NETWORKS].join(' / ')}, got "${env}"`);
  }
  const dryRun = hasFlag('--dry-run');
  const storyId = flag('--story-id', 'spring-snow')!;
  return { env, dryRun, storyId };
}

function loadStory(storyId: string): StoryPreset {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const file = path.join(here, 'stories', `${storyId}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`story preset not found: ${file}`);
  }
  const raw = fs.readFileSync(file, 'utf-8');
  const preset = JSON.parse(raw) as StoryPreset;
  if (preset.id !== storyId) {
    console.warn(`[bootstrap] file ${storyId}.json declares id="${preset.id}"`);
  }
  return preset;
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
  // Wait for the fullnode to index this tx before the next one builds —
  // otherwise testnet's RPC lag hands the next tx a stale gas-coin version
  // ("object ... unavailable for consumption"). Devnet was fast enough to
  // skip this; testnet is not.
  try {
    await client.waitForTransaction({ digest: res.digest });
  } catch {
    // Best-effort settle; the next tx's gas selection will retry anyway.
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

  const story = loadStory(storyId);
  console.log(`   preset    ${story.label}`);
  console.log(`   world     ${story.world.name} · ${story.locations.length} locations · ${story.scenes.length} scenes`);
  console.log(`   saga      ${story.saga.name}`);

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
    console.log(`   sagaAttrs ${story.saga_attributes?.length ?? 0}`);
    console.log(`   cardRules ${story.card_weight_rules?.length ?? 0}`);
    console.log(`   resources ${story.drama_resources?.length ?? 0}`);
    return;
  }

  const signer = loadKeypair();
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
    endlessTx.world.newWorldInfo({
      name: story.world.name,
      description: story.world.description,
    }),
  );
  const currency = tx1.add(
    endlessTx.world.newCurrencyDisplay({
      name: story.world.currency.name,
      symbol: story.world.currency.symbol,
    }),
  );

  const attrDefs = story.world_rules.attributes.map((d) =>
    tx1.add(
      endlessTx.world.newAttributeDefinition({
        key: d.key,
        label: d.label,
        minValue: BigInt(d.min),
        maxValue: BigInt(d.max),
      }),
    ),
  );
  const attrDefsVec = tx1.makeMoveVec({
    elements: attrDefs,
    type: `${deployment.packageId}::world::AttributeDefinition`,
  });

  const rules = tx1.add(
    endlessTx.world.newWorldRules({
      speciesKinds: [...story.world_rules.species],
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
  // Tx 1b: Optional WorldTimeConfig override
  // ═══════════════════════════════════════════════════════════════════
  if (story.world.time_config) {
    const tx1b = new Transaction();
    tx1b.add(
      endlessTx.world.setTimeConfig({
        adminCap: adminCapId,
        world: worldId,
        daysPerTickBp: BigInt(story.world.time_config.days_per_tick_bp),
        tickIntervalMs: BigInt(story.world.time_config.tick_interval_ms),
      }),
    );
    await runTx(client, signer, tx1b, 'Tx 1b — World time config');
    console.log(
      `   time      ${story.world.time_config.days_per_tick_bp}bp · ${story.world.time_config.tick_interval_ms}ms`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // Tx 2: Locations
  // ═══════════════════════════════════════════════════════════════════
  const tx2 = new Transaction();
  story.locations.forEach((loc, i) => {
    const locInfo = tx2.add(
      endlessTx.world.newLocationInfo({
        index: BigInt(i),
        name: loc.name,
        description: loc.description,
        terrain: loc.terrain,
      }),
    );
    const pos = tx2.add(endlessTx.world.newPosition({ x: BigInt(loc.x), y: BigInt(loc.y) }));
    const adjacent = loc.adjacent_indices ?? [];
    for (const idx of adjacent) {
      if (idx < 0 || idx >= story.locations.length) {
        throw new Error(`location "${loc.name}" adjacent index ${idx} out of range`);
      }
    }
    const graph = tx2.add(
      endlessTx.world.newLocationGraph({ adjacentIndices: adjacent.map((idx) => BigInt(idx)) }),
    );
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
  const changes2 = await runTx(client, signer, tx2, `Tx 2 — ${story.locations.length} Locations`);
  const locationIdsRaw = findCreatedByType(changes2, '::world::Location');
  if (locationIdsRaw.length !== story.locations.length) {
    throw new Error(`expected ${story.locations.length} locations, got ${locationIdsRaw.length}`);
  }
  // Sui `objectChanges` doesn't preserve PTB creation order (usually sorts by
  // objectId), so findCreatedByType's order != story.locations order. Each
  // Location's `info.index` is the authoritative order (written at creation =
  // story index). Re-sort by index, else `locationIds[scene.location_index]`
  // anchors to the wrong location and `coveredLocationIds` is scrambled too.
  const locWithIndex = await Promise.all(
    locationIdsRaw.map(async (id) => {
      const r = await read.world.getLocation(client, id);
      const idx = Number(
        (r.json as { info?: { index?: number | string } } | undefined)?.info?.index ?? -1,
      );
      return { id, idx };
    }),
  );
  if (locWithIndex.some((l) => l.idx < 0)) {
    throw new Error('bootstrap: a created Location is missing info.index — cannot order locations');
  }
  locWithIndex.sort((a, b) => a.idx - b.idx);
  const locationIds = locWithIndex.map((l) => l.id);
  console.log(`   locations ${locationIds.length} created (ordered by info.index)`);

  // Subset of locations the saga claims (narrative authority). story may set
  // `saga.covered_location_indices`; omitted = cover all (backward compat).
  // Indices map to `locations[]`; since locationIds is already sorted by
  // info.index, locationIds[idx] is the idx-th story location.
  const coveredIndices =
    story.saga.covered_location_indices ?? locationIds.map((_, i) => i);
  for (const idx of coveredIndices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= locationIds.length) {
      throw new Error(
        `saga.covered_location_indices contains out-of-range index ${idx} (have ${locationIds.length} locations)`,
      );
    }
  }
  const dedupCovered = [...new Set(coveredIndices)];
  const coveredLocationIds = dedupCovered.map((i) => locationIds[i]);
  console.log(
    `   saga covers ${coveredLocationIds.length}/${locationIds.length} locations (indices ${dedupCovered.join(', ')})`,
  );

  // ═══════════════════════════════════════════════════════════════════
  // Tx 3: Saga
  // ═══════════════════════════════════════════════════════════════════
  const tx3 = new Transaction();
  const kind = tx3.add(endlessTx.saga.kindStandard());
  const storytellerCap = tx3.add(
    endlessTx.saga.createSaga({
      world: worldId,
      kind,
      name: story.saga.name,
      description: story.saga.description,
      metadataUri: story.saga.metadata_uri ?? '',
      ownerBps: story.saga.owner_bps,
      storytellerBps: story.saga.storyteller_bps,
      treasuryBps: story.saga.treasury_bps,
      coveredLocationIds,
      departurePolicy: story.saga.departure_policy,
      naturePrompt: story.saga.nature_prompt ?? '',
      rhythmHints: story.saga.rhythm_hints ?? '',
      portraitTone: story.saga.portrait_tone ?? '',
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
  // Tx 4: Saga config — optional per-saga skills + card draw weights
  // ═══════════════════════════════════════════════════════════════════
  const sagaAttributes = story.saga_attributes ?? [];
  const cardWeightRules = story.card_weight_rules ?? [];
  if (sagaAttributes.length > 0 || cardWeightRules.length > 0) {
    const tx4 = new Transaction();
    const seenAttrs = new Set<string>();
    for (const attr of sagaAttributes) {
      if (seenAttrs.has(attr.key)) throw new Error(`duplicate saga attribute key: ${attr.key}`);
      if (attr.min > attr.max) throw new Error(`invalid saga attribute range for ${attr.key}`);
      seenAttrs.add(attr.key);
      tx4.add(
        endlessTx.saga.defineSagaAttribute({
          cap: storytellerCapId,
          saga: sagaId,
          key: attr.key,
          label: attr.label,
          minValue: BigInt(attr.min),
          maxValue: BigInt(attr.max),
        }),
      );
    }
    if (cardWeightRules.length > 0) {
      const knownAttributeKeys = new Set([
        ...story.world_rules.attributes.map((attr) => attr.key),
        ...sagaAttributes.map((attr) => attr.key),
      ]);
      tx4.add(endlessTx.saga.enableCardWeighting({ cap: storytellerCapId, saga: sagaId }));
      for (const rule of cardWeightRules) {
        if (!knownAttributeKeys.has(rule.attribute_key)) {
          throw new Error(`card weight rule references unknown attribute: ${rule.attribute_key}`);
        }
        tx4.add(
          endlessTx.saga.setCardWeightRule({
            cap: storytellerCapId,
            saga: sagaId,
            intent: rule.intent,
            attributeKey: rule.attribute_key,
            bonusPerPoint: rule.bonus_per_point,
          }),
        );
      }
    }
    await runTx(
      client,
      signer,
      tx4,
      `Tx 4 — Saga config (${sagaAttributes.length} attrs, ${cardWeightRules.length} card rules)`,
    );
    console.log(`   sagaAttrs ${sagaAttributes.length}`);
    console.log(`   cardRules ${cardWeightRules.length}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Tx 5: Scenes — anchored to locations[scene.location_index]
  // ═══════════════════════════════════════════════════════════════════
  const tx4 = new Transaction();
  story.scenes.forEach((scene) => {
    if (scene.location_index < 0 || scene.location_index >= locationIds.length) {
      throw new Error(
        `scene "${scene.name}" location_index ${scene.location_index} out of range (have ${locationIds.length})`,
      );
    }
    const sceneInfo = tx4.add(
      endlessTx.scene.newSceneInfo({
        name: scene.name,
        description: scene.description,
        metadataUri: scene.metadata_uri ?? '',
      }),
    );
    const sceneAccess = tx4.add(
      endlessTx.scene.newSceneAccess({ privacyLevel: scene.privacy }),
    );
    const sceneParams = tx4.add(
      endlessTx.scene.newSceneParams({
        atmosphere: BigInt(scene.atmosphere),
        danger: BigInt(scene.danger),
        prosperity: BigInt(scene.prosperity),
      }),
    );
    tx4.add(
      endlessTx.scene.createScene({
        cap: storytellerCapId,
        saga: sagaId,
        location: locationIds[scene.location_index],
        info: sceneInfo,
        access: sceneAccess,
        posX: BigInt(scene.pos_x),
        posY: BigInt(scene.pos_y),
        params: sceneParams,
        causalCommitmentIds: [],
      }),
    );
  });
  const changes4 = await runTx(client, signer, tx4, `Tx 5 — ${story.scenes.length} Scenes`);
  const sceneIdsRaw = findCreatedByType(changes4, '::scene::Scene');
  if (sceneIdsRaw.length !== story.scenes.length) {
    throw new Error(`expected ${story.scenes.length} scenes, got ${sceneIdsRaw.length}`);
  }
  // Sui `objectChanges` doesn't preserve PTB creation order, so sceneIdsRaw is
  // scrambled — and sceneIds[0] is consumed as the default mint/home scene (e.g.
  // the founding cast). Scenes carry no info.index, but names are unique, so
  // re-order to the story's scene order by matching info.name. Without this the
  // cast spawned in a random scene (the 會館), never in the troupe's covered range.
  const sceneByName = new Map<string, string>();
  await Promise.all(
    sceneIdsRaw.map(async (id) => {
      const name = await read.scene
        .getScene(client, id)
        .then((r) => (r.json as { info?: { name?: string } } | undefined)?.info?.name)
        .catch(() => undefined);
      if (name) sceneByName.set(name, id);
    }),
  );
  const sceneIds = story.scenes.map((s) => {
    const id = sceneByName.get(s.name);
    if (!id) throw new Error(`bootstrap: created Scene for "${s.name}" not found by name — cannot order scenes`);
    return id;
  });
  console.log(`   scenes    ${sceneIds.length} created (ordered by story scene order)`);

  // Tx 6: DreamConfig — owner dream-injection mechanism (default 50 ENDLESS, 6 decimals)
  const DREAM_DEFAULT_PRICE_RAW = 50_000_000n; // 50 ENDLESS
  const tx5 = new Transaction();
  tx5.add(
    endlessTx.dream.createConfig({
      cap: storytellerCapId,
      saga: sagaId,
      initialPrice: DREAM_DEFAULT_PRICE_RAW,
    }),
  );
  const changes5 = await runTx(client, signer, tx5, 'Tx 6 — DreamConfig');
  const dreamConfigId = firstOrThrow(
    findCreatedByType(changes5, '::dream::DreamConfig'),
    'DreamConfig',
  );
  const dreamAdminCapId = firstOrThrow(
    findCreatedByType(changes5, '::dream::DreamAdminCap'),
    'DreamAdminCap',
  );
  console.log(`   dreamConf  ${dreamConfigId}`);
  console.log(`   dreamAdm   ${dreamAdminCapId}`);

  // Tx 6.5: StillRegistry — 劇照 edition ledger (one per saga). Backs the
  // collect-to-mint loop: editions auto-increment on-chain per moment.
  const txStill = new Transaction();
  txStill.add(endlessTx.still.createRegistry({ cap: storytellerCapId, saga: sagaId }));
  const changesStill = await runTx(client, signer, txStill, 'Tx 6.5 — StillRegistry');
  const stillRegistryId = firstOrThrow(
    findCreatedByType(changesStill, '::still::StillRegistry'),
    'StillRegistry',
  );
  console.log(`   stillReg   ${stillRegistryId}`);

  // ═══════════════════════════════════════════════════════════════════
  // Tx 7: Drama resources — contested scarce slots for the drama engine
  //
  // This is the SUPPLY side of the Desire/Resource engine: one scarce, conserved
  // resource per configured slot. Seeding them makes the off-chain DEMAND
  // engine (tick-loop phase 2.7) light up — `defaultDesiresForCast` auto-derives a
  // "want one unit" desire for eligible characters when capacity < cast size. Without
  // these objects the drama layer stays a graceful no-op.
  // ═══════════════════════════════════════════════════════════════════
  const dramaResources = story.drama_resources ?? [];
  if (dramaResources.length > 0) {
    const tx6 = new Transaction();
    for (const resource of dramaResources) {
      if (resource.capacity <= 0) throw new Error(`drama resource "${resource.label}" capacity must be > 0`);
      tx6.add(
        endlessTx.resource.instantiate({
          cap: storytellerCapId,
          saga: sagaId,
          archetype: resource.archetype,
          label: resource.label,
          capacity: BigInt(resource.capacity),
        }),
      );
    }
    const changes6 = await runTx(client, signer, tx6, `Tx 7 — ${dramaResources.length} Drama resources`);
    const dramaResourceIds = findCreatedByType(changes6, '::resource::DramaResource');
    if (dramaResourceIds.length !== dramaResources.length) {
      throw new Error(`expected ${dramaResources.length} drama resources, got ${dramaResourceIds.length}`);
    }
    dramaResourceIds.forEach((id, i) => {
      console.log(`   dramaRes   ${id} (${dramaResources[i]?.label ?? 'resource'})`);
    });
  } else {
    console.log('   dramaRes   none configured');
  }

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
      latestPackageId: deployment.latestPackageId,
      adminCapId,
      worldId,
      locationIds,
      sagaId,
      storytellerCapId,
      sceneIds,
      faucetId,
      faucetAdminCapId,
      dreamConfigId,
      dreamAdminCapId,
      stillRegistryId,
      // Preserve the TransferPolicy<Still> id captured by deploy.ts at publish —
      // bootstrap rewrites the whole snapshot, so without this it's clobbered to ''
      // and Kiosk Still purchase can never go chain-ready (there's no second redeploy).
      stillTransferPolicyId: deployment.stillTransferPolicyId,
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
  console.log(`   dreamConf  ${dreamConfigId}`);
  console.log('\nNext: run test-recruit-e2e to verify the full mint flow.');
}

main().catch((e) => {
  console.error(`\n[fatal] ${(e as Error).message}`);
  process.exit(1);
});
