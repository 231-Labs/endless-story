import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { ChamberRoster } from '@/components/chamber/ChamberRoster';
import { ChamberView } from '@/components/chamber/ChamberView';

/**
 * 廂房 Chamber — entry page. The renderer is id-parameterised:
 *   - `/chamber`         → owner roster picker (pick one of my characters)
 *   - `/chamber?id=<id>` → that character's chamber (diorama from its Scene +
 *                          furnishing layout)
 *
 * Keeping the door and the renderer separate means the entry topology (hub vs
 * dossier vs both) can change later without touching the render surface.
 *
 * Dynamic: read per request, never prerendered at build (matches `/`).
 */
export const dynamic = 'force-dynamic';

export default async function ChamberPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  return (
    <main className="min-h-screen bg-canvas">
      <SiteNav />
      <header className="bg-canvas">
        <div className="px-5 pb-2 pt-8 sm:px-10 sm:pb-3 sm:pt-11">
          <div className="mx-auto max-w-6xl">
            <PageLeadTitleBlock
              eyebrow="廂房 CHAMBER"
              title={id ? '廂房' : '我的廂房'}
              meta={
                id
                  ? '青綠山水間的一方水台廂房，環繞觀賞。'
                  : '連結錢包，選一位你持有的角色，環繞觀賞它在青綠山水間的水台廂房。'
              }
            />
          </div>
        </div>
      </header>
      <section className="px-5 pb-16 sm:px-10">
        <div className="mx-auto max-w-6xl">
          {id ? <ChamberView characterId={id} /> : <ChamberRoster />}
        </div>
      </section>
    </main>
  );
}
