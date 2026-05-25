import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { AdminPanel } from './AdminPanel';

export const metadata = {
  title: '班主後台 | 無盡敘界',
};

export default function AdminPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-10 sm:py-16 pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]">
        <PageLeadTitleBlock
          eyebrow="ADMINISTRATION"
          eyebrowMobile="ADMIN"
          title="班主後台"
          meta="管理系統與自動化腳本"
        />

        <div className="mt-12">
          <SagaAdminGuard>
            <AdminPanel />
          </SagaAdminGuard>
        </div>
      </main>
    </>
  );
}
