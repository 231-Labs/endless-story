import { chineseNumber } from '@endless-story/shared/world-clock';
import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { InfoHint } from '@/components/common/InfoHint';
import { getDirectorMemoryAction } from '@/lib/actions/showrunner';
import { getWorldTimeSnapshot } from '@/lib/actions/world-time';
import { AdminPanel } from './AdminPanel';
import { TimePanel } from './director/TimePanel';
import { CockpitMemoryPanels } from './CockpitMemoryPanels';

export const metadata = {
  title: '後臺 | 班主後台',
};

export const dynamic = 'force-dynamic';

/** Admin landing = the cockpit: world clock, master switch, ledger, and the
 *  Showrunner chat + heartbeat log. Dev/maintenance lives in the workshop. */
export default async function AdminPage() {
  const [memory, worldTime] = await Promise.all([
    getDirectorMemoryAction(),
    getWorldTimeSnapshot(),
  ]);
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-10 sm:py-16 pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]">
        <PageLeadTitleBlock
          eyebrow="SHOWRUNNER"
          eyebrowMobile="BACKSTAGE"
          title="後臺"
          meta="世界時鐘 · 帳本 · 跟 Showrunner 對話 · 心跳日誌"
        />

        <div className="mt-12">
          <SagaAdminGuard>
            <section>
              <div className="es-page-lead-eyebrow">營運一覽 · OPERATIONS</div>
              <div className="mt-3 grid items-stretch gap-4 lg:grid-cols-5">
                <div className="es-soft-panel flex h-full flex-col p-5 lg:col-span-3">
                  <h2 className="flex items-center gap-1.5 font-serif text-lg tracking-wide text-ink">
                    世界時間 · 推進敘事日
                    <InfoHint>
                      {worldTime?.mode === 'mirror' ? (
                        <>
                          敘事時鐘是牆鐘：戲班與現實同刻而行，只早
                          {chineseNumber(worldTime.mirror?.yearOffset ?? 100)}年。鏈上{' '}
                          <code className="font-mono text-2xs">WorldState.current_tick</code>{' '}
                          是演繹的心跳——VPS 的 world-loop 在每個時辰邊界打一拍、夜裡編公報、跨日。
                          世界的時間不因停機而暫停；這格在跳，只是說戲班今日仍在搬演。
                        </>
                      ) : (
                        <>
                          鏈上 <code className="font-mono text-2xs">WorldState.current_tick</code>{' '}
                          是敘事時鐘。VPS 的 world-loop 每隔一段時間推進一個 tick、夜裡編公報、跨日——
                          這格在跳，就是世界正在自行運轉的證明。
                        </>
                      )}
                    </InfoHint>
                  </h2>
                  <div className="mt-4 flex-1">
                    <TimePanel initial={worldTime} />
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <AdminPanel />
                </div>
              </div>
            </section>

            <CockpitMemoryPanels initialMemory={memory} />
          </SagaAdminGuard>
        </div>
      </main>
    </>
  );
}
