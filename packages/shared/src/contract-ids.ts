/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-06-15T07:35:22.387Z
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

export const ENDLESS_STORY_DEPLOYMENT: EndlessStoryDeployment = {
  "network": "testnet",
  "packageId": "0xfcdcdc1fd8fd21afef21ddc52f5097efecdf204edcee6cf72d81679416488bf0",
  "latestPackageId": "0xfcdcdc1fd8fd21afef21ddc52f5097efecdf204edcee6cf72d81679416488bf0",
  "adminCapId": "0xcf54d2577fe0d1532612c23796a67340b0b00d862880d03a7296c0bee6211a74",
  "worldId": "0xebbd61e53b0c3a4a0156c33a9229d9da821ece69e0aff8df3f1bfa80268a8817",
  "locationIds": [
    "0x075f3bfcb88ebb24420178b2bdf9957d601e63fa7fe22ab27d8b1833dcd5775b",
    "0xbf215bed5fac4c1218d3f802f2c37bd03b3e3872147ef8bc171d76f3e00ff0f4",
    "0x4ca4b2c0751f45ef65e36c3968fd1ef69a82f8b57b194d579d2a1ed8a1dc7deb",
    "0x529548bfdf316123200fbe447c866545c9b8c2bce31057cd9ba062a6800dacf7",
    "0x269d1cade4ac3285e39e9eb62934a6f852bf1ec7246ba5b64b921d69bd1ff360",
    "0x19eb5223e847167615ceccf570dbf3c63695716e04a209b93ac93b727ff6a4be",
    "0x66ff1f5b6e18e74b4b62fcbd4378f2934b941246c1f92e0ccee059e0041d00d7"
  ],
  "sagaId": "0xa78b883ad7342751fb4642d6621d36dd7700346ceb2d8546cd4d6050c15783f4",
  "storytellerCapId": "0xa0dc4348a391a26e46c2b2fa37406399ea60bdc4178f5af9ccc927060966bef1",
  "sceneIds": [
    "0x0abc194ac6cbe8dbc9b7f29d3f64e8014a96ff738a71355fc8718ce322d1ce19",
    "0x2b041608181ac89d2390a1507254e80b91ada92ebc2f5b666810079dcbda7f84",
    "0x32a61686fe48c5d21fdb7d837853a4b5bf698820027fbc561aa13b84adae83d7",
    "0x704a6395a60cdeb71e1a5a732d607f5d3abf3145ec2884ec66c5370f53e7b24f",
    "0x80f7cdab0ed760581480541b9300883d86de2e54c96966f37a06fe81152af13a",
    "0x834e39ada7c5606eabfaeb97935cb424bc2843e18f1bfe309f3098c724ea09c9",
    "0x895e56a156eb119d1b48f79c81d8460b9159da155e7a6a4c10cd261957a46746",
    "0xb02125732f40bf9b112f6742cf9a8cc37a2495aec2b17ba5091503ac9d643b26",
    "0xb89dff8643f92ead1c5d42d8a1d9feb49d61db800d0d9ccc200a496e1ac302fb",
    "0xdb674744285b0e396e92c97d368246ec84bfb785195da986b833700dcd0190ac",
    "0xe9bdccd6e8e7eefab51ff8064f543a302ce92697767ea735c550dd9dadcc4679"
  ],
  "faucetId": "0x5301c718036a2feeb89d4daaec7be7638bdc48e270790120a42b85900075d846",
  "faucetAdminCapId": "0x86cd349b967a9eefe663129690bcbab634e722a7d19a4a1a7d2f170e34535488",
  "dreamConfigId": "0xca11c6209b3e725e8301afc18c06c7a63566a99406fa79258d5d74ab0dd21db9",
  "dreamAdminCapId": "0x744074e80fed83e21e96c7f0a1e63bd59149815e669728f07c2659d21b7ac275",
  "stillRegistryId": "0x18a2c39af1005770a377b93888a420e10a92e867ae928b1202b4434004b3d6b3",
  "stillTransferPolicyId": "0xd46d2690562db4e91299ffe3cfb5a539f19c95af1bce5352506a11e9742a80aa",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-06-15T07:35:22.387Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
