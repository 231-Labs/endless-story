import Link from 'next/link';
import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { DeployAdminGuard } from '@/components/common/DeployAdminGuard';
import { InfoHint } from '@/components/common/InfoHint';
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
                            <h3 className="flex items-center gap-1.5 font-serif text-lg tracking-wide text-ink">
                                注夢 · 經濟設定
                                <InfoHint>character owner 注入夢境的價格（ENDLESS）與是否暫停，即時上鏈。</InfoHint>
                            </h3>
                            <div className="mt-4"><DreamConfigPanel initial={dreamConfig} /></div>
                        </div>
                        <div className="rounded border border-hairline bg-canvas/40 p-4">
                            <h3 className="flex items-center gap-1.5 font-serif text-lg tracking-wide text-ink">
                                開發工具
                                <InfoHint>
                                    班主日常經營用不到的工具都收在這裡：開局、手動推進世界、出版補產、逐項除錯、角色工坊，
                                    以及重放任何 LLM 呼叫。日常這些都已由自治迴圈（world-loop + Showrunner 心跳）接管。
                                </InfoHint>
                            </h3>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <Link href="/admin/stage" className="es-choice-card">
                                    <div className="font-medium text-ink">工坊</div>
                                    <div className="mt-1 text-2xs tracking-widest text-mute">
                                        開局 · 推進 · 出版 · 除錯 · 角色
                                    </div>
                                </Link>
                                <Link href="/admin/prompt-lab" className="es-choice-card">
                                    <div className="font-medium text-ink">Prompt Lab</div>
                                    <div className="mt-1 text-2xs tracking-widest text-mute">
                                        重放 / 調試任何 LLM 呼叫
                                    </div>
                                </Link>
                            </div>
                        </div>
                    </DeployAdminGuard>
                </div>
            </main>
        </>
    );
}
