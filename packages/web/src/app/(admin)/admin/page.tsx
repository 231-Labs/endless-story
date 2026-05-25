import Link from 'next/link';
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

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AdminLinkCard
            href="/admin/deploy"
            title="梨園地基"
            sub="部署合約、種子化、跑 e2e 驗證"
          />
          <AdminLinkCard
            href="/admin/recruitments"
            title="徵召管理"
            sub="發布、編輯、停用職缺"
          />
        </div>

        <div className="mt-8">
          <AdminPanel />
        </div>
      </main>
    </>
  );
}

function AdminLinkCard({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="es-choice-card flex flex-col gap-1 transition-all hover:border-cinnabar/40"
    >
      <span className="font-serif text-lg text-ink">{title}</span>
      <span className="text-sm text-mute">{sub}</span>
    </Link>
  );
}
