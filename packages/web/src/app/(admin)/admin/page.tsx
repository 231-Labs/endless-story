import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { getDirectorMemoryAction } from '@/lib/actions/showrunner';
import { AdminPanel } from './AdminPanel';
import { ShowrunnerPanel } from './ShowrunnerPanel';
import { DirectorChatPanel } from './DirectorChatPanel';

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

            <section className="mt-12 border-t border-hairline pt-10">
              <h2 className="font-serif text-xl tracking-wide text-ink">對話</h2>
              <p className="mt-2 text-sm leading-relaxed text-mute">
                問劇情（「現在故事走到哪了？」）、下小指令（補某角色、開一條張力線）、
                給大方向（寫進弧線計畫，下次心跳執行）。
              </p>
              <div className="mt-4">
                <DirectorChatPanel initialChat={memory.chat} />
              </div>
            </section>

            <section className="mt-12 border-t border-hairline pt-10">
              <h2 className="font-serif text-xl tracking-wide text-ink">心跳與日誌</h2>
              <p className="mt-2 text-sm leading-relaxed text-mute">
                巡檢 → 補漏 → 評估劇情 → 干預 → 導演日誌。VPS 上由 world-loop 的
                <code className="font-mono text-2xs"> --showrunner-every=N </code>自動驅動；這裡可手動跑一次。
              </p>
              <div className="mt-4">
                <ShowrunnerPanel initialArcPlan={memory.arcPlan} initialLog={memory.log} />
              </div>
            </section>
          </SagaAdminGuard>
        </div>
      </main>
    </>
  );
}
