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
 * See AGENTS.md → on-chain-architecture + skill `/devnet-bootstrap`.
 */
import * as path from 'node:path';
import * as url from 'node:url';
import * as fs from 'node:fs';
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
  // --force-republish: strip this env's entry from Published.toml so `sui client publish`
  // doesn't refuse with "package is already published". Opt-in (never auto) so a stray
  // re-deploy can't silently orphan a live package. This is "republish as a NEW package",
  // not an upgrade — intended for devnet/testnet demo resets.
  const forceRepublish = hasFlag('--force-republish');

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

  // ─── force-republish: strip this env's Published.toml entry ────
  if (forceRepublish) {
    const publishedToml = path.join(contractsDir, 'Published.toml');
    if (fs.existsSync(publishedToml)) {
      const before = fs.readFileSync(publishedToml, 'utf-8');
      // remove the [published.<env>] section (up to the next [section] or EOF)
      const re = new RegExp(`\\n?\\[published\\.${env}\\][\\s\\S]*?(?=\\n\\[|$)`, 'g');
      const after = before.replace(re, '');
      if (after !== before) {
        fs.writeFileSync(publishedToml, after);
        console.log(`\n[force-republish] removed [published.${env}] from Published.toml`);
      } else {
        console.log(`\n[force-republish] no [published.${env}] entry to remove`);
      }
    }
  }

  // ─── publish ───────────────────────────────────────────────────
  // Signed with SUI_ADMIN_PRIVATE_KEY (not the CLI active-address) for testnet/mainnet,
  // so the package owner always matches the bootstrap signer. See sui-publish.ts.
  const result = await suiPublish({ contractsDir, network: env, gasBudget });

  // ─── extract init-time objects ────────────────────────────────
  // still::init creates TransferPolicy<Still> automatically on publish.
  // Its type contains the new packageId, so we match by substring.
  const stillPolicyType = `${result.packageId}::still::Still`;
  const stillTransferPolicyId =
    result.createdObjects.find(
      (o) => o.type.startsWith('0x2::transfer_policy::TransferPolicy<') &&
             o.type.includes(stillPolicyType),
    )?.id ?? '';

  // ─── write contract-ids.ts ─────────────────────────────────────
  console.log(`\n[contract-ids] writing snapshot…`);
  if (!result.adminCapId) {
    console.warn(
      '   ! No AdminCap detected on publish. character.move Phase 0 does not\n' +
        '     emit one by default — this is expected. Phase 1 modules add an AdminCap.\n' +
        '     Writing empty adminCapId; bootstrap will set it later.',
    );
  }
  if (!stillTransferPolicyId) {
    console.warn('   ! TransferPolicy<Still> not found in publish output — kiosk purchase will fail.\n' +
      '     Verify still::init creates it and re-run deploy.');
  }
  const deployedAt = new Date().toISOString();
  writeContractIds(
    sharedSrcDir,
    {
      network: env,
      packageId: result.packageId,
      latestPackageId: result.packageId,
      adminCapId: result.adminCapId ?? '',
      stillTransferPolicyId,
    },
    deployedAt,
  );

  // ─── summary ───────────────────────────────────────────────────
  console.log('\n[done] Phase 0 deploy complete.');
  console.log(`   packageId          ${result.packageId}`);
  console.log(`   adminCapId         ${result.adminCapId ?? '(none)'}`);
  console.log(`   stillTransferPolicy ${stillTransferPolicyId || '(not found)'}`);
  console.log(`   digest             ${result.digest}`);
  console.log(`   deployedAt         ${deployedAt}`);
  console.log('\nNext: run bootstrap (② in /admin/deploy). See AGENTS.md → 「下一步」.');
}

main().catch((e) => {
  console.error(`\n[fatal] ${(e as Error).message}`);
  process.exit(1);
});
