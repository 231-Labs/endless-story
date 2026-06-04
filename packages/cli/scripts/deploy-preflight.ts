/**
 * Deployment preflight for the testnet/mainnet reset path.
 *
 * This script is intentionally read-only: no publish, no bootstrap tx, no
 * contract-ids write. It front-loads the checks that otherwise fail halfway
 * through a deploy: Sui env, configured admin signer, gas, and Move build.
 *
 * Usage:
 *   pnpm --filter @endless-story/cli run deploy-preflight -- --env testnet
 *   pnpm --filter @endless-story/cli run deploy-preflight -- --env testnet --skip-build
 *   pnpm --filter @endless-story/cli run deploy-preflight -- --env testnet --json-out=/private/tmp/endless-preflight.json
 */
import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import { ENDLESS_STORY_DEPLOYMENT, type SuiNetwork } from '@endless-story/shared/contract-ids';
import { loadKeypair } from '@endless-story/sdk/node';
import { flag, hasFlag, requireFlag } from '../src/lib/flags';

const VALID_NETWORKS: ReadonlySet<SuiNetwork> = new Set(['devnet', 'testnet', 'mainnet', 'localnet']);
const MIST_PER_SUI = 1_000_000_000n;

interface Check {
  label: string;
  ok: boolean;
  detail: string;
  hard?: boolean;
}

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 200,
  });
}

function parseSuiToMist(raw: string): bigint {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`invalid SUI amount: ${raw}`);
  const [whole, frac = ''] = trimmed.split('.');
  const fracPadded = `${frac}000000000`.slice(0, 9);
  return BigInt(whole) * MIST_PER_SUI + BigInt(fracPadded);
}

function formatSui(mist: bigint): string {
  const whole = mist / MIST_PER_SUI;
  const frac = (mist % MIST_PER_SUI).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

function snippet(text: string, max = 800): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function checkActiveEnv(env: SuiNetwork): Check {
  try {
    const active = run('sui client active-env').trim();
    return {
      label: 'sui active-env',
      ok: active === env,
      hard: active !== env,
      detail: active === env ? active : `active=${active}, expected=${env}`,
    };
  } catch (err) {
    return { label: 'sui active-env', ok: false, hard: true, detail: (err as Error).message };
  }
}

function checkSigner(): { check: Check; address?: string } {
  try {
    const signer = loadKeypair();
    const address = signer.toSuiAddress();
    return { check: { label: 'admin signer', ok: true, detail: address }, address };
  } catch (err) {
    return { check: { label: 'admin signer', ok: false, hard: true, detail: (err as Error).message } };
  }
}

function checkGas(minGasMist: bigint, faucetUrl?: string): Check {
  try {
    const raw = run('sui client gas --json');
    const coins = JSON.parse(raw) as Array<{ mistBalance?: number | string; suiBalance?: string }>;
    const total = coins.reduce((sum, coin) => sum + BigInt(String(coin.mistBalance ?? 0)), 0n);
    const ok = total >= minGasMist;
    const refillHint = !ok && faucetUrl ? `; faucet ${faucetUrl}` : '';
    return {
      label: 'admin gas',
      ok,
      hard: !ok,
      detail: `${formatSui(total)} SUI across ${coins.length} coin(s); need >= ${formatSui(minGasMist)} SUI${refillHint}`,
    };
  } catch (err) {
    return { label: 'admin gas', ok: false, hard: true, detail: (err as Error).message };
  }
}

function checkDeploymentSnapshot(env: SuiNetwork): Check {
  const d = ENDLESS_STORY_DEPLOYMENT;
  if (!d.packageId) {
    return { label: 'contract-ids snapshot', ok: false, detail: 'packageId empty; deploy has not run' };
  }
  const ok = d.network === env;
  return {
    label: 'contract-ids snapshot',
    ok,
    detail: `network=${d.network}, package=${d.packageId.slice(0, 10)}..., deployedAt=${d.deployedAt || 'unknown'}`,
  };
}

function checkBuild(contractsDir: string): Check {
  try {
    const out = run('sui move build --dump-bytecode-as-base64', contractsDir);
    const jsonStart = out.indexOf('{');
    const dump = jsonStart >= 0
      ? JSON.parse(out.slice(jsonStart)) as { modules?: unknown[]; dependencies?: unknown[]; digest?: number[] }
      : null;
    const modules = dump?.modules?.length ?? 0;
    const deps = dump?.dependencies?.length ?? 0;
    return {
      label: 'move build',
      ok: modules > 0,
      hard: modules === 0,
      detail: modules > 0
        ? `${modules} module(s), ${deps} dependency id(s), digest=${dump?.digest?.slice(0, 4).join(',') ?? 'n/a'}...`
        : 'build returned no modules',
    };
  } catch (err) {
    const e = err as { message?: string; stdout?: Buffer | string; stderr?: Buffer | string };
    const output = `${e.stdout?.toString() ?? ''} ${e.stderr?.toString() ?? ''}`.trim();
    return {
      label: 'move build',
      ok: false,
      hard: true,
      detail: output ? snippet(output) : e.message ?? 'build failed',
    };
  }
}

function printCheck(check: Check): void {
  const marker = check.ok ? 'OK ' : check.hard ? 'FAIL' : 'WARN';
  console.log(`   ${marker} ${check.label} — ${check.detail}`);
}

function optionalFlag(name: string): string | undefined {
  const eq = process.argv.slice(2).find((arg) => arg.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : flag(name);
}

async function writeJsonReport(outPath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  console.log(`\n[json] wrote ${outPath}`);
}

async function main() {
  const env = requireFlag('--env') as SuiNetwork;
  if (!VALID_NETWORKS.has(env)) {
    throw new Error(`--env must be one of ${[...VALID_NETWORKS].join(' / ')}, got "${env}"`);
  }
  const minGasMist = parseSuiToMist(optionalFlag('--min-gas-sui') ?? '2.5');
  const skipBuild = hasFlag('--skip-build');
  const jsonOut = optionalFlag('--json-out');

  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..', '..');
  const contractsDir = path.join(repoRoot, 'contracts', 'endless_story');

  console.log('endless-story · deploy preflight');
  console.log(`   env        ${env}`);
  console.log(`   minGas     ${formatSui(minGasMist)} SUI`);
  console.log(`   build      ${skipBuild ? 'skipped' : 'enabled'}`);

  const signer = checkSigner();
  const adminFaucetUrl = signer.address ? `https://faucet.sui.io/?address=${signer.address}` : '';

  const checks: Check[] = [];
  checks.push(checkActiveEnv(env));
  checks.push(signer.check);
  checks.push(checkGas(minGasMist, adminFaucetUrl));
  checks.push(checkDeploymentSnapshot(env));
  if (!skipBuild) checks.push(checkBuild(contractsDir));

  console.log('\n[checks]');
  for (const check of checks) printCheck(check);

  const hardFailures = checks.filter((c) => !c.ok && c.hard);
  const ready = hardFailures.length === 0;
  if (jsonOut) {
    await writeJsonReport(jsonOut, {
      kind: 'endless-story-deploy-preflight',
      generatedAt: new Date().toISOString(),
      env,
      minGasMist: minGasMist.toString(),
      minGasSui: formatSui(minGasMist),
      skipBuild,
      adminSignerAddress: signer.address ?? '',
      adminFaucetUrl,
      deployment: {
        network: ENDLESS_STORY_DEPLOYMENT.network,
        packageId: ENDLESS_STORY_DEPLOYMENT.packageId,
        worldId: ENDLESS_STORY_DEPLOYMENT.worldId,
        sagaId: ENDLESS_STORY_DEPLOYMENT.sagaId,
        storyId: ENDLESS_STORY_DEPLOYMENT.storyId,
        deployedAt: ENDLESS_STORY_DEPLOYMENT.deployedAt,
      },
      checks: checks.map((c) => ({
        label: c.label,
        ok: c.ok,
        hard: Boolean(c.hard),
        detail: c.detail,
        status: c.ok ? 'ok' : c.hard ? 'fail' : 'warn',
      })),
      ready,
    });
  }
  if (hardFailures.length > 0) {
    console.log(`\n[not ready] ${hardFailures.length} hard failure(s).`);
    process.exit(1);
  }
  console.log('\n[ready] deploy/bootstrap preflight passed.');
}

main().catch((e) => {
  console.error('[deploy-preflight] failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
