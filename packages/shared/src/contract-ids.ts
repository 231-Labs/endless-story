/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-06-11T07:39:36.460Z
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
  demoCharacters: DemoCharacterRef[];
  storyId: string;
  deployedAt: string;
}

export const ENDLESS_STORY_DEPLOYMENT: EndlessStoryDeployment = {
  "network": "testnet",
  "packageId": "0x435fb637768926a02c7c80f0cf79e74cc0f7b09fbc0375f5cee344c2a9640b7d",
  "latestPackageId": "0x435fb637768926a02c7c80f0cf79e74cc0f7b09fbc0375f5cee344c2a9640b7d",
  "adminCapId": "0x9cdab7b065b9842b358039f0d7d1d052ffa31e5627b176704b4dd3abd6fa3a0d",
  "worldId": "0x8b473e21a1756960154651be8fc1f81700b46d8e14cb9da48ca56db20bc4cb9c",
  "locationIds": [
    "0x93eecf39070160612f264092e211c61a659b9fb35fcc08149da7244d5bfac39e",
    "0xcc5fd4a5e2febfb7a8cc547628fcffbcb6a84694bea674a6851d0de23c268e04",
    "0xbc18b789ee28b49f447c62401b6b478911cdd038ae05d6ca9f4bc20d75753ea7",
    "0x0e535718cb6b450f5214e89daf908c5d8f8256d2976df1dfbb7a033713ef65e6",
    "0xffdec3d8f93a596fb5867eecc2c92bb0f3d95e3248bab66f7ef1fcc948408e91",
    "0x1cb7c5c85b83c828013bda8fc429c0d081fa7638a8ffb22fcd497f7764b4b6f0",
    "0xbe0ddb6cd48103a6e774b31a4d0ed801c662ce583bddd76b104c01e130c660b1"
  ],
  "sagaId": "0x486801141d508c49433ff64aefd6edb2c78059278f1dce2b4d24f15e99cd722f",
  "storytellerCapId": "0x61e5e0403aa612aaad63a96a8aa5931a0931099812da87cf98e4cc1b27aad836",
  "sceneIds": [
    "0x1f40b09e2246cfc654f1d8a1f8942166338e884bab21285cdb67c90b51ec96cf",
    "0x30c6f73a118a2272c135b8769a36b14dc51036a3e2d20a5f396086552a12da95",
    "0x349f8fba6d2c60338c8ee967c478089dca79cb1d50f619e52b8b85764a93d7c7",
    "0x4552e0658c9654596553512eef2521a4a7ff68823a22ad48aaf24c9275bc91b5",
    "0x7b76141faae77f267b60102984a5708e631565efb0e68f4bc8896baee4e74c9a",
    "0x89da2186cbe23bab1232bb6c7f6cc43f119a678bb7709a25671810c20816078c",
    "0xa61b4b48eee69c77cf99023a37c1dfd1a1c4065131bae7e91cb8cecb317f3ffa",
    "0xb1c67d9c7543d174148caa08d2283e1c65baf108c443fb9aa0a91a8da6863f90",
    "0xc8a56c0d8f70bd79a812caf0393fdf391384b456b44853daed74123583008b39",
    "0xd97411f8485bbc504df024c1e9bd834956c9600c92b07c4082b2a27bdd59c377",
    "0xe83722813f482255ac9fabe68519f4510d53e14c93eee82621fb60b48e03d354"
  ],
  "faucetId": "0x181fa23e8a1e377b2c0ea76829f5fd1882e53399a8f97e0857b340c314764e45",
  "faucetAdminCapId": "0xa61e39d251e1d04bca6c603560ecbcc56a91c300c12e323da9ab4e4cb4eb5c79",
  "dreamConfigId": "0xbbaae69e37721efea8a6af188048ebb348ab5347f24380efbe8779777a04ef50",
  "dreamAdminCapId": "0xd0937c1ce89af0fda0b931ccd76e518fcedcc471a6c8a1eccd021544de1ed1fc",
  "stillRegistryId": "0x4420b1ecdccdc3006f66257385b90205683de54adddf20946b1c3baf5ed78e81",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-06-11T07:39:36.460Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
