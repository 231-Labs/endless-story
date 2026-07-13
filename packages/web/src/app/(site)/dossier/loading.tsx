import { RosterSkeleton } from '@/components/dossier/RosterSkeleton';

// /dossier route loading — the roster-shaped skeleton (real header + filter
// tabs, pulsing cards), not a generic spinner: the same shape the in-page
// <Suspense> fallback uses, so a cold nav doesn't swap between two loaders.
export default function DossierLoading() {
  return <RosterSkeleton />;
}
