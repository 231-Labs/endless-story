/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-05-29T05:19:46.653Z
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
  "packageId": "0x6477341b9c7791c073d407b8a66084339de86dc551a47fdd9870c26a6da8c0c7",
  "adminCapId": "0x4aedd33a8019c86e34911f1c8ced56621d65f06c37d70602fb818d341c753175",
  "worldId": "0xb6f0be9b75a94cb67a1a5ecdc7b8688a286d27028bbe7b61666f9ee8d4f04958",
  "locationIds": [
    "0x32bffc96452c6f790182e52b2f676a30806d5311fe57bc2074c7aab573e256e9",
    "0x6021975aab259727a847ec50b56ddcd0f7faec76ad053ba503f771f6f53f3a1c",
    "0x83a8ad4130f3f6873811c4e96f496cd4872ef5e26905adc41f332652b7cb8baa"
  ],
  "sagaId": "0x981218d69c1572dfcb926ed9df944cc7c14c019f134ac9f2b9480a89f263f095",
  "storytellerCapId": "0x49bfeeafb49e9f6c9301f7eee90f5bf3d1def2ad566e4a301f20d6181c97a9f5",
  "sceneIds": [
    "0x0f6cbec3e3e470e06622ddb008d90dc12fca11f54bc3b870b106a3fa24a11012",
    "0xa15c8ae216e6d4d8dc81e5672e268e55ccd3d1daa55f5f68a375bb7aa0ce2aa3",
    "0xbde173ea65582a0d180a7ea0a58656faa2971cef60a659bae252cd0c5c40de18"
  ],
  "faucetId": "0xefecda63b922f49c97346c7adb67aba4d7cfad35967a458a0cb447f2c06bce0f",
  "faucetAdminCapId": "0x67bc47a2a1f92bbda0fe86c805f2d16660c8b89a36dbd528ae17b3e90ae728f1",
  "dreamConfigId": "0x09134c8d28891ea9a201f9c6869b3cd3e1fcf440ed80d7904cb9bb23384ad16c",
  "dreamAdminCapId": "0x5beb53275678c015f270ced94682bca17502a411050e8ea5151faaf1c6718b0e",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-05-29T05:19:46.653Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
