/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-06-12T16:22:26.186Z
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
  "packageId": "0xc6cba8ccaab95db14abb38991b0257b59ba30a0a8fcfe21243e7de0bc01484af",
  "latestPackageId": "0xc6cba8ccaab95db14abb38991b0257b59ba30a0a8fcfe21243e7de0bc01484af",
  "adminCapId": "0x97d20837acd433ac909554cce93c932b3107498fc2ac26ebdcfef5578a555c31",
  "worldId": "0x54af925dd7ef7322e2168b8f23ae322eb8ffc10bf0320c8ad976041c1c201d66",
  "locationIds": [
    "0x0694f88f0c9b5f3ec7dbef6058b0fd6bf0dca2e8e7388f153494487fd1e4891c",
    "0xb41c5e151a260b7b6bf3d3696e69268f65b0d288b259ffe863254f6ec1361fec",
    "0x68862a43cdcb93b0b95730e9f38615e9b5123b5e17be140a1ce8cfc499ae5013",
    "0xe48744d81946012d35b4bfad49feca6aff0fe979791f94eb4f38e98c78286784",
    "0xa20ef80e78d2ed96c97e868c582483a7c2b9e7f1f06a8d361cb881d1970e9e95",
    "0x0c9fa3476beb51c19af4bcb13705f2ab0288fb7bb82f39980426852901d3cae6",
    "0x6d63a400a8bd98927be207fffbd48e1098a3c002c84873b8b2d1d04b22cc9882"
  ],
  "sagaId": "0xe0fa879c992a3021353c409246a9613e672f910fde3b7e6e41bac82d57a77dee",
  "storytellerCapId": "0xf2df74dd760f54ad157165ccabfd67e2bfbc4c5fb49feedd21f99e49f87410be",
  "sceneIds": [
    "0x134626e924b64d85e0abfc880fbbf9e0d84d9867c853dca69958d67d943ade93",
    "0x3887c1cd60c2d02acc5b6d2d0d1dfabd29e15950467ecf83d6006b5efcc3167c",
    "0x6bdab663020574402ba7a4d07501a166861867cac8b81262a183c33a5b47a537",
    "0x74f6bd6af35fa1f04b6db4048ac9b9c8666ced44d15fe6acff4ac5fb81d36d17",
    "0x7fbe95b0ae8b56a88912b400fca9e276031feacc80687b42795065fe9b3e4556",
    "0x934444477e97c27d8a17dba21a183ee97f40ff75d105c9d5d8855cbc595e3155",
    "0x96d9225a675391e6da703c49a69ca0be47049a0904a388e7596e9e2400d345b6",
    "0x9ca8f627700225d19cf7958115ac549e112ef99889ed47439c3d31edc8781534",
    "0xd71cc3965472acbe6eb8948c703b1f449a9e6f3f44b4a1e61297428de768e0dd",
    "0xddcc0077aa3cfd54691c877e6c4540ae3c38e337c8c43c58f9fdb7bb0378e1be",
    "0xdfb79382be873ce9eca09ce32add359230d73246d48afdcba2786f9962182ef2"
  ],
  "faucetId": "0x57cf109510e7bff9e509b0712d6491999c83aaf92a54921ccb54f8029dc9d918",
  "faucetAdminCapId": "0x688536a237f10b641fecc0d93952c1d29280cd9002f2f43ca21cc07ad71d6a76",
  "dreamConfigId": "0xa75f890c0a48b2f03b4384aa76133b4e65face7dc92c0a9d91fb43f0272d139f",
  "dreamAdminCapId": "0x6189946d3cea34f83ae92aad86c349383b601bd5e5d322f41676235e6e06a24f",
  "stillRegistryId": "0x34cc868aa566481e048095d00a2b2494ab5d8b4b2cc20858da8bcb11d1bd485d",
  "stillTransferPolicyId": "",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-06-12T16:22:26.186Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
