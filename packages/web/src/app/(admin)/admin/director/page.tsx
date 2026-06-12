import { redirect } from 'next/navigation';

/**
 * The old 19-panel 導演後台 was split in the IA cleanup (NARRATIVE_AGENTS.md
 * §12): cast work → /admin/troupe, manual narrative overrides → /admin/stage,
 * dream economy → /admin/deploy(系統), daily driving → /admin (駕駛艙).
 * Panel components still live in this folder and are imported across routes.
 */
export default function AdminDirectorPage() {
    redirect('/admin/stage');
}
