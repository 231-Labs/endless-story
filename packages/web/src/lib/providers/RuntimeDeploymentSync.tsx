'use client';

import { useEffect } from 'react';
import { setRuntimeDeployment } from '@endless-story/sdk';

/**
 * Hydrates the client sdk with the live deployment once on boot.
 *
 * The client bundle inlines the build-time `contract-ids.ts`, so after a remote
 * package upgrade `pkg()` (and thus every wallet-built tx) would target the
 * stale package id. This fetches `/api/deployment` (server-merged with the
 * volume manifest) and applies it, so client txs hit the upgraded package
 * without a rebuild. Renders nothing. No-op when the server returns the same
 * compiled ids (the common case before any runtime override is configured).
 */
export function RuntimeDeploymentSync() {
  useEffect(() => {
    let alive = true;
    fetch('/api/deployment')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && typeof d === 'object') setRuntimeDeployment(d);
      })
      .catch(() => {
        // Offline / route missing → keep the compiled seed. Non-fatal.
      });
    return () => {
      alive = false;
    };
  }, []);
  return null;
}
