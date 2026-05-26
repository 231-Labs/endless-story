/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-05-26T03:05:39.269Z
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
  "packageId": "0xe6aac1d0ed808991926d419898d289a848b91fec3b47b52c0235129b69c195a4",
  "adminCapId": "0x761188e149b68a3129901c56b748ed6fd9dec9c33e1ddd71640296923e860d1c",
  "worldId": "0x62b4b5628f7ac75c1d63316ef2b955d53657beafadd9473a9a9d3a10b48cb40a",
  "locationIds": [
    "0x2907168e8475e45fae91df72e710e4c63abfeb019b6398ea0d8bd1913caf8b10",
    "0x6ab4078ded71b4e0de2f65bf0fdc7382511df36e347a06d954ad6c6d1d45f8f8",
    "0xaa72dbd90f537e4665cc73e95cdca8c4bd10623e51473322061e45abb922bc22"
  ],
  "sagaId": "0xde9828d9be548ea7a138a839681456ced4e875f5f5114dab11bc88cff1789b53",
  "storytellerCapId": "0x37554ca371b1a8600aa36d191a38fc2116d45e397ce9b7bc9612abea4c807dea",
  "sceneIds": [
    "0x1be3271bf06535ea83fd741a6c49489f5e7d3be1bbe2ca4f20ab9a0bfa442bd5",
    "0x91b9aa99252156c264d945fd89e598c7a9c5f9684518ce8a4bcc0afd2e55f2fd",
    "0xb4f563a87d017f78ed1d3a9d053359f94fbc9e778185890b555397a09f6e0da6"
  ],
  "faucetId": "0xb4cd8256c0e02635baa4f420893a8f8ba9fcae73a954547df04fb75e72fe7a57",
  "faucetAdminCapId": "0x072d8dc7ffa5ab8ae05bf50d6eaef52c89379c2c91a7c50d5a1774e1bc619a10",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-05-26T03:05:39.269Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
