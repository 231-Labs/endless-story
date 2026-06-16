/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-06-16T12:27:30.672Z
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
  /** shared TransferPolicy<Still>, created at deploy time via still::init. */
  stillTransferPolicyId: string;
  demoCharacters: DemoCharacterRef[];
  storyId: string;
  deployedAt: string;
}

export const ENDLESS_STORY_DEPLOYMENT: EndlessStoryDeployment = {
  "network": "testnet",
  "packageId": "0xf0516b97224de8f9c1f3d38eca5f1fa4e1575bba0e2cd8bb1f3eb39b062ef7dc",
  "latestPackageId": "0xf0516b97224de8f9c1f3d38eca5f1fa4e1575bba0e2cd8bb1f3eb39b062ef7dc",
  "adminCapId": "0x93264b732c2bfc9848ad3c8e2f6243144271d9c4a0f46dcdc8255173269de2cc",
  "worldId": "0x4339ff60f664985b4edac34d337dfe59416bd7a6f28223d6621df85e06a6f057",
  "locationIds": [
    "0x4c162d20c335850e927afce441c1d5bbdba9f1b9c1b25d0856d1a0a4a264de25",
    "0xea2c9cbc9c387d043b72cc7434b3e2c7c4e2e5cd5b233477d6c53ba56ce3e4b0",
    "0x264c4d23f9afae12c99430318560e71c8a16e8495d13c1fdf119fabea3fc105b",
    "0xb8f5c29f15aca1ec140938ed2c43ee9027cef0c67e2491a563b52e730950eda7",
    "0x0798bd1677d4467e29cf83ed5dd2302c06bbcc0d823f6e1381cb8444f4d8c66d",
    "0x8fbe9010b707eff78b302b05192fffb26376e8e3ab9bb6a4bc0106fa6292a8b5",
    "0xd0c262faaf97e27ab9721520d89def42a38403e401b64d02533447b1f27fe9f0"
  ],
  "sagaId": "0x29f68f266e060dd2f10953e956dd1e6da5070c094e43372148df521d125dbf12",
  "storytellerCapId": "0x45aa9040327f06528891967974f5978b6e4dd797289ca6bf4cacaf86064129f9",
  "sceneIds": [
    "0x668afdf8e6582f12b13e1cff2f604034b8240b9b638bdf9492468757de64011c",
    "0x4eaba8640ed2769e5739cc9b4937c520208775785709f4c6df18ec43354110bb",
    "0xb22ad2e25c27aed6bae1a0516dc6e7cfd23a77c38df178de71bc0834cf9c6a12",
    "0x0077224a85510253f59bcb6a23f609e6120fbb258dbf0853cc1619fd445a137d",
    "0x0de8f4deb0be8cd53f7563001d0b682cb2ae4fc3c173c2a2f6d4f7a0134063de",
    "0x08b1d1b930dd452f58451bbe58898eaa28228b57ec2b53f2df67902de0f191e6",
    "0xb14d51e0ab30235cb9e19ccb3e0c5f9b5ba4a1e6664915a8fe646453e3de2bbb",
    "0xf71133f12bc31ec49cc19e3f360abff81dc8ecd7b5756514e103b18010898749",
    "0x8739e3e7e1adc9ebe69f23d06af34c15253ccecf94ebb6aeb244d9ea762dc905",
    "0x481ff88ae376054aa4e9bce6beb4a2cdf030b14cb6d145fb28f847b021e00a08",
    "0x04fe7f07a1a36546f6f95b3482bb3b56007805c3f97fa8f913c2a3726221cad5"
  ],
  "faucetId": "0x1f2a9275b06e8bd1df1ec239ed933a18dc2ace8acc0acb2f2b7075177042aa99",
  "faucetAdminCapId": "0x0a46048765243aa43f3faf7bdc166bf91792589c92a0a831d2a3598758beb0cd",
  "dreamConfigId": "0x35995be1f8e91fd5b18cdc942c15745d1f067aa76a49399c62d617dd230d4066",
  "dreamAdminCapId": "0x304596a38cfbb6ca5c7cdc10f4e43ad620c6c7acca7f2a582a9b8ecf8ba42c71",
  "stillRegistryId": "0xee162de15f761b32192d677cc2adb35e950ba8bcf3c92dccfce7359fe5f86842",
  "stillTransferPolicyId": "0x5c109ca43581d209f1b889edfade67c42668b4f8eb83acb334b14d9923aea0d9",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-06-16T12:27:30.672Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
