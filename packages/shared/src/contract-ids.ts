/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-05-26T04:28:16.165Z
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
  "packageId": "0xb5169dd07a09ab5f4fe666abf6dce48e5f521f0f82c6e223c0a2efb59f23e7fb",
  "adminCapId": "0xa1fabe0afb88e8628a01339efa67811f0d9878ab0f754401c6b0b3bcc2a1045b",
  "worldId": "0xb8439b0f987f142809736e15529797a10eb7ebfaeb5356e31a6577425f9b8387",
  "locationIds": [
    "0x3253b69aec28ed16c9a0b5e7a6cc6abbe41a7e171d55729058d770554f72fcbe",
    "0xa88059da919c68d1b9a723dfa3983afb24f94d54484e7e638c259997793ebdf3",
    "0xbf3b5c87d21c646a232a03f89e608f4bfebf463fecc524f0eb34f52f57a5ccec"
  ],
  "sagaId": "0x509a018344262f9b55fdaaaf0269abe6aed0da60c15fc948743c7bf09683d6d7",
  "storytellerCapId": "0x85f46b190cffafb868f48aa2a064dcfc78a0c27f72dbb7ecb1bceb942c7566c6",
  "sceneIds": [
    "0x16d02842ca47eafd3949bb4b8539fa983e7afb2ddeb2d0fa237dba928773ada4",
    "0x8e018cd1c7cba8c352743ed0259549c5c122553d5efacf9e99e1b1a8f59962a4",
    "0x918a2b0b4f275f3360369246a0b247dfd72f69c9309de5bf4fae98885dcf92ad"
  ],
  "faucetId": "0xfb00f1d2cc1f8ca93c29d88f5cc6cfc6dbf141d62770890a7fd7704fbad29afd",
  "faucetAdminCapId": "0xc9ba5cfb72d9d9bdb39c8ba407659edaf3c2a8490be126401478a520b7eb8330",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-05-26T04:28:16.165Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
