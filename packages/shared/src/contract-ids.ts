/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-05-27T15:11:23.766Z
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
  "network": "devnet",
  "packageId": "0xc6e54c841d7c90d17ff5a825e22e8cb0320611009ad26b3671c93a235d7030ae",
  "adminCapId": "0x0253af66d3274bb0682a61e8ff0cd424aa0c1d25cb55183ed97af35a43e5beb9",
  "worldId": "0x3b67168114e2a66faf4da03b4aa1ca26058227128566635c76203683f0a6dde3",
  "locationIds": [
    "0x46241cdfa9f52b75645117d3fa6a955908270ac0733b86761ff316d4dc4fa626",
    "0xa91e84e5e0080dfe3e2ef3541be6f98da06886d660ce214ca5e221bcabfa811e",
    "0xe4ccf2c9ff7255117850fafc44126e4c50d298f9b12670b330478abcc5310c83"
  ],
  "sagaId": "0xf967c2158c40189dcfeb8b9cb2d683b5060666a40c2667783c56db4de1661767",
  "storytellerCapId": "0xb45cb00349d6905f35254af39b080c5d654b04f10b1d2469e484694df7fd14dd",
  "sceneIds": [
    "0x13dedf24b6bc8754731189fffd9f82dcff4b826fd7796ec6be6eb71e90dd4e1b",
    "0x73fe1785e39edc589b372754b1167396fbeb5731fc55fa74b5361101bc6151b4",
    "0xed5fe4c6707655d8cdeb7c05abb91c7c13fdbcc70a8f3c011213279cf32c91bc"
  ],
  "faucetId": "0x39e0c3a033d8a0fd44c8761259562ce512c9c1497afe5e3b0a651b5cd3bf900b",
  "faucetAdminCapId": "0x775fdfa61ad334e50bbc41170338c0ad34c54e3b226c51d10791beedfe0a32bc",
  "dreamConfigId": "0xbae27bbda0a6eac4212882f5000cf7e584d7a4e18f6d79b8f6d2d5c50c45ad88",
  "dreamAdminCapId": "0xc7cf9e16ee2d8406312c2500336f3588eb8cad9e98d74957952a45078f6e8524",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-05-27T15:11:23.766Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
