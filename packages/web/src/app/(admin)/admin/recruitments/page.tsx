import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { listAllRecruitments } from '@/lib/actions/recruitments-store';
import { RecruitmentsPanel } from './RecruitmentsPanel';

export const metadata = {
    title: '徵召管理 | 班主後台',
};

export const dynamic = 'force-dynamic';

export default async function AdminRecruitmentsPage() {
    const all = await listAllRecruitments();
    return (
        <>
            <SiteNav />
            <main className="mx-auto max-w-5xl px-4 py-8 sm:px-10 sm:py-16 pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]">
                <PageLeadTitleBlock
                    eyebrow="RECRUITMENTS"
                    eyebrowMobile="徵召"
                    title="徵召管理"
                    meta="發布、編輯、停用職缺"
                />
                <div className="mt-12">
                    <SagaAdminGuard>
                        <RecruitmentsPanel initial={all} />
                    </SagaAdminGuard>
                </div>
            </main>
        </>
    );
}
