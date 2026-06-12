import { SiteNav } from '@/components/home/SiteNav';
import { SubscriptionsContent } from '@/components/subscribe/SubscriptionsContent';

export const metadata = { title: '我的訂閱' };

export const dynamic = 'force-dynamic';

export default function SubscriptionsPage() {
  return (
    <main className="min-h-screen">
      <SiteNav />
      <SubscriptionsContent />
    </main>
  );
}
