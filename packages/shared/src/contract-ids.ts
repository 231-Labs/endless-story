/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-05-26T15:36:51.470Z
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
  "packageId": "0x9c64048a53d4244fce281a3c03da7913cd7261999b06954a1094275b4ae089c3",
  "adminCapId": "0x1bb50fbce4470e8049d8ce039691bf6a31b6d937583785ab12700a0e9d33c511",
  "worldId": "0x8164abeeb9ea88d9233a24ae0c5f0e0777c06080269cec6d6fe45ebb461e77bc",
  "locationIds": [
    "0x0c410c0c22539271c9e65aa6f3c887ca11dcedc5b5faca1128be5dbf78673181",
    "0xd89b9172d2bb3ce265d80d761675984c9e674125f35afe388ed496dc017dadaa",
    "0xde5986063cbf6736db91e32c392c85448c4aefec9311e5e87b13b612a629d067"
  ],
  "sagaId": "0x23714b33a0fb6d886c631a72dd4471255811a9590dd3cc5ffccc119c600b9dc3",
  "storytellerCapId": "0xdf772c81077528075b162d6a0a69cc8e03e8f48038fb4094214ef98387380a6b",
  "sceneIds": [
    "0x08c9b96bfbd142dfa737111cfe740eb36a680ab688f0e339da68b676cc0fedaf",
    "0x5c5c06abc92eaa23af16a13732b93d6647b42e6fe51eae436f9ef81b6361462e",
    "0xe91fbd3455c8281473db4ca9f938ed5f7b31c81b5637c7f17999999f265b7d24"
  ],
  "faucetId": "0x7c99334430544f00159014407c4068b0006f241e4e478762239332cbfb724841",
  "faucetAdminCapId": "0x17a4a93f9297bcfb4991e4090e174f661754383729d0e9f3a5f956aa99ad958f",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-05-26T15:36:51.470Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
