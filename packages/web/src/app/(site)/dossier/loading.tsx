import { RosterSkeleton } from '@/components/dossier/RosterSkeleton';

/**
 * Route skeleton for /dossier — shown as the Suspense fallback on cold
 * navigation into the segment. `/dossier` with no `?id` is the roster,
 * so the cold-nav fallback is roster-shaped (not the character-detail skeleton).
 * The detail view streams under its own per-id <Suspense fallback={DossierSkeleton}>
 * and the roster cards under <Suspense fallback={RosterSkeletonInner}> in page.tsx,
 * so each view ends up with the matching skeleton.
 */
export default function DossierLoading() {
  return <RosterSkeleton />;
}
