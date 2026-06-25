/**
 * GET /api/deployment — the live deployment snapshot (compiled contract-ids
 * merged with any runtime volume manifest).
 *
 * The client bundle has the build-time `contract-ids.ts` inlined, so after a
 * remote package upgrade its `latestPackageId` is stale. The client fetches
 * this once on boot (RuntimeDeploymentSync) and applies it via
 * `setRuntimeDeployment`, so wallet-built txs target the upgraded package
 * without a rebuild. Public, read-only (these ids are already public on-chain).
 */
import { NextResponse } from 'next/server';
import { getDeployment } from '@endless-story/sdk';
import { ensureRuntimeDeploymentLoaded } from '@/lib/server/deployment-manifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  ensureRuntimeDeploymentLoaded();
  return NextResponse.json(getDeployment());
}
