/**
 * Writes packages/shared/src/contract-ids.ts after a successful deploy.
 *
 * **Single source of truth contract**: this is the only function in the repo
 * that mutates contract-ids.ts, per on-chain-architecture principle 4.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DemoCharacterRef,
  EndlessStoryDeployment,
  SuiNetwork,
} from '@endless-story/shared/contract-ids';

export interface DeploymentSnapshot {
  network: SuiNetwork;
  /** Original package id. Struct type filters stay anchored here after upgrades. */
  packageId: string;
  /** Latest package id. Move calls target this after upgrades. */
  latestPackageId?: string;
  adminCapId: string;
  worldId?: string;
  locationIds?: string[];
  sagaId?: string;
  storytellerCapId?: string;
  sceneIds?: string[];
  faucetId?: string;
  faucetAdminCapId?: string;
  dreamConfigId?: string;
  dreamAdminCapId?: string;
  /** shared StillRegistry (劇照 edition ledger), created at bootstrap. */
  stillRegistryId?: string;
  /** shared TransferPolicy<Still>, created at deploy time via still::init. */
  stillTransferPolicyId?: string;
  demoCharacters?: DemoCharacterRef[];
  storyId?: string;
}

/** Compose the full TS source for contract-ids.ts, with the deployment block populated. */
export function renderContractIdsFile(snap: DeploymentSnapshot, deployedAt: string): string {
  const d: EndlessStoryDeployment = {
    network: snap.network,
    packageId: snap.packageId,
    latestPackageId: snap.latestPackageId ?? snap.packageId,
    adminCapId: snap.adminCapId,
    worldId: snap.worldId ?? '',
    locationIds: snap.locationIds ?? [],
    sagaId: snap.sagaId ?? '',
    storytellerCapId: snap.storytellerCapId ?? '',
    sceneIds: snap.sceneIds ?? [],
    faucetId: snap.faucetId ?? '',
    faucetAdminCapId: snap.faucetAdminCapId ?? '',
    dreamConfigId: snap.dreamConfigId ?? '',
    dreamAdminCapId: snap.dreamAdminCapId ?? '',
    stillRegistryId: snap.stillRegistryId ?? '',
    stillTransferPolicyId: snap.stillTransferPolicyId ?? '',
    demoCharacters: snap.demoCharacters ?? [],
    storyId: snap.storyId ?? '',
    deployedAt,
  };

  // Single source format — schema must match `EndlessStoryDeployment` exactly.
  return `/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** \`@endless-story/cli\` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: ${deployedAt}
 *
 * See the on-chain architecture contract.
 */

export type SuiNetwork = 'localnet' | 'devnet' | 'testnet' | 'mainnet';

/** Per-character snapshot — written when cli bootstrap mints genesis cast. */
export interface DemoCharacterRef {
  slug: string;
  name: string;
  characterId: string;
  ownerCapId: string;
  controlCapId: string;
}

/**
 * Snapshot of one endless_story devnet (or testnet) deployment.
 * Populated incrementally as Phase 1 modules come online.
 */
export interface EndlessStoryDeployment {
  network: SuiNetwork;
  /** Original package id. Struct type filters and type arguments stay anchored here after upgrades. */
  packageId: string;
  /** Latest package id. Move calls should target this after a Sui package upgrade. */
  latestPackageId: string;
  adminCapId: string;
  worldId: string;
  locationIds: string[];
  sagaId: string;
  storytellerCapId: string;
  sceneIds: string[];
  faucetId: string;
  faucetAdminCapId: string;
  dreamConfigId: string;
  dreamAdminCapId: string;
  stillRegistryId: string;
  /** shared TransferPolicy<Still>, created at deploy time via still::init. */
  stillTransferPolicyId: string;
  demoCharacters: DemoCharacterRef[];
  storyId: string;
  deployedAt: string;
}

export const ENDLESS_STORY_DEPLOYMENT: EndlessStoryDeployment = ${JSON.stringify(d, null, 2)};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
`;
}

export function writeContractIds(
  sharedSrcDir: string,
  snap: DeploymentSnapshot,
  deployedAt: string,
): string {
  const target = path.join(sharedSrcDir, 'contract-ids.ts');
  const content = renderContractIdsFile(snap, deployedAt);
  fs.writeFileSync(target, content, 'utf-8');
  console.log(`   wrote ${path.relative(process.cwd(), target)}`);
  return target;
}
