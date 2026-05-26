/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-05-26T10:00:06.702Z
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
  "packageId": "0xa88bc7045f2f785e7db82038e52e48ca292b0c838bcf9ac1465ea01c7320a5ca",
  "adminCapId": "0xc1f949099b040e2eddc29d81f075db2a1eac975bdb90f36dcf16ac6d2ec7995b",
  "worldId": "0x8353cb445fc60ccf753fe2fe0614b25ae5752ddfcefc9a0fe129251477b6a733",
  "locationIds": [
    "0x66f826262939bd463b46314ee6a9f1bfd739b81380a599111a46813065207d0a",
    "0xa35bdc31b972f9859b49c8c2d509ae29bff2d80f7660361d26f66301cf41bcbc",
    "0xff54354923e58a6aea54690f5313d8c41367858ea401178b0f9bd090d1aa3798"
  ],
  "sagaId": "0x0fdd24e965285ddd71a00626bace935dbebb0ce91be8739f614de682d7577b0d",
  "storytellerCapId": "0x7da8705d180d080385b6d38c086b30d22a77a2fb3374b5d6584365a44dc7e5e5",
  "sceneIds": [
    "0x7f3dfed377d0eaba3c7c2105d2a0b83ea4e1a3b8a494d7c78871e8508a46a1dd",
    "0x9a42868e0ed6658ac5565efa400f5a194299872f0778d17701d3345cfbf58285",
    "0xa05b09a06afb3496d385f6c8bf490542061d945749248fee5b092c9b414abea1"
  ],
  "faucetId": "0x0b23be82f8fdfe3ac4ea75bb1517150061f92c1b74f32081700d2129a1a0065b",
  "faucetAdminCapId": "0x43e92096f8cea0b56cb6204df3dd1565fc2e804ff89ea2cb36ed62724d425ced",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-05-26T10:00:06.702Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
