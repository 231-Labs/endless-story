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
import { Transaction } from '@mysten/sui/transactions';
import { makeSuiClient, type SuiNetwork } from '@endless-story/sdk';
import { loadKeypair } from '@endless-story/sdk/node';

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

export interface BytecodeDump {
  modules: string[];
  dependencies: string[];
  digest?: number[];
}

/**
 * Resolve the package bytecode for a programmatic publish / upgrade.
 *
 * Prefers a pre-built dump at `DEPLOY_BYTECODE_DUMP_PATH` (produced at image
 * build by `sui move build --dump-bytecode-as-base64`), so a runtime container
 * needs NO sui toolchain. Set-but-unreadable is a hard error (no source-build
 * fallback in a container); unset compiles from source (local dev). Used by
 * both `deploy` (tx.publish) and `upgrade` (tx.upgrade), so a fresh world reset
 * and a contract upgrade are equally CLI-free from the admin panel.
 */
export function loadBytecodeDump(contractsDir: string): BytecodeDump {
  const dumpPath = process.env.DEPLOY_BYTECODE_DUMP_PATH?.trim();
  if (dumpPath) {
    try {
      const raw = fs.readFileSync(dumpPath, 'utf-8');
      const dump = JSON.parse(raw.slice(raw.indexOf('{'))) as BytecodeDump;
      if (!dump.modules?.length || !dump.dependencies?.length) {
        throw new Error('missing modules/dependencies');
      }
      console.log(`[build] using pre-built bytecode dump: ${dumpPath}`);
      return dump;
    } catch (e) {
      throw new Error(
        `DEPLOY_BYTECODE_DUMP_PATH=${dumpPath} unreadable/invalid: ` +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }
  let out: string;
  try {
    out = execSync('sui move build --dump-bytecode-as-base64', {
      cwd: contractsDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 200,
    });
  } catch (e) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string; message: string };
    if (err.stdout?.toString().trim()) console.error('--- stdout ---\n' + err.stdout.toString());
    if (err.stderr?.toString().trim()) console.error('--- stderr ---\n' + err.stderr.toString());
    throw new Error('move build failed');
  }
  const dump = JSON.parse(out.slice(out.indexOf('{'))) as BytecodeDump;
  if (!dump.modules?.length || !dump.dependencies?.length) {
    throw new Error('move build output missing modules/dependencies');
  }
  return dump;
}

export async function suiPublish(opts: PublishOptions): Promise<PublishResult> {
  const { contractsDir, network } = opts;
  const gasBudget = opts.gasBudget ?? '2000000000';
  const useTestPublish = network === 'devnet' || network === 'localnet';

  // testnet / mainnet: publish PROGRAMMATICALLY, signed with the configured key
  // (SUI_ADMIN_PRIVATE_KEY) — NOT the CLI active-address. This is the single source of
  // truth for who owns the package + every object bootstrap creates, so deploy and
  // bootstrap can never drift onto two different wallets (the bug that orphaned a saga).
  if (!useTestPublish) {
    return publishWithConfiguredKey({ contractsDir, network: network as SuiNetwork, gasBudget });
  }

  // devnet / localnet: keep the shell-based test-publish (ephemeral addresses, local).
  const subcommand = 'test-publish';
  console.log(`\n[publish] sui client ${subcommand} (network=${network})…`);

  let tempPubFile = '';
  let cmd: string;
  {
    // test-publish writes a Pub.<env>.toml; clear stale ones first to avoid version drift.
    tempPubFile = path.join(contractsDir, `Pub.${network}.${Date.now()}.toml`);
    const defaultPubFile = path.join(contractsDir, `Pub.${network}.toml`);
    if (fs.existsSync(defaultPubFile)) fs.rmSync(defaultPubFile, { force: true });
    cmd =
      `sui client test-publish --pubfile-path ${tempPubFile}` +
      ` --build-env ${network} --gas-budget ${gasBudget} --json` +
      ` --skip-dependency-verification ${contractsDir}`;
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

/**
 * Programmatic publish signed with the CONFIGURED key (SUI_ADMIN_PRIVATE_KEY), independent
 * of the CLI active-address. Steps:
 *   1. `sui move build --dump-bytecode-as-base64` → { modules, dependencies, digest }
 *   2. build a publish PTB, transfer the returned UpgradeCap to the configured signer
 *   3. sign + execute with loadKeypair() (= the same wallet bootstrap uses)
 * Result: package owner === bootstrap signer, always. No active-address dependency.
 */
async function publishWithConfiguredKey(opts: {
  contractsDir: string;
  network: SuiNetwork;
  gasBudget: string;
}): Promise<PublishResult> {
  const { contractsDir, network, gasBudget } = opts;
  const signer = loadKeypair();
  const sender = signer.toSuiAddress();
  const client = makeSuiClient({ network });

  console.log(`\n[publish] programmatic publish (network=${network}, signer=${sender})…`);

  // 1. resolve bytecode (pre-built dump in-container, else compile from source)
  const dump = loadBytecodeDump(contractsDir);

  // 2. publish PTB
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudget(BigInt(gasBudget));
  const upgradeCap = tx.publish({ modules: dump.modules, dependencies: dump.dependencies });
  // UpgradeCap is returned by publish — must be consumed; give it to the publisher.
  tx.transferObjects([upgradeCap], sender);

  // 3. sign + execute with the configured key
  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`publish failed: ${res.effects?.status?.error ?? 'unknown'}`);
  }

  const changes = res.objectChanges ?? [];
  const published = changes.find((o: { type: string }) => o.type === 'published') as
    | { packageId?: string }
    | undefined;
  if (!published?.packageId) {
    console.error(JSON.stringify(changes, null, 2));
    throw new Error('could not find packageId in publish result');
  }
  const createdObjects: Array<{ id: string; type: string }> = changes
    .filter((o) => o.type === 'created')
    .map((o) => {
      const c = o as { objectId: string; objectType: string };
      return { id: c.objectId, type: c.objectType };
    });
  const adminCap = createdObjects.find((o) => o.type.endsWith('::AdminCap'));
  const digest = res.digest ?? '';

  console.log(`   packageId  ${published.packageId}`);
  console.log(`   adminCap   ${adminCap?.id ?? '(none on publish)'}`);
  console.log(`   digest     ${digest}`);

  return {
    packageId: published.packageId,
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
