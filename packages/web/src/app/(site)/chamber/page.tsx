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

  // The chamber itself is presented full-bleed, like a hanging scroll —
  // SiteNav on top, the living painting fills the rest of the viewport.
  if (id) {
    return (
      <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-canvas">
        <SiteNav />
        <div className="min-h-0 flex-1">
          <ChamberView characterId={id} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas">
      <SiteNav />
      <header className="bg-canvas">
        <div className="px-5 pb-2 pt-8 sm:px-10 sm:pb-3 sm:pt-11">
          <div className="mx-auto max-w-6xl">
            <PageLeadTitleBlock
              eyebrow="藏閣 VAULT"
              title="我的藏閣"
              meta="連結錢包，選一位你持有的角色，走進以它為心的收藏穹廳——劇照與珍玩，各懸一柱光。"
            />
          </div>
        </div>
      </header>
      <section className="px-5 pb-16 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <ChamberRoster />
        </div>
      </section>
    </main>
  );
}
