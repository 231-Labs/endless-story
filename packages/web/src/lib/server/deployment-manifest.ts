/**
 * Server-only (nodejs): load the runtime deployment override from a mounted
 * volume so a remote package upgrade takes effect WITHOUT a rebuild.
 *
 * `contract-ids.ts` is compiled into the bundle; the cli `upgrade` script
 * (run in-container from the admin panel) writes the live snapshot to
 * `DEPLOYMENT_MANIFEST_PATH` on a persistent volume. This reads it and feeds
 * it to the sdk via `setRuntimeDeployment`, so `pkg()` / `getDeployment()`
 * return the upgraded ids. Deliberately NOT in instrumentation.ts (which also
 * compiles for edge, where `node:fs` cannot bundle) — mirrors the
 * event-store registration pattern: called from the server layouts.
 *
 * Inert unless DEPLOYMENT_MANIFEST_PATH is set, so it is a no-op in dev / any
 * environment that has not opted into runtime deployment.
 *
 * Re-read at most every TTL so a fresh upgrade is picked up by the next page
 * load (no process restart), while keeping the fs hit off the hot path.
 */
import { readFileSync } from 'node:fs';
import { setRuntimeDeployment, type EndlessStoryDeployment } from '@endless-story/sdk';

const TTL_MS = 30_000;
let lastLoadMs = 0;
let warned = false;

export function ensureRuntimeDeploymentLoaded(): void {
  const path = process.env.DEPLOYMENT_MANIFEST_PATH?.trim();
  if (!path) return; // feature inert until a volume manifest is configured

  const now = Date.now();
  if (now - lastLoadMs < TTL_MS) return;
  lastLoadMs = now;

  try {
    const raw = readFileSync(path, 'utf-8');
    const json = JSON.parse(raw) as Partial<EndlessStoryDeployment>;
    setRuntimeDeployment(json);
    warned = false;
  } catch (err) {
    // Missing manifest is the expected initial state (no upgrade has run yet) →
    // stay silent on the compiled seed. Only a malformed / unreadable file is
    // worth a (once-per-streak) warning. Never throw: this must not break a page.
    const enoent = (err as NodeJS.ErrnoException)?.code === 'ENOENT';
    if (!enoent && !warned) {
      warned = true;
      console.warn(
        `[deployment-manifest] could not load ${path}; using compiled contract-ids`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
