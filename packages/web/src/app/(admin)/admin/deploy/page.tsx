import Link from 'next/link';
import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { DeployAdminGuard } from '@/components/common/DeployAdminGuard';
import { getDeploymentStatus } from '@/lib/actions/deployment-status';
import { getFaucetSnapshot } from '@/lib/actions/faucet-config';
import { getDreamConfigSnapshot } from '@/lib/actions/dream-config';
import { listStoryPresets } from '@/lib/stories/loader';
import { DeployPanel } from './DeployPanel';
import { FaucetConfigPanel } from './FaucetConfigPanel';
import { DreamConfigPanel } from '../director/DreamConfigPanel';

export const metadata = {
    title: '系統 | 班主後台',
};

export const dynamic = 'force-dynamic';

/** Admin → 系統 — deployment, economy config, and links to side tools. */
export default async function DeployPage() {
    const [status, presets, faucetSnapshot, dreamConfig] = await Promise.all([
        getDeploymentStatus(),
        listStoryPresets(),
        getFaucetSnapshot(),
        getDreamConfigSnapshot(),
    ]);
    return (
        <>
            <SiteNav />
            <main className="mx-auto max-w-4xl px-4 py-8 sm:px-10 sm:py-16 pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]">
                <PageLeadTitleBlock
                    eyebrow="SYSTEM"
                    eyebrowMobile="SYSTEM"
                    title="系統"
                    meta="部署 / 種子化 / 經濟參數（Faucet · 注夢）/ 工具入口"
                />
                <div className="mt-12 space-y-6">
                    <DeployAdminGuard
                        adminSignerAddress={status.adminSignerAddress}
                        adminSignerError={status.adminSignerError}
                    >
                        <DeployPanel initialStatus={status} presets={presets} />
                        <FaucetConfigPanel initial={faucetSnapshot} />
                        <div className="rounded border border-hairline bg-canvas/40 p-4">
                            <h3 className="font-serif text-lg tracking-wide text-ink">注夢 · 經濟設定</h3>
                            <p className="mt-2 text-sm leading-relaxed text-mute">
                                character owner 注入夢境的價格 (ENDLESS) 與是否暫停,即時上鏈。
                            </p>
                            <div className="mt-4"><DreamConfigPanel initial={dreamConfig} /></div>
                        </div>
                        <div className="rounded border border-hairline bg-canvas/40 p-4">
                            <h3 className="font-serif text-lg tracking-wide text-ink">工具</h3>
                            <ul className="mt-3 space-y-2 text-sm">
                                <li>
                                    <Link href="/admin/prompt-lab" className="text-cinnabar hover:underline">
                                        Prompt Lab
                                    </Link>
                                    <span className="text-mute"> — 重放/調試系統內任何 LLM 呼叫（實驗工具）</span>
                                </li>
                            </ul>
                        </div>
                    </DeployAdminGuard>
                </div>
            </main>
        </>
    );
}
