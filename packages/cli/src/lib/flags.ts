/**
 * Minimal flag parser. Sufficient for cli scripts; no need for yargs.
 *
 *   --env devnet         → flag('--env') === 'devnet'
 *   --dry-run            → hasFlag('--dry-run') === true
 *   --gas-budget 2000000 → flag('--gas-budget') === '2000000'
 */
const argv = process.argv.slice(2);

export function flag(name: string, fallback?: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  return fallback;
}

export function hasFlag(name: string): boolean {
  return argv.includes(name);
}

export function requireFlag(name: string): string {
  const v = flag(name);
  if (v == null) throw new Error(`missing required flag: ${name}`);
  return v;
}
