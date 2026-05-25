import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
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
            <main className="mx-auto max-w-5xl px-4 py-8 sm:px-10 sm:py-16">
                <PageLeadTitleBlock
                    eyebrow="RECRUITMENTS"
                    eyebrowMobile="徵召"
                    title="徵召管理"
                    meta="發布、編輯、停用職缺"
                />
                <div className="mt-12">
                    <RecruitmentsPanel initial={all} />
                </div>
            </main>
        </>
    );
}
