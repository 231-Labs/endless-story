import { SiteNav } from '@/components/home/SiteNav';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { getDirectorMemoryAction } from '@/lib/actions/showrunner';
import { ShowrunnerPanel } from './ShowrunnerPanel';
import { DirectorChatPanel } from './DirectorChatPanel';

export const dynamic = 'force-dynamic';

/**
 * Admin → Showrunner — the saga's autonomous operator (NARRATIVE_AGENTS.md
 * §12): heartbeat trigger + 導演日誌 + arc plan on one side, the director
 * chat box on the other. Server shell only; interactivity lives in the
 * client children.
 */
export default async function AdminShowrunnerPage() {
    const memory = await getDirectorMemoryAction();
    return (
        <main className="min-h-screen">
            <SiteNav />
            <SagaAdminGuard>
                <div className="mx-auto max-w-3xl px-5 py-12 sm:px-10">
                    <h1 className="font-serif text-3xl tracking-wide text-ink">Showrunner</h1>
                    <p className="mt-3 text-sm leading-relaxed text-mute">
                        導演的經營層：<strong className="text-ink">心跳</strong>
                        （巡檢 → 補漏 → 評估劇情 → 干預 → 導演日誌），
                        <strong className="text-ink">對話</strong>
                        （問劇情、下指令、給大方向）。兩邊共用同一套工具與弧線計畫。
                    </p>

                    <section className="mt-10">
                        <h2 className="font-serif text-xl tracking-wide text-ink">對話</h2>
                        <div className="mt-4">
                            <DirectorChatPanel initialChat={memory.chat} />
                        </div>
                    </section>

                    <section className="mt-12">
                        <h2 className="font-serif text-xl tracking-wide text-ink">心跳與日誌</h2>
                        <div className="mt-4">
                            <ShowrunnerPanel
                                initialArcPlan={memory.arcPlan}
                                initialLog={memory.log}
                            />
                        </div>
                    </section>
                </div>
            </SagaAdminGuard>
        </main>
    );
}
