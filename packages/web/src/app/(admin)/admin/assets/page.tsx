import { SiteNav } from '@/components/home/SiteNav';
import { PageLeadTitleBlock } from '@/components/common/PageLeadTitleBlock';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { AssetsPanel } from './AssetsPanel';

export const metadata = {
  title: 'Walrus 資產 | 無盡敘界',
};

export default function AssetsAdminPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-10 sm:py-16 pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]">
        <PageLeadTitleBlock
          eyebrow="WALRUS ASSETS"
          eyebrowMobile="ASSETS"
          title="資產管理"
          meta="上傳 · 上下架 · 到期追蹤 · 續租（hero 影片 / 角色圖 / 場景 / 章回）"
        />

        <div className="mt-12">
          <SagaAdminGuard>
            <AssetsPanel />
          </SagaAdminGuard>
        </div>
      </main>
    </>
  );
}
