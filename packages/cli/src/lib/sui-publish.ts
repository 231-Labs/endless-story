/**
 * Thin wrapper around `sui client publish` / `sui client test-publish`.
 *
 * Phase 0 use only — once SDK has tx builders + we want programmatic publish
 * (no shell-out), this can move into @endless-story/sdk. For now keeping it
 * here matches what the old repo did and avoids pulling sui-cli concerns into
 * the SDK layer.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PublishOptions {
  /** Absolute path to the contracts/endless_story dir. */
  contractsDir: string;
  /** devnet / localnet → uses test-publish; testnet / mainnet → publish. */
  network: 'localnet' | 'devnet' | 'testnet' | 'mainnet';
  /** Default 2_000_000_000 (2 SUI). */
  gasBudget?: string;
}

export interface PublishResult {
  packageId: string;
  /** AdminCap id, if the package emits exactly one AdminCap on publish init. */
  adminCapId: string | null;
  digest: string;
  /** All created objects (for callers that need more than packageId + adminCap). */
  createdObjects: Array<{ id: string; type: string }>;
}

export function suiPublish(opts: PublishOptions): PublishResult {
  const { contractsDir, network } = opts;
  const gasBudget = opts.gasBudget ?? '2000000000';
  const useTestPublish = network === 'devnet' || network === 'localnet';
  const subcommand = useTestPublish ? 'test-publish' : 'publish';

  console.log(`\n[publish] sui client ${subcommand} (network=${network})…`);

  let tempPubFile = '';
  let cmd: string;
  if (useTestPublish) {
    // test-publish writes a Pub.<env>.toml; clear stale ones first to avoid version drift.
    tempPubFile = path.join(contractsDir, `Pub.${network}.${Date.now()}.toml`);
    const defaultPubFile = path.join(contractsDir, `Pub.${network}.toml`);
    if (fs.existsSync(defaultPubFile)) fs.rmSync(defaultPubFile, { force: true });
    cmd =
      `sui client test-publish --pubfile-path ${tempPubFile}` +
      ` --build-env ${network} --gas-budget ${gasBudget} --json` +
      ` --skip-dependency-verification ${contractsDir}`;
  } else {
    cmd = `sui client publish --json --gas-budget ${gasBudget} --skip-dependency-verification`;
  }

  let out: string;
  try {
    out = execSync(cmd, {
      cwd: contractsDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 200,
    });
  } catch (e) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string; message: string };
    const stderrText = err.stderr ? err.stderr.toString() : '';
    const stdoutText = err.stdout ? err.stdout.toString() : '';
    console.error(`${subcommand} failed:`);
    if (stdoutText.trim()) console.error('--- stdout ---\n' + stdoutText);
    if (stderrText.trim()) console.error('--- stderr ---\n' + stderrText);
    if (!stderrText && !stdoutText) console.error(err.message);
    throw new Error(`${subcommand} failed (network=${network})`);
  } finally {
    if (tempPubFile && fs.existsSync(tempPubFile)) {
      fs.rmSync(tempPubFile, { force: true });
    }
  }

  const result = JSON.parse(out);

  // Parse packageId.
  const packageObj = (result.objectChanges ?? []).find((o: { type: string }) => o.type === 'published') as
    | { packageId?: string }
    | undefined;
  if (!packageObj?.packageId) {
    console.error(JSON.stringify(result, null, 2));
    throw new Error('could not find packageId in publish result');
  }

  // Collect all created objects for caller convenience.
  const createdObjects: Array<{ id: string; type: string }> = (result.objectChanges ?? [])
    .filter((o: { type: string }) => o.type === 'created')
    .map((o: { objectId: string; objectType: string }) => ({ id: o.objectId, type: o.objectType }));

  // Look for AdminCap (suffix match — packages typically emit `<pkg>::module::AdminCap`).
  const adminCap = createdObjects.find((o) => o.type.endsWith('::AdminCap'));

  const digest: string = result.digest ?? '';
  console.log(`   packageId  ${packageObj.packageId}`);
  console.log(`   adminCap   ${adminCap?.id ?? '(none on publish)'}`);
  console.log(`   digest     ${digest}`);

  return {
    packageId: packageObj.packageId,
    adminCapId: adminCap?.id ?? null,
    digest,
    createdObjects,
  };
}

/** Verify `sui client active-env` matches the expected network. */
export function assertActiveEnv(expected: string): void {
  let actual: string;
  try {
    actual = execSync('sui client active-env', { encoding: 'utf-8' }).trim();
  } catch (e) {
    throw new Error(`failed to query sui active-env: ${(e as Error).message}`);
  }
  if (actual !== expected) {
    throw new Error(
      `sui active-env is "${actual}" but cli was invoked with --env ${expected}.\n` +
        `  Run: sui client switch --env ${expected}`,
    );
  }
}
