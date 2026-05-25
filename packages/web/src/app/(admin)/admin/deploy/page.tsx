import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { getDeploymentStatus } from '@/lib/actions/deployment-status';
import { listStoryPresets } from '@/lib/stories/loader';
import { DeployPanel } from './DeployPanel';

export const metadata = {
    title: '部署管理 | 班主後台',
};

export const dynamic = 'force-dynamic';

export default async function DeployPage() {
    const [status, presets] = await Promise.all([getDeploymentStatus(), listStoryPresets()]);
    return (
        <>
            <SiteNav />
            <main className="mx-auto max-w-4xl px-4 py-8 sm:px-10 sm:py-16 pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]">
                <PageLeadTitleBlock
                    eyebrow="DEPLOYMENT"
                    eyebrowMobile="DEPLOY"
                    title="梨園地基"
                    meta="一鍵部署 / 種子化 / 開職缺"
                />
                <div className="mt-12">
                    <DeployPanel initialStatus={status} presets={presets} />
                </div>
            </main>
        </>
    );
}
