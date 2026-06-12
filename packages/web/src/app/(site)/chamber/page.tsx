import { redirect } from 'next/navigation';
import { SiteNav } from '@/components/home/SiteNav';
import { ChamberView } from '@/components/chamber/ChamberView';

export const dynamic = 'force-dynamic';

export default async function ChamberPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  // 藏閣 is wallet-gated: enter via the wallet dropdown → /chamber?id=<address>.
  // Without an id we have no collector context — redirect to home.
  if (!id) redirect('/');

  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-canvas">
      <SiteNav />
      <div className="min-h-0 flex-1">
        <ChamberView characterId={id} />
      </div>
    </main>
  );
}
