import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { SiteNav } from '@/components/home/SiteNav';
import { PromptLabPanel } from './PromptLabPanel';

export const metadata = {
    title: 'Prompt Lab | 無盡敘界',
};

export default function PromptLabPage() {
    return (
        <>
            <SiteNav />
            <main className="mx-auto max-w-7xl px-4 py-8 pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] sm:px-8 sm:py-14">
                <PageLeadTitleBlock
                    eyebrow="PROMPT LAB"
                    eyebrowMobile="LAB"
                    title="Prompt Lab"
                    meta="分階段檢視 LLM 輸入、prompt、輸出與 parser"
                />

                <div className="mt-10">
                    <SagaAdminGuard>
                        <PromptLabPanel />
                    </SagaAdminGuard>
                </div>
            </main>
        </>
    );
}
