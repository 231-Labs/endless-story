import { redirect } from 'next/navigation';
import { SiteNav } from '@/components/home/SiteNav';
import { ChamberView } from '@/components/chamber/ChamberView';

export const dynamic = 'force-dynamic';

export default async function ChamberPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; vault?: string; room?: string }>;
}) {
  const { id, vault, room } = await searchParams;

  // 藏閣 entry: `?id=<address>` = a wallet's vault (owner edits its 佈置; others
  // browse read-only). `?vault=<vaultId>&room=<roomId>` = a shareable link to one
  // 佈置. Without id or vault we have no context — redirect home.
  if (!id && !vault) redirect('/');

  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-canvas">
      <SiteNav />
      <div className="min-h-0 flex-1">
        <ChamberView addressParam={id} vaultParam={vault} roomParam={room} />
      </div>
    </main>
  );
}
