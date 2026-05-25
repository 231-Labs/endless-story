/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-05-25T07:53:50.535Z
 *
 * See AGENTS.md → 「鏈上架構」 for the contract.
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
  packageId: string;
  adminCapId: string;
  worldId: string;
  locationIds: string[];
  sagaId: string;
  storytellerCapId: string;
  sceneIds: string[];
  faucetId: string;
  faucetAdminCapId: string;
  demoCharacters: DemoCharacterRef[];
  storyId: string;
  deployedAt: string;
}

export const ENDLESS_STORY_DEPLOYMENT: EndlessStoryDeployment = {
  "network": "devnet",
  "packageId": "0xc420cbe105cf3d2bc4accdb38f06742f55e61205a1f541967ecc93651c366fa5",
  "adminCapId": "0x1c5b734988c4a54263bb9bfd9e3933749583c58fe98e0d1924198ba61140cf07",
  "worldId": "0x54bd8559ce381e8755d109b4fc1221c3efb6c4167daeceefa6d29995388e132e",
  "locationIds": [
    "0xa59272e5c56d574464075bc6b8be97d5dcc1d110d77e70ee2ef9306eb5e99253",
    "0xd986f3e490d341849799a66a3f8f5ecfaa90b2f9e7189791f6cd9eeb4e491dc0",
    "0xe6a9e7ba1837d0be9e5932f8037c7f5c84af304411998fcfeb391248766aae00"
  ],
  "sagaId": "0xd14967b7debf234778075c17d93d9c5cec0efe8ea9a3fb29f13afec067e682e9",
  "storytellerCapId": "0x34ed2deac2f6c92cebfe6a42dd654a86e8a4087caee4a871a02935950093e2e3",
  "sceneIds": [
    "0x05de3790c028c7c49297961982c960705ef4c9dd4b8f326d52cea2a04a6196f6",
    "0xa78cd0d752beaf642f95af4dd96391f6398b6e295b918fb65a833345ce11c5f8",
    "0xeb9aa4fd4ce0bb7305854bcf004bca4fa0f355b6bdcf830ae3922be4676a82ee"
  ],
  "faucetId": "0x79cb9908825b3207dc1b37b111ac6d2be2f8fbf61b2febdb17ac55a9556b9f77",
  "faucetAdminCapId": "0xc47c60549de890617f810cefb318e60a005e8b7eb057dd6c000f0ea50912ffbd",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-05-25T07:53:50.535Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
