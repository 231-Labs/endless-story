import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { AdminPanel } from './AdminPanel';

export const metadata = {
  title: '班主後台 | 無盡敘界',
};

export default function AdminPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-10 sm:py-16">
        <PageLeadTitleBlock
          eyebrow="ADMINISTRATION"
          eyebrowMobile="ADMIN"
          title="班主後台"
          meta="管理系統與自動化腳本"
        />
        
        <div className="mt-12">
          <AdminPanel />
        </div>
      </main>
    </>
  );
}
