import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Cast workshop folded into /admin/stage; redirect keeps old links working. */
export default function AdminTroupePage() {
    redirect('/admin/stage');
}
