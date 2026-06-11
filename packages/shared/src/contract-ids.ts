/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-06-11T16:09:30.938Z
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
  "packageId": "0xec6e9a6df334a4342a850842235fedeb0da131324f8c3372f4a8d145acc645e8",
  "latestPackageId": "0xec6e9a6df334a4342a850842235fedeb0da131324f8c3372f4a8d145acc645e8",
  "adminCapId": "0xa94f7312c3d478261e7b37eb4f305680ba1f90bb91bc20856a5d2fb29364fd56",
  "worldId": "0x5739aaddb4f093122d84926a87156b72dd874351cb1855d4d345d5cee1f9a2c5",
  "locationIds": [
    "0xa321e93d1aa7d8519d0e72a3051bb66ddb6fd8d4b0507fdfbb90314ce086d13d",
    "0x61969710aa1c8a8321ff8d6918bab34932e8b89b72d440d9fdc8b0a6a769bd49",
    "0x63f2dd6a2085120db394b92b62520fffe300b91e66d9531615d0500d72067176",
    "0x6cc36d3dd06f9db7db84254000ac5421d2932542afcb22b6d8e3054a2d797da5",
    "0x6572568c1d29956a06d3f36d200cd509bd97da769f13ae84d6d51fdc5d5272de",
    "0x9a3fc41b9094e7bb81a1b9263594279e63e84f33225f701ff5901e6f744754b5",
    "0x6e11bcfc6489955682af7ae6dc830ae6856bcb8448158c5eb532ec1e39e50c8b"
  ],
  "sagaId": "0xe4255426887887e75b99a5a564a64d6b45dce77edd1cf973a11aa09786fc3dce",
  "storytellerCapId": "0xb4d65f4cc969f6c90b3cb815d51c11ede7bfbab0db5cac704ddd452fdad4fbad",
  "sceneIds": [
    "0x039b66a9b6b5a610b14feb52246103859efac4dcf39ec95d6955dec21a5cd704",
    "0x0a859ecb59206e46e804330a6fc04a95c89ef6ad732830424fb546fd55512647",
    "0x0e5de527ba2e987255908321d32fdb6191748103682174fa1148da34faa63b7b",
    "0x2944203455dd3f66f5d5067436cca4403c8321e99469575c355eb7bfae1b5c97",
    "0x72b4c0f751c904f5c05290f0deb5b0fa60251f580ff284fe3c8bc780b6c093a2",
    "0xa0f1f26537608d520b6a2d2a7af4da8b27c1d3d1a1672f9a6e8140426128dff7",
    "0xad7a822c0bae24eb7eb35cfaccdaf2b1ad0275016f6ba2b29c09b7bdf5bc1061",
    "0xaf65f0ebaacfe0294872b241f5d495069fdbc44f64f48978ee9b5eb2cdea0277",
    "0xd127d59be57331afc66c0ff6965beaecc9409d43820571188a7a544c35bfce3a",
    "0xdc2f316b1de813626b70d60879c24059adb62321d97888975deb435e6f4b0927",
    "0xfb6dfab9c7cb06782d36bd0bbe7cabf04cb4205881025faf089c9bd7bdc6917b"
  ],
  "faucetId": "0xc95749338f214f9c0ab2f84eaabbc2f071e66af74f3bfd9f8901bfa4423b63ef",
  "faucetAdminCapId": "0xfa57663d6410fad947c380baf892b2e27076cf962b10702cf0a0c77610a67953",
  "dreamConfigId": "0xa5cd10f7f94f7a40d8f74a3c5ab9447fd8c3e1d53b53ecd5007c1ef2e05a2447",
  "dreamAdminCapId": "0xb54b14ee479ce83c1e22bd5b879181cb3e7cd17b295989680f05d864347025a3",
  "stillRegistryId": "0x0b6ca337f955db357f845115eb483c83798dbcef0bbd20a75b4f28f103b1550f",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-06-11T16:09:30.938Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
