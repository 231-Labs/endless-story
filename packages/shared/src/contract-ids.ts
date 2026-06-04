/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-06-04T16:20:03.055Z
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
  demoCharacters: DemoCharacterRef[];
  storyId: string;
  deployedAt: string;
}

export const ENDLESS_STORY_DEPLOYMENT: EndlessStoryDeployment = {
  "network": "testnet",
  "packageId": "0x2e8f555d7c93c61ca2d4a3f257a43394059354d3648335fdf9b330736491e1a9",
  "latestPackageId": "0x2021f28f7878b5550961c090091f596c14a309a4e165aa2fbe65d8bbbf354e33",
  "adminCapId": "0x4355b2456bf2179bf1177397fda15b8e7a66729ec107ec27d7f10adcd1bba1e3",
  "worldId": "0xba6883f7267d28a2eca57913f2e723373be61d593e12e4975ca72201bac50d82",
  "locationIds": [
    "0x0907317eb62bad711c7bb15ac39641c5142ab2f6208f30f8247f809635a148c2",
    "0x3b175549e28d7d94d56b7b764e1653a656ec7010d8976faab50756e54a8f4f89",
    "0x8cb73803925fadb5e9b5433170f75d46536e4f709d7e80cb92580d63b3ac0ac4",
    "0xc0c14273f686d898eed96b1712e091a64af86b6b4c4755a71a3b96392313eda8",
    "0xc9d07f7d75068d00b45bd13cae2f2a6a69338ae433e2543c7f624b1fce792cf8",
    "0xcb5bcf77c3f75f07b0934886e1a586f7945f9b8e636fa32df1a990744dd64eeb"
  ],
  "sagaId": "0x8d9bcec413bbd5fe669b5499aa0106e061bf46d28801ea4fafe292bac9385e0a",
  "storytellerCapId": "0x31eaf64fc772adbc91ab03c98b2f96cd4be6f302fb256af76aed9c84805859d3",
  "sceneIds": [
    "0x61db223c9183ae4c881c0df59dd431019d4c55ab3e402b72083e3d157c5db631",
    "0x953a13bf28ad057da15d0b543e6611b7cfd48fa0185c68f35e979b5b84a5caac",
    "0xb8837dcfd06c3b59ed7c4958496f5590d995c68e89c4a25327e5249b79e0f17c",
    "0xca8e64c2481453a4daaf9720ed22488eb4b7b0ee515f96da1005eb5cbe15d9c6",
    "0xe367c0d523365afa82f79dda13cc6b2cd13be98d3a305b07c64cad49c3d38002",
    "0xe77d13ba359dbed1979ce3909dff69f924d3ada8acb7bbb0b9b9cf5c798b82bb"
  ],
  "faucetId": "0x8bbf970edc358040709132347568bcba26b5ba56300b349f2215239bca84d4f5",
  "faucetAdminCapId": "0x67450814e6bd7832b5f1197b92d4e42855847bccaa2e5abbb89c11683584d6d3",
  "dreamConfigId": "0x9a2ab9c5717b58247aed3851bbf70acc692339d86d93c4da3610e9e8503d4ff8",
  "dreamAdminCapId": "0x12d4a371b62a0c6fe27a60a6d0cee93aab4a6c4cf4accb60a69c12b6ba2a192e",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-06-04T16:20:03.055Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
