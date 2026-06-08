/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Last written: 2026-06-07T12:54:07.199Z
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
  demoCharacters: DemoCharacterRef[];
  storyId: string;
  deployedAt: string;
}

export const ENDLESS_STORY_DEPLOYMENT: EndlessStoryDeployment = {
  "network": "testnet",
  "packageId": "0x259876ca0a9a8372e0d30989897c726332cbeea87441f9f335acd0c411d563b4",
  "latestPackageId": "0x259876ca0a9a8372e0d30989897c726332cbeea87441f9f335acd0c411d563b4",
  "adminCapId": "0x0954484a23a1f0089882f4c8e6664d47c6907ebc48b5529780af6edbf5c4fb8f",
  "worldId": "0xa07225d20bc95cf2510b21879d17b7dd8d1b5ad81822aea18c932b1fc6c4c41b",
  "locationIds": [
    "0x30029062ed32d976d01b6b01bce647b5f81beb07afa374472149b7e291a27e0d",
    "0x7ce95a874c773f609c822e548783d00a3cdcabfd6aa3442cacc0e57caf071cfd",
    "0xab9018301f607ff1c2842601aff5b908117d13a4329b127f776840d71577de22",
    "0xb7e483994c79837af7d693c5a41ff76cdf9e1bc3bf5ec2466f38fafa02d57e9f",
    "0x9c38f971b2b97c4f82e89356e61d40ae05ad3bbfea5a6307a0e7113a9b2361a2",
    "0xd2793d4faa80875353e4934daced2e064dd789af77816763fd5f360d728a3da9",
    "0x50a61a362b4c5fb1d728ed1c210e563e4e9d1a99326586274b532d9948c2f6f4"
  ],
  "sagaId": "0x3ec2dca14f7b7cf3a970b33fc057911a68cf5d263952e5c02d2df6c8eaa81811",
  "storytellerCapId": "0xde5cf1a29fd154c6be31d7eff482f0aa443783844d342938583996f70c8d9c4a",
  "sceneIds": [
    "0x16f24ff31e0b1d4dce365f6b59413b796d5dc76cc5efbd83115ba14599d0eb98",
    "0x225b6124c186dd8e449cd71e0ee375a7ae707209d2fde130be18728bec2c7e7b",
    "0x4f47a10e152b545b89d40a5426175a9d3bfd9205e520d95c0df4ed8dd0fb53fc",
    "0x55487f98e3e975da300a3c9e62ccd9b6ccfb97bf07be66bd2868ea852bb82977",
    "0x5982c6837273a40623ace67d705aa3c7704c0a3eba6b2eb7e6aaececa42dd7e5",
    "0x5e1aca896664343f4445c42b5bc33b31e7b7bb2585e30a799a3d113dfebef26c",
    "0x79c98712e753eec330dc117c55e90641b55ec03c8266866ae3b6e4c82a6b047a",
    "0x8b3cc9a6f70431ab20e2639e059154303c2c6eb1f6d9358981a4ab26d0a3c956",
    "0x9c6aab91c6dbe3c7831c13d63394626468e8e7338fca6a882ee330bf9306d025",
    "0xef89b510f4d10dfb0051b382eee07209dc15db337e7d11f800a865de95f6496e",
    "0xfb208f014e34c652874cded9948004a1efa783bb28c544b3c83a8e613aecb602"
  ],
  "faucetId": "0x0d48148c8fa26ad4a46c6ac8564ad5cc87665fd84067d140dcfcb57e30a42c64",
  "faucetAdminCapId": "0x6b7671677ab1da850445ba1d8ec0c91b46860040448770d458f07e4a5010cc0c",
  "dreamConfigId": "0x6c245b47d7d45f5d24173f928b4a455f7adeac72d531c87d2b6b15b1f2e175cb",
  "dreamAdminCapId": "0xad55b1d0278bbdd3c587cbbd9361daa8b05a1430f5263599d9dddd781e612333",
  "demoCharacters": [],
  "storyId": "spring-snow",
  "deployedAt": "2026-06-07T12:54:07.199Z"
};

export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
