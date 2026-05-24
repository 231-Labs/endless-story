/**
 * Phase 0 deploy: publish `contracts/endless_story` and write packageId +
 * adminCapId to `packages/shared/src/contract-ids.ts`.
 *
 * Phase 1+ additions (after world/saga/scene/character full migration):
 *   - PTB bootstrap calls (create world, create saga, anchor scenes, mint cast)
 *   - Story seed JSON loading + validation
 *   - AdminCap transfer to runner address
 *
 * Usage:
 *   pnpm --filter @endless-story/cli deploy --env devnet
 *
 * Flags:
 *   --env devnet|testnet|mainnet|localnet  (required)
 *   --gas-budget 2000000000                 (default)
 *   --dry-run                               (validate flags, do not publish)
 *
 * See AGENTS.md → 「鏈上架構」 + skill `/devnet-bootstrap`.
 */
import * as path from 'node:path';
import * as url from 'node:url';
import { flag, hasFlag, requireFlag } from '../src/lib/flags';
import { assertActiveEnv, suiPublish } from '../src/lib/sui-publish';
import { writeContractIds } from '../src/lib/contract-ids-writer';
import type { SuiNetwork } from '@endless-story/shared/contract-ids';

const VALID_NETWORKS: ReadonlySet<SuiNetwork> = new Set(['devnet', 'testnet', 'mainnet', 'localnet']);

async function main() {
  // ─── parse flags ───────────────────────────────────────────────
  const env = requireFlag('--env') as SuiNetwork;
  if (!VALID_NETWORKS.has(env)) {
    throw new Error(`--env must be one of ${[...VALID_NETWORKS].join(' / ')}, got "${env}"`);
  }
  const gasBudget = flag('--gas-budget', '2000000000')!;
  const dryRun = hasFlag('--dry-run');

  // ─── resolve paths ─────────────────────────────────────────────
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..', '..');
  const contractsDir = path.join(repoRoot, 'contracts', 'endless_story');
  const sharedSrcDir = path.join(repoRoot, 'packages', 'shared', 'src');

  console.log('endless-story · Phase 0 deploy');
  console.log(`   env          ${env}`);
  console.log(`   gasBudget    ${gasBudget}`);
  console.log(`   contractsDir ${contractsDir}`);
  console.log(`   dryRun       ${dryRun}`);

  // ─── preflight ─────────────────────────────────────────────────
  assertActiveEnv(env);

  if (dryRun) {
    console.log('\n[dry-run] flags valid, sui active-env matches. Skipping publish.');
    return;
  }

  // ─── publish ───────────────────────────────────────────────────
  const result = suiPublish({ contractsDir, network: env, gasBudget });

  // ─── write contract-ids.ts ─────────────────────────────────────
  console.log(`\n[contract-ids] writing snapshot…`);
  if (!result.adminCapId) {
    console.warn(
      '   ! No AdminCap detected on publish. character.move Phase 0 does not\n' +
        '     emit one by default — this is expected. Phase 1 modules add an AdminCap.\n' +
        '     Writing empty adminCapId; bootstrap will set it later.',
    );
  }
  const deployedAt = new Date().toISOString();
  writeContractIds(
    sharedSrcDir,
    {
      network: env,
      packageId: result.packageId,
      adminCapId: result.adminCapId ?? '',
    },
    deployedAt,
  );

  // ─── summary ───────────────────────────────────────────────────
  console.log('\n[done] Phase 0 deploy complete.');
  console.log(`   packageId    ${result.packageId}`);
  console.log(`   adminCapId   ${result.adminCapId ?? '(none)'}`);
  console.log(`   digest       ${result.digest}`);
  console.log(`   deployedAt   ${deployedAt}`);
  console.log('\nNext: Phase 1 module migration. See AGENTS.md → 「鏈上架構 · Phase 路線圖」.');
}

main().catch((e) => {
  console.error(`\n[fatal] ${(e as Error).message}`);
  process.exit(1);
});
