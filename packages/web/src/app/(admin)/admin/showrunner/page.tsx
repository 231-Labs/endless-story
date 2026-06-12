import { redirect } from 'next/navigation';

/** The Showrunner cockpit moved to the admin landing page (駕駛艙). */
export default function AdminShowrunnerPage() {
    redirect('/admin');
}
