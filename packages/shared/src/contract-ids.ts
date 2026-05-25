/**
 * Single source of truth for endless_story on-chain deployment state.
 *
 * **Writer:** `@endless-story/cli` (deploy.ts, bootstrap.ts, reset.ts).
 * **Readers:** sdk, runner, web (admin UI). Never edit by hand.
 *
 * Empty strings / arrays = field not yet populated by deploy. Phase 0
 * publishes character.move only, so worldId / sagaId / sceneIds /
 * demoCharacters stay empty until Phase 1 adds the corresponding Move
 * modules and cli bootstrap PTBs.
 *
 * See AGENTS.md → 「鏈上架構」 for the contract.
 */

export type SuiNetwork = 'localnet' | 'devnet' | 'testnet' | 'mainnet';

/** Per-character snapshot — written when cli bootstrap mints genesis cast. */
export interface DemoCharacterRef {
  /** Story-seed id (e.g. `char_ye_tingfang`). */
  slug: string;
  /** Display name. */
  name: string;
  /** Sui object ID of the on-chain Character. */
  characterId: string;
  /** Sui object ID of the OwnerCap held by the recruiter. */
  ownerCapId: string;
  /** Sui object ID of the ControlCap delegated to runner / saga. */
  controlCapId: string;
}

/**
 * Snapshot of one endless_story devnet (or testnet) deployment.
 * Populated incrementally as Phase 1 modules come online.
 */
export interface EndlessStoryDeployment {
  /** Active env when cli published the package. */
  network: SuiNetwork;
  /** `0x…` package address — set by Phase 0 publish. */
  packageId: string;
  /** AdminCap — set by Phase 0 publish (transferred to runner address). */
  adminCapId: string;

  // ── Phase 1+ fields (empty until corresponding Move module ships) ──
  /** World shared object — Phase 1.2 (world.move). */
  worldId: string;
  /** Location shared objects keyed to scenes — Phase 2 bootstrap. */
  locationIds: string[];
  /** Saga shared object — Phase 1.3 (saga.move). */
  sagaId: string;
  /** StorytellerCap delegated to runner — Phase 1.3 (saga.move). */
  storytellerCapId: string;
  /** Anchor scenes within the saga — Phase 1.4 (scene.move). */
  sceneIds: string[];
  /** Faucet shared object — Phase 2 bootstrap (public drip endpoint). */
  faucetId: string;
  /** FaucetAdminCap — Phase 2 bootstrap (admin reseed / config). */
  faucetAdminCapId: string;
  /** Genesis cast — Phase 1.5 (character.move voucher redeem). */
  demoCharacters: DemoCharacterRef[];
  /** Story-seed JSON id used by bootstrap (e.g. `spring-snow`). */
  storyId: string;

  /** ISO timestamp of the last cli publish. */
  deployedAt: string;
}

/**
 * Initial unset snapshot. cli `deploy.ts` overwrites this file with a
 * fully-populated literal after a successful publish + bootstrap run.
 */
export const ENDLESS_STORY_DEPLOYMENT: EndlessStoryDeployment = {
  network: 'devnet',
  packageId: '',
  adminCapId: '',
  worldId: '',
  locationIds: [],
  sagaId: '',
  storytellerCapId: '',
  sceneIds: [],
  faucetId: '',
  faucetAdminCapId: '',
  demoCharacters: [],
  storyId: '',
  deployedAt: '',
};

/** True once Phase 0 publish has populated packageId. */
export function isDeployed(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.packageId.length > 0;
}

/** True once Phase 1 bootstrap has seeded the world. */
export function isWorldSeeded(d: EndlessStoryDeployment = ENDLESS_STORY_DEPLOYMENT): boolean {
  return d.worldId.length > 0 && d.sagaId.length > 0;
}
