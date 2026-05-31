import { DossierSkeleton } from '@/components/dossier/DossierSkeleton';

/**
 * Route skeleton for /dossier — shown as the Suspense fallback on cold
 * navigation into the segment. Character→character switches (same segment,
 * different ?id) are covered by the per-id <Suspense> in page.tsx.
 */
export default function DossierLoading() {
  return <DossierSkeleton />;
}
