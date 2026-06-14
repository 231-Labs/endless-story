import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { getDirectorMemoryAction } from '@/lib/actions/showrunner';
import { AdminPanel } from './AdminPanel';
import { CockpitMemoryPanels } from './CockpitMemoryPanels';

export const metadata = {
  title: '駕駛艙 | 班主後台',
};

export const dynamic = 'force-dynamic';

/**
 * Admin landing = the cockpit (NARRATIVE_AGENTS.md §12). The world runs
 * itself (world-loop ticks + showrunner heartbeats on the VPS); the admin's
 * daily job is supervision: talk to the Showrunner, read the 導演日誌, and
 * hold the master switch. Manual overrides live in 劇團 / 戲台.
 */
export default async function AdminPage() {
  const memory = await getDirectorMemoryAction();
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-10 sm:py-16 pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]">
        <PageLeadTitleBlock
          eyebrow="SHOWRUNNER"
          eyebrowMobile="COCKPIT"
          title="駕駛艙"
          meta="跟 Showrunner 對話 · 心跳與導演日誌 · 世界總開關"
        />

        <div className="mt-12">
          <SagaAdminGuard>
            <section>
              <h2 className="font-serif text-xl tracking-wide text-ink">世界總開關</h2>
              <p className="mt-2 text-sm leading-relaxed text-mute">
                VPS 上的 world-loop（tick 與心跳的驅動器）。Showrunner 也能經對話開關它。
              </p>
              <div className="mt-4">
                <AdminPanel />
              </div>
            </section>

            <CockpitMemoryPanels initialMemory={memory} />
          </SagaAdminGuard>
        </div>
      </main>
    </>
  );
}
