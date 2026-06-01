/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-06-01T16:02:28.668Z
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
  dreamConfigId: string;
  dreamAdminCapId: string;
  demoCharacters: DemoCharacterRef[];
  storyId: string;
  deployedAt: string;
}

export const ENDLESS_STORY_DEPLOYMENT: EndlessStoryDeployment = {
  "network": "testnet",
  "packageId": "0x7970a7850563603a49d3522a994b99dcf381684f049514031f17abd0b7d87286",
  "adminCapId": "0x715388b91aa195a1c3582f807250354383ebb4b7acc18eec4889361f0180fc5c",
  "worldId": "0xcd676d6920cd340f8e48c5ab94cf79da80e97d98b1886048e040de7b1804f38b",
  "locationIds": [
    "0x10ef4d7082666bef1c74e91d4df369e2682b091ca2a9c96a45f4ced5881a9f97",
    "0x24cc6093dbdd8e03ae901c2498b0197f33edebb0ce6926c514ff18dc9ef43013",
    "0x7c709da2eeb731da39880bae84f898e514bb8cd08d3e59c881b3c9e0a788bf4d"
  ],
  "sagaId": "0x741f778653636d32d1b2b39ef4e6ed31bb0ec3dd7a38f2666a8eb7cc321aa852",
  "storytellerCapId": "0x5d650793ad199f18b1d060c072bc548310413e0c8c267ce6b62f16eb1bd00468",
  "sceneIds": [
    "0x189f8bf42e63564e8046bcb7f0e1e7e0938c7ea30fc7f84bcea715aa1bc9c1fc",
    "0x205742d5b3d6800cccb560225646caf67dc034aeb275a2c89f65e1cf88e3e60a",
    "0x57ddd60d8455bf9549449ccc9c3c51d9c74ff53398e87b31e25ce5da0f2794ad"
  ],
  "faucetId": "0xa7018d4b573ccb57f20d5aec06fc4a7625719be9382eed02e9f35f813e3dc275",
  "faucetAdminCapId": "0xdcbcaf05e8d4c53a74d05d67937769a10e24ab80cfb4502ee626e051b4a62356",
  "dreamConfigId": "0x2415c51e015a56c57b220e15b4317681395454e4fb4cc25163e9a7c8573a9e29",
  "dreamAdminCapId": "0x3b62f01b9d0edf554501f02e0db8ba5b04a404e40780d4c222dcda16c35afded",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-06-01T16:02:28.668Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
