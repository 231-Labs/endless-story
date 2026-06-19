import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { WorkshopLauncher } from './WorkshopLauncher';
import { listAllRecruitments } from '@/lib/actions/recruitments-store';
import { charactersApi, scenesApi } from '@/lib/api/index';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';

export const metadata = {
    title: '工坊 | 班主後台',
};

export const dynamic = 'force-dynamic';

/** Admin workshop — every dev/test/maintenance panel behind one launcher. */
export default async function AdminWorkshopPage() {
    const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
    const [characters, scenes, recruitments] = await Promise.all([
        charactersApi.listCharacters(),
        sagaId ? scenesApi.listScenes(sagaId) : Promise.resolve([]),
        listAllRecruitments().catch(() => []),
    ]);
    const roleSlots = recruitments.map((r) => ({
        specialty: String(r.specialty),
        roleIntent: r.roleIntent,
        genderRequirement: r.genderRequirement,
    }));
    return (
        <>
            <SiteNav />
            <main className="mx-auto max-w-5xl px-4 py-8 sm:px-10 sm:py-16 pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]">
                <PageLeadTitleBlock
                    eyebrow="WORKSHOP"
                    eyebrowMobile="WORKSHOP"
                    title="工坊"
                    meta="開發 · 測試 · 維護工具（日常已由自治迴圈接管）"
                />
                <div className="mt-12">
                    <SagaAdminGuard>
                        <WorkshopLauncher characters={characters} scenes={scenes} roleSlots={roleSlots} />
                    </SagaAdminGuard>
                </div>
            </main>
        </>
    );
}
